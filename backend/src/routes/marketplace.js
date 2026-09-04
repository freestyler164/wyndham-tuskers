import express from 'express';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { AWS_ENDPOINT, awsClientConfig } from '../awsConfig.js';

dotenv.config();
const router = express.Router();

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const s3 = new S3Client({
  ...awsClientConfig,
  forcePathStyle: Boolean(AWS_ENDPOINT),
});

const MARKETPLACE_TABLE = process.env.MARKETPLACE_TABLE || 'marketplace';
const MARKETPLACE_ASSETS_BUCKET = process.env.MARKETPLACE_ASSETS_BUCKET;
const isLocalAws = Boolean(AWS_ENDPOINT) && process.env.NODE_ENV !== 'production';

const categories = [
  'Food & Catering',
  'Finance & Mortgage',
  'Real Estate',
  'Sports & Fitness',
  'Trades & Services',
  'Retail & Shopping',
  'Professional Services',
  'Education & Training',
  'Health & Wellness',
  'Other',
];

const slugify = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90);

const asList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeGallery = (gallery) => (Array.isArray(gallery) ? gallery : [])
  .map((photo) => {
    if (typeof photo === 'string') return { url: photo, caption: '' };
    return {
      url: String(photo?.url || '').trim(),
      caption: String(photo?.caption || '').trim(),
    };
  })
  .filter((photo) => photo.url);

const normalizeBusinessInput = (body, existing = {}) => {
  const name = String(body.name ?? existing.name ?? '').trim();
  const id = slugify(body.id || body.slug || existing.id || existing.slug || name);
  const category = categories.includes(body.category) ? body.category : String(body.category || existing.category || 'Other').trim();

  return {
    id,
    slug: id,
    name,
    category: categories.includes(category) ? category : 'Other',
    description: String(body.description ?? existing.description ?? '').trim(),
    fullDescription: String(body.fullDescription ?? existing.fullDescription ?? '').trim(),
    services: asList(body.services ?? existing.services),
    contactPerson: String(body.contactPerson ?? existing.contactPerson ?? '').trim(),
    phone: String(body.phone ?? existing.phone ?? '').trim(),
    email: String(body.email ?? existing.email ?? '').trim(),
    website: String(body.website ?? existing.website ?? '').trim(),
    whatsapp: String(body.whatsapp ?? existing.whatsapp ?? '').trim(),
    logoUrl: String(body.logoUrl ?? existing.logoUrl ?? '').trim(),
    bannerUrl: String(body.bannerUrl ?? existing.bannerUrl ?? '').trim(),
    menuPdfUrl: String(body.menuPdfUrl ?? existing.menuPdfUrl ?? '').trim(),
    gallery: normalizeGallery(body.gallery ?? existing.gallery),
    featured: Boolean(body.featured ?? existing.featured ?? false),
    active: Boolean(body.active ?? existing.active ?? true),
  };
};

const validateBusiness = (business) => {
  if (!business.name || !business.id) return 'Business name is required.';
  if (!business.category) return 'Business category is required.';
  if (!business.description) return 'Short description is required.';
  if (!business.contactPerson) return 'Contact person is required.';
  return '';
};

const sortBusinesses = (items) => [...items].sort((a, b) => {
  if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
  return String(a.name || '').localeCompare(String(b.name || ''));
});

const filterBusinesses = (items, { category, search } = {}) => {
  const normalizedCategory = String(category || '').trim();
  const query = String(search || '').trim().toLowerCase();

  return items.filter((item) => {
    if (normalizedCategory && normalizedCategory !== 'All' && item.category !== normalizedCategory) return false;
    if (!query) return true;
    return [
      item.name,
      item.category,
      item.description,
      item.fullDescription,
      item.contactPerson,
      ...(item.services || []),
    ].join(' ').toLowerCase().includes(query);
  });
};

const safeUploadFilename = (value) => {
  const parts = String(value || 'marketplace-photo.jpg').split('.');
  const extension = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
  const base = slugify(parts.join('.') || 'marketplace-photo') || 'marketplace-photo';
  return `${base}.${extension || 'jpg'}`;
};

let bucketReady = false;
const ensureLocalBucket = async () => {
  if (!isLocalAws || !MARKETPLACE_ASSETS_BUCKET || bucketReady) return;

  try {
    await s3.send(new HeadBucketCommand({ Bucket: MARKETPLACE_ASSETS_BUCKET }));
  } catch (error) {
    await s3.send(new CreateBucketCommand({ Bucket: MARKETPLACE_ASSETS_BUCKET }));
  }

  bucketReady = true;
};

