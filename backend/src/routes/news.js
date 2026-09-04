import express from 'express';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { awsClientConfig } from '../awsConfig.js';

dotenv.config();
const router = express.Router();

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const s3 = new S3Client(awsClientConfig);

const NEWS_TABLE = process.env.NEWS_TABLE || 'news_posts';
const NEWS_ASSETS_BUCKET = process.env.NEWS_ASSETS_BUCKET;

const sortNews = (items) => [...items].sort((a, b) => (
  new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0)
));

const slugify = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90);

const normalizePhotos = (photos) => (Array.isArray(photos) ? photos : [])
  .map((photo) => {
    if (typeof photo === 'string') return { url: photo, caption: '' };
    return {
      url: photo?.url || '',
      caption: photo?.caption || '',
    };
  })
  .filter((photo) => photo.url);

const normalizePostInput = (body, existing = {}) => {
  const title = String(body.title || existing.title || '').trim();
  const slug = slugify(body.slug || existing.slug || title);

  return {
    slug,
    title,
    excerpt: String(body.excerpt || existing.excerpt || '').trim(),
    body: String(body.body || existing.body || '').trim(),
    author: String(body.author || existing.author || 'Wyndham Tuskers Committee').trim(),
    category: String(body.category || existing.category || 'Club news').trim(),
    coverImageUrl: String(body.coverImageUrl || existing.coverImageUrl || '').trim(),
    supportingPhotos: normalizePhotos(body.supportingPhotos ?? existing.supportingPhotos),
    status: body.status || existing.status || 'draft',
    publishedAt: body.publishedAt || existing.publishedAt || new Date().toISOString(),
    viewCount: Number(existing.viewCount || 0),
  };
};

const validatePost = (post) => {
  if (!post.title || !post.slug) return 'News title is required.';
  if (!post.excerpt) return 'News excerpt is required.';
  if (!post.body) return 'News body is required.';
  return '';
};

const safeUploadFilename = (value) => {
  const parts = String(value || 'news-photo.jpg').split('.');
  const extension = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
  const base = slugify(parts.join('.') || 'news-photo') || 'news-photo';
  return `${base}.${extension || 'jpg'}`;
};

router.get('/', async (req, res) => {
  const result = await db.send(new ScanCommand({
    TableName: NEWS_TABLE,
    FilterExpression: '#status = :published',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':published': 'published' },
  }));

  return res.json(sortNews(result.Items || []));
});

router.get('/all', verifyToken, requireAdmin, async (req, res) => {
  const result = await db.send(new ScanCommand({ TableName: NEWS_TABLE }));
  return res.json(sortNews(result.Items || []));
});

router.post('/uploads', verifyToken, requireAdmin, async (req, res) => {
  if (!NEWS_ASSETS_BUCKET) {
    return res.status(400).json({ message: 'News asset upload bucket is not configured.' });
  }

  const { fileName, contentType, data } = req.body;
  if (!fileName || !data) {
    return res.status(400).json({ message: 'File name and image data are required.' });
  }

  const buffer = Buffer.from(String(data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buffer.length === 0) {
    return res.status(400).json({ message: 'Uploaded image is empty.' });
  }
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ message: 'Image upload must be 5 MB or smaller.' });
  }

  const key = `static/photos/news/${Date.now()}-${safeUploadFilename(fileName)}`;
  await s3.send(new PutObjectCommand({
    Bucket: NEWS_ASSETS_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return res.status(201).json({ url: `/${key}` });
});

router.get('/:slug', async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: NEWS_TABLE, Key: { slug: req.params.slug } }));
  if (!result.Item || result.Item.status !== 'published') {
    return res.status(404).json({ message: 'News post not found.' });
  }

  const updated = await db.send(new UpdateCommand({
    TableName: NEWS_TABLE,
    Key: { slug: req.params.slug },
    UpdateExpression: 'ADD #viewCount :one SET #lastViewedAt = :lastViewedAt',
    ExpressionAttributeNames: {
      '#viewCount': 'viewCount',
      '#lastViewedAt': 'lastViewedAt',
    },
    ExpressionAttributeValues: {
      ':one': 1,
      ':lastViewedAt': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  }));

  return res.json(updated.Attributes);
});

router.post('/', verifyToken, requireAdmin, async (req, res) => {
  const post = normalizePostInput(req.body);
  const validationError = validatePost(post);
  if (validationError) return res.status(400).json({ message: validationError });

  const item = {
    ...post,
    id: crypto.randomBytes(12).toString('hex'),
    createdBy: req.user?.email || 'admin',
    viewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.send(new PutCommand({
    TableName: NEWS_TABLE,
    Item: item,
    ConditionExpression: 'attribute_not_exists(slug)',
  }));
  return res.status(201).json(item);
});

router.patch('/:slug', verifyToken, requireAdmin, async (req, res) => {
  const existingResult = await db.send(new GetCommand({ TableName: NEWS_TABLE, Key: { slug: req.params.slug } }));
  if (!existingResult.Item) return res.status(404).json({ message: 'News post not found.' });

  const post = normalizePostInput(req.body, existingResult.Item);
  const validationError = validatePost(post);
  if (validationError) return res.status(400).json({ message: validationError });

  if (post.slug !== req.params.slug) {
    await db.send(new DeleteCommand({ TableName: NEWS_TABLE, Key: { slug: req.params.slug } }));
    const replacement = {
      ...existingResult.Item,
      ...post,
      updatedAt: new Date().toISOString(),
    };
    await db.send(new PutCommand({ TableName: NEWS_TABLE, Item: replacement }));
    return res.json(replacement);
  }

  const result = await db.send(new UpdateCommand({
    TableName: NEWS_TABLE,
    Key: { slug: req.params.slug },
    UpdateExpression: 'SET #title = :title, #excerpt = :excerpt, #body = :body, #author = :author, #category = :category, #coverImageUrl = :coverImageUrl, #supportingPhotos = :supportingPhotos, #status = :status, #publishedAt = :publishedAt, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#title': 'title',
      '#excerpt': 'excerpt',
      '#body': 'body',
      '#author': 'author',
      '#category': 'category',
      '#coverImageUrl': 'coverImageUrl',
      '#supportingPhotos': 'supportingPhotos',
      '#status': 'status',
      '#publishedAt': 'publishedAt',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':title': post.title,
      ':excerpt': post.excerpt,
      ':body': post.body,
      ':author': post.author,
      ':category': post.category,
      ':coverImageUrl': post.coverImageUrl,
      ':supportingPhotos': post.supportingPhotos,
      ':status': post.status,
      ':publishedAt': post.publishedAt,
      ':updatedAt': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  }));

  return res.json(result.Attributes);
});

router.delete('/:slug', verifyToken, requireAdmin, async (req, res) => {
  await db.send(new DeleteCommand({ TableName: NEWS_TABLE, Key: { slug: req.params.slug } }));
  return res.status(204).send();
});

export default router;
