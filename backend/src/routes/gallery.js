import crypto from 'crypto';
import express from 'express';
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
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { AWS_ENDPOINT, awsClientConfig } from '../awsConfig.js';
import {
  convertHeicToJpeg,
  hasSupportedDimensions,
  isHeicLikeImage,
  readImageInfo,
} from '../services/imageProcessing.js';

dotenv.config();

const router = express.Router();
const db = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({
  ...awsClientConfig,
  forcePathStyle: Boolean(AWS_ENDPOINT),
});

const GALLERY_TABLE = process.env.GALLERY_TABLE || 'gallery';
const GALLERY_ASSETS_BUCKET = process.env.GALLERY_ASSETS_BUCKET;
const ASSET_PREFIX = 'static/photos/gallery';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const isLocalAws = Boolean(AWS_ENDPOINT) && process.env.NODE_ENV !== 'production';

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const cleanText = (value, maxLength = 300) => String(value ?? '')
  .replace(/\0/g, '')
  .trim()
  .slice(0, maxLength);

const slugify = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

const safeUploadFilename = (value, extension) => {
  const parts = String(value || 'gallery-photo').split('.');
  if (parts.length > 1) parts.pop();
  const base = slugify(parts.join('-')) || 'gallery-photo';
  return `${base}.${extension}`;
};

// Local dev has no CloudFront in front of the bucket, so the API streams the object instead.
const photoUrl = (assetKey) => (isLocalAws ? `/api/gallery/assets/${assetKey}` : `/${assetKey}`);

const toPublicPhoto = (item) => ({
  id: item.id,
  url: photoUrl(item.assetKey),
  caption: item.caption || '',
  width: item.width,
  height: item.height,
});

const toAdminPhoto = (item) => ({
  ...item,
  url: photoUrl(item.assetKey),
});

const sortPhotos = (items) => [...items].sort((a, b) => (
  Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
  || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
));

let bucketReady = false;
const ensureLocalBucket = async () => {
  if (!isLocalAws || !GALLERY_ASSETS_BUCKET || bucketReady) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: GALLERY_ASSETS_BUCKET }));
  } catch (error) {
    await s3.send(new CreateBucketCommand({ Bucket: GALLERY_ASSETS_BUCKET }));
  }
  bucketReady = true;
};

const prepareUpload = async (buffer) => {
  if (!buffer.length) return { error: 'The selected photo is empty.' };
  if (buffer.length > MAX_UPLOAD_BYTES) return { error: 'Each photo must be 5 MB or smaller.' };

  let photoBuffer = buffer;
  let convertedFromHeic = false;
  if (isHeicLikeImage(buffer)) {
    try {
      photoBuffer = await convertHeicToJpeg(buffer, MAX_UPLOAD_BYTES);
      convertedFromHeic = true;
    } catch (error) {
      return { error: 'Could not read this HEIC/HEIF photo. Please export it as JPG and upload again.' };
    }
  }

  const image = readImageInfo(photoBuffer);
  if (!image) return { error: 'Only valid JPG and PNG photos are accepted.' };
  if (photoBuffer.length > MAX_UPLOAD_BYTES) {
    return { error: 'Converted photo must be 5 MB or smaller. Please upload a smaller image.' };
  }
  if (!hasSupportedDimensions(image)) return { error: 'Photo dimensions are not supported.' };

  return { image, buffer: photoBuffer, convertedFromHeic };
};

router.get('/', asyncRoute(async (req, res) => {
  const result = await db.send(new ScanCommand({
    TableName: GALLERY_TABLE,
    FilterExpression: '#published = :published',
    ExpressionAttributeNames: { '#published': 'published' },
    ExpressionAttributeValues: { ':published': true },
  }));
  return res.json(sortPhotos(result.Items || []).map(toPublicPhoto));
}));

router.get('/all', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const result = await db.send(new ScanCommand({ TableName: GALLERY_TABLE }));
  return res.json(sortPhotos(result.Items || []).map(toAdminPhoto));
}));

router.post('/uploads', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  if (!GALLERY_ASSETS_BUCKET) {
    return res.status(400).json({ message: 'Gallery asset upload bucket is not configured.' });
  }

  const { fileName, data } = req.body;
  if (!fileName || !data) {
    return res.status(400).json({ message: 'File name and image data are required.' });
  }

  const buffer = Buffer.from(String(data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  const upload = await prepareUpload(buffer);
  if (upload.error) return res.status(400).json({ message: upload.error });

  await ensureLocalBucket();

  const id = crypto.randomBytes(12).toString('hex');
  const assetKey = `${ASSET_PREFIX}/${Date.now()}-${safeUploadFilename(fileName, upload.image.extension)}`;
  await s3.send(new PutObjectCommand({
    Bucket: GALLERY_ASSETS_BUCKET,
    Key: assetKey,
    Body: upload.buffer,
    ContentType: upload.image.type,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const now = new Date().toISOString();
  const item = {
    id,
    assetKey,
    caption: cleanText(req.body.caption),
    published: req.body.published !== false,
    sortOrder: Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0,
    contentType: upload.image.type,
    width: upload.image.width,
    height: upload.image.height,
    size: upload.buffer.length,
    originalFileName: cleanText(fileName, 160),
    convertedFromHeic: upload.convertedFromHeic,
    uploadedBy: req.user?.email || 'admin',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.send(new PutCommand({
      TableName: GALLERY_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (error) {
    await s3.send(new DeleteObjectCommand({ Bucket: GALLERY_ASSETS_BUCKET, Key: assetKey }));
    throw error;
  }

  return res.status(201).json(toAdminPhoto(item));
}));

router.patch('/:id', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const existing = await db.send(new GetCommand({ TableName: GALLERY_TABLE, Key: { id: req.params.id } }));
  if (!existing.Item) return res.status(404).json({ message: 'Gallery photo not found.' });

  const item = {
    ...existing.Item,
    caption: req.body.caption === undefined ? existing.Item.caption : cleanText(req.body.caption),
    published: typeof req.body.published === 'boolean' ? req.body.published : existing.Item.published,
    sortOrder: Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : existing.Item.sortOrder,
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.email || 'admin',
  };

  await db.send(new PutCommand({ TableName: GALLERY_TABLE, Item: item }));
  return res.json(toAdminPhoto(item));
}));

router.delete('/:id', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const existing = await db.send(new GetCommand({ TableName: GALLERY_TABLE, Key: { id: req.params.id } }));
  if (!existing.Item) return res.status(404).json({ message: 'Gallery photo not found.' });

  await db.send(new DeleteCommand({ TableName: GALLERY_TABLE, Key: { id: req.params.id } }));

  if (GALLERY_ASSETS_BUCKET && existing.Item.assetKey) {
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: GALLERY_ASSETS_BUCKET,
        Key: existing.Item.assetKey,
      }));
    } catch (error) {
      console.error(`Gallery photo ${req.params.id} removed but its file could not be deleted.`, error);
    }
  }

  return res.json({ message: 'Gallery photo deleted.' });
}));

router.get(/^\/assets\/(.+)$/, asyncRoute(async (req, res) => {
  if (!GALLERY_ASSETS_BUCKET) return res.status(404).send();
  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: GALLERY_ASSETS_BUCKET,
      Key: req.params[0],
    }));
    res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');
    res.setHeader('Cache-Control', result.CacheControl || 'public, max-age=3600');
    return result.Body.pipe(res);
  } catch (error) {
    return res.status(404).send();
  }
}));

export default router;