router.get('/', async (req, res) => {
  const result = await db.send(new ScanCommand({
    TableName: MARKETPLACE_TABLE,
    FilterExpression: '#active = :active',
    ExpressionAttributeNames: { '#active': 'active' },
    ExpressionAttributeValues: { ':active': true },
  }));

  return res.json(sortBusinesses(filterBusinesses(result.Items || [], req.query)));
});

router.get('/categories', async (req, res) => {
  return res.json(categories);
});

router.get('/all', verifyToken, requireAdmin, async (req, res) => {
  const result = await db.send(new ScanCommand({ TableName: MARKETPLACE_TABLE }));
  return res.json(sortBusinesses(result.Items || []));
});

router.post('/uploads', verifyToken, requireAdmin, async (req, res) => {
  if (!MARKETPLACE_ASSETS_BUCKET) {
    return res.status(400).json({ message: 'Marketplace asset upload bucket is not configured.' });
  }

  const { fileName, contentType, data } = req.body;
  if (!fileName || !data) {
    return res.status(400).json({ message: 'File name and image data are required.' });
  }

  const buffer = Buffer.from(String(data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buffer.length === 0) return res.status(400).json({ message: 'Uploaded image is empty.' });
  if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ message: 'Image upload must be 5 MB or smaller.' });

  await ensureLocalBucket();

  const key = `static/photos/marketplace/${Date.now()}-${safeUploadFilename(fileName)}`;
  await s3.send(new PutObjectCommand({
    Bucket: MARKETPLACE_ASSETS_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return res.status(201).json({ url: isLocalAws ? `/api/marketplace/assets/${key}` : `/${key}` });
});

router.get(/^\/assets\/(.+)$/, async (req, res) => {
  if (!MARKETPLACE_ASSETS_BUCKET) return res.status(404).send();

  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: MARKETPLACE_ASSETS_BUCKET,
      Key: req.params[0],
    }));

    res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');
    res.setHeader('Cache-Control', result.CacheControl || 'public, max-age=3600');
    return result.Body.pipe(res);
  } catch (error) {
    return res.status(404).send();
  }
});

router.get('/:slug', async (req, res) => {
  const result = await db.send(new GetCommand({
    TableName: MARKETPLACE_TABLE,
    Key: { id: req.params.slug },
  }));

  if (!result.Item || !result.Item.active) {
    return res.status(404).json({ message: 'Business listing not found.' });
  }

  return res.json(result.Item);
});

router.post('/', verifyToken, requireAdmin, async (req, res) => {
  const business = normalizeBusinessInput(req.body);
  const validationError = validateBusiness(business);
  if (validationError) return res.status(400).json({ message: validationError });

  const now = new Date().toISOString();
  const item = {
    ...business,
    createdBy: req.user?.email || 'admin',
    importId: crypto.randomBytes(8).toString('hex'),
    createdAt: now,
    updatedAt: now,
  };

  await db.send(new PutCommand({
    TableName: MARKETPLACE_TABLE,
    Item: item,
    ConditionExpression: 'attribute_not_exists(id)',
  }));

  return res.status(201).json(item);
});

router.patch('/:id', verifyToken, requireAdmin, async (req, res) => {
  const existingResult = await db.send(new GetCommand({
    TableName: MARKETPLACE_TABLE,
    Key: { id: req.params.id },
  }));
  if (!existingResult.Item) return res.status(404).json({ message: 'Business listing not found.' });

  const business = normalizeBusinessInput(req.body, existingResult.Item);
  const validationError = validateBusiness(business);
  if (validationError) return res.status(400).json({ message: validationError });

  const item = {
    ...existingResult.Item,
    ...business,
    updatedAt: new Date().toISOString(),
  };

  if (business.id !== req.params.id) {
    await db.send(new DeleteCommand({ TableName: MARKETPLACE_TABLE, Key: { id: req.params.id } }));
  }

  await db.send(new PutCommand({ TableName: MARKETPLACE_TABLE, Item: item }));
  return res.json(item);
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  await db.send(new DeleteCommand({ TableName: MARKETPLACE_TABLE, Key: { id: req.params.id } }));
  return res.status(204).send();
});

export default router;
