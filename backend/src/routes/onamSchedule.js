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
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { verifyToken, requireAdminOrScope } from '../middleware/auth.js';
import { AWS_ENDPOINT, awsClientConfig } from '../awsConfig.js';

const router = express.Router();
const db = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({
  ...awsClientConfig,
  forcePathStyle: Boolean(AWS_ENDPOINT),
});

export const ONAM_SCHEDULE_SCOPE = 'onam-schedule:manage';
export const ONAM_SCHEDULE_TABLE = process.env.ONAM_SCHEDULE_TABLE || 'onam_schedule';
const ONAM_SCHEDULE_ASSETS_BUCKET = process.env.ONAM_SCHEDULE_ASSETS_BUCKET
  || process.env.MARKETPLACE_ASSETS_BUCKET
  || process.env.NEWS_ASSETS_BUCKET;
const isLocalAws = Boolean(AWS_ENDPOINT) && process.env.NODE_ENV !== 'production';
const MAX_BANNER_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_SIDE = 10_000;

const VALID_EVENT_STATUSES = new Set(['upcoming', 'live', 'completed']);
const VALID_ITEM_STATUSES = new Set(['upcoming', 'live', 'completed']);

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const cleanText = (value, maxLength = 500) => String(value || '')
  .replace(/\0/g, '')
  .trim()
  .slice(0, maxLength);

const slugify = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90);

const safeUploadFilename = (value, extension = 'jpg') => {
  const parts = String(value || `onam-banner.${extension}`).split('.');
  const base = slugify(parts.slice(0, -1).join('.') || parts[0] || 'onam-banner') || 'onam-banner';
  return `${base}.${extension}`;
};

const decodeBase64 = (value) => {
  const raw = String(value || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(raw, 'base64');
};

const pngDimensions = (buffer) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  return { type: 'image/png', extension: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const jpegDimensions = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xd8) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + segmentLength + 2 > buffer.length) break;
    if (startOfFrameMarkers.has(marker)) {
      return {
        type: 'image/jpeg',
        extension: 'jpg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += segmentLength + 2;
  }
  return null;
};

const validateBannerImage = (buffer) => {
  if (!buffer.length) return { error: 'Banner image is empty.' };
  if (buffer.length > MAX_BANNER_IMAGE_BYTES) return { error: 'Banner image must be 5 MB or smaller.' };
  const image = pngDimensions(buffer) || jpegDimensions(buffer);
  if (!image) return { error: 'Only valid JPG and PNG banner images are accepted.' };
  if (image.width < 320 || image.height < 180) return { error: 'Banner image dimensions are too small.' };
  if (image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE || image.width * image.height > MAX_IMAGE_PIXELS) {
    return { error: 'Banner image dimensions are too large.' };
  }
  return { image };
};

let bucketReady = false;
const ensureLocalBucket = async () => {
  if (!isLocalAws || !ONAM_SCHEDULE_ASSETS_BUCKET || bucketReady) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: ONAM_SCHEDULE_ASSETS_BUCKET }));
  } catch (error) {
    await s3.send(new CreateBucketCommand({ Bucket: ONAM_SCHEDULE_ASSETS_BUCKET }));
  }
  bucketReady = true;
};

export const defaultOnamScheduleConfig = () => ({
  id: 'config',
  title: 'Onam 2026',
  eyebrow: 'Wyndham Tuskers presents',
  description: "A day of flowers, feasts, and togetherness — join the Wyndham Tuskers community as we celebrate Kerala's harvest festival with games, dance, and a grand Sadya.",
  eventDate: '2026-08-08',
  venue: 'Bacchus Marsh Public Hall',
  eventStatus: 'upcoming',
  published: false,
  menuLabel: 'Onam 2026',
  bannerImageUrl: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  updatedBy: 'default',
});

const sanitizeConfig = (body = {}, existing = defaultOnamScheduleConfig(), userEmail = 'admin') => ({
  ...existing,
  id: 'config',
  title: cleanText(body.title, 140) || existing.title,
  eyebrow: cleanText(body.eyebrow, 120) || existing.eyebrow,
  description: cleanText(body.description, 700),
  eventDate: cleanText(body.eventDate, 20),
  venue: cleanText(body.venue, 180),
  eventStatus: VALID_EVENT_STATUSES.has(body.eventStatus) ? body.eventStatus : existing.eventStatus,
  published: typeof body.published === 'boolean' ? body.published : Boolean(existing.published),
  menuLabel: cleanText(body.menuLabel, 40) || 'Onam 2026',
  bannerImageUrl: cleanText(body.bannerImageUrl ?? existing.bannerImageUrl, 600),
  updatedAt: new Date().toISOString(),
  updatedBy: userEmail,
});

const sanitizeScheduleItem = (body = {}, existing = {}, userEmail = 'admin') => {
  const now = new Date().toISOString();
  return {
    ...existing,
    id: existing.id || `item#${crypto.randomUUID()}`,
    type: 'scheduleItem',
    timeLabel: cleanText(body.timeLabel, 40),
    title: cleanText(body.title, 180),
    location: cleanText(body.location, 160),
    // Optional public blurb; contact/program ops fields stay admin-only.
    description: cleanText(body.description ?? existing.description, 1200),
    entryId: cleanText(body.entryId ?? existing.entryId, 20),
    programType: cleanText(body.programType ?? existing.programType, 40),
    duration: cleanText(body.duration ?? existing.duration, 40),
    contactPerson: cleanText(body.contactPerson ?? existing.contactPerson, 100),
    mobile: cleanText(body.mobile ?? existing.mobile, 40),
    ageGroup: cleanText(body.ageGroup ?? existing.ageGroup, 40),
    performanceFormat: cleanText(body.performanceFormat ?? existing.performanceFormat, 40),
    teamName: cleanText(body.teamName ?? existing.teamName, 120),
    choreographer: cleanText(body.choreographer ?? existing.choreographer, 200),
    participants: cleanText(body.participants ?? existing.participants, 800),
    status: VALID_ITEM_STATUSES.has(body.status) ? body.status : existing.status || 'upcoming',
    published: typeof body.published === 'boolean' ? body.published : existing.published ?? true,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : Number(existing.sortOrder || 0),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    updatedBy: userEmail,
  };
};

const toPublicScheduleItem = (item) => ({
  id: item.id,
  timeLabel: item.timeLabel || '',
  title: item.title || '',
  location: item.location || '',
  description: item.description || '',
  status: item.status || 'upcoming',
  sortOrder: item.sortOrder || 0,
});

const sortItems = (items) => [...items].sort((a, b) => (
  Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
  || String(a.timeLabel || '').localeCompare(String(b.timeLabel || ''))
  || String(a.title || '').localeCompare(String(b.title || ''))
));

export const isOnamSchedulePublic = (config) => (
  Boolean(config?.published) && config.eventStatus !== 'completed'
);

export const getOnamScheduleConfig = async () => {
  const result = await db.send(new GetCommand({ TableName: ONAM_SCHEDULE_TABLE, Key: { id: 'config' } }));
  return result.Item || defaultOnamScheduleConfig();
};

const getAllScheduleItems = async () => {
  const result = await db.send(new ScanCommand({ TableName: ONAM_SCHEDULE_TABLE }));
  return sortItems((result.Items || []).filter((item) => item.type === 'scheduleItem'));
};

router.get('/', asyncRoute(async (req, res) => {
  const [config, items] = await Promise.all([getOnamScheduleConfig(), getAllScheduleItems()]);
  if (!isOnamSchedulePublic(config)) {
    return res.json({ config: { ...config, published: false }, items: [] });
  }
  return res.json({
    config,
    items: items.filter((item) => item.published).map(toPublicScheduleItem),
  });
}));

router.get(/^\/assets\/(.+)$/, asyncRoute(async (req, res) => {
  if (!ONAM_SCHEDULE_ASSETS_BUCKET) return res.status(404).send();
  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: ONAM_SCHEDULE_ASSETS_BUCKET,
      Key: req.params[0],
    }));
    res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');
    res.setHeader('Cache-Control', result.CacheControl || 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return result.Body.pipe(res);
  } catch (error) {
    return res.status(404).send();
  }
}));

router.get('/admin', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const [config, items] = await Promise.all([getOnamScheduleConfig(), getAllScheduleItems()]);
  return res.json({ config, items });
}));

router.post('/admin/uploads', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  if (!ONAM_SCHEDULE_ASSETS_BUCKET) {
    return res.status(400).json({ message: 'Onam schedule asset upload bucket is not configured.' });
  }

  const { fileName, data } = req.body;
  if (!fileName || !data) {
    return res.status(400).json({ message: 'File name and image data are required.' });
  }

  const buffer = decodeBase64(data);
  const validation = validateBannerImage(buffer);
  if (validation.error) return res.status(400).json({ message: validation.error });

  await ensureLocalBucket();

  const key = `static/photos/onam-schedule/${Date.now()}-${safeUploadFilename(fileName, validation.image.extension)}`;
  await s3.send(new PutObjectCommand({
    Bucket: ONAM_SCHEDULE_ASSETS_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: validation.image.type,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return res.status(201).json({
    url: isLocalAws ? `/api/onam-schedule/assets/${key}` : `/${key}`,
    width: validation.image.width,
    height: validation.image.height,
  });
}));

router.put('/admin/config', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const existing = await getOnamScheduleConfig();
  const config = sanitizeConfig(req.body, existing, req.user?.email || 'admin');
  if (config.eventStatus === 'completed') {
    config.published = false;
  }
  await db.send(new PutCommand({ TableName: ONAM_SCHEDULE_TABLE, Item: config }));
  return res.json(config);
}));

router.post('/admin/items', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const item = sanitizeScheduleItem(req.body, {}, req.user?.email || 'admin');
  if (!item.timeLabel || !item.title) {
    return res.status(400).json({ message: 'Time and event title are required.' });
  }
  await db.send(new PutCommand({
    TableName: ONAM_SCHEDULE_TABLE,
    Item: item,
    ConditionExpression: 'attribute_not_exists(id)',
  }));
  return res.status(201).json(item);
}));

router.patch('/admin/items/:id', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: ONAM_SCHEDULE_TABLE, Key: { id: req.params.id } }));
  if (!result.Item || result.Item.type !== 'scheduleItem') {
    return res.status(404).json({ message: 'Schedule item not found.' });
  }
  const item = sanitizeScheduleItem(req.body, result.Item, req.user?.email || 'admin');
  if (!item.timeLabel || !item.title) {
    return res.status(400).json({ message: 'Time and event title are required.' });
  }
  await db.send(new PutCommand({ TableName: ONAM_SCHEDULE_TABLE, Item: item }));
  return res.json(item);
}));

router.delete('/admin/items/:id', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: ONAM_SCHEDULE_TABLE, Key: { id: req.params.id } }));
  if (!result.Item || result.Item.type !== 'scheduleItem') {
    return res.status(404).json({ message: 'Schedule item not found.' });
  }
  await db.send(new DeleteCommand({ TableName: ONAM_SCHEDULE_TABLE, Key: { id: req.params.id } }));
  return res.json({ message: 'Schedule item deleted.' });
}));

router.post('/admin/publish', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const existing = await getOnamScheduleConfig();
  if (existing.eventStatus === 'completed') {
    return res.status(400).json({ message: 'Completed events cannot be published. Change the event status before publishing again.' });
  }
  const config = {
    ...existing,
    published: true,
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.email || 'admin',
  };
  await db.send(new PutCommand({ TableName: ONAM_SCHEDULE_TABLE, Item: config }));
  return res.json(config);
}));

router.post('/admin/unpublish', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const existing = await getOnamScheduleConfig();
  const config = {
    ...existing,
    published: false,
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.email || 'admin',
  };
  await db.send(new PutCommand({ TableName: ONAM_SCHEDULE_TABLE, Item: config }));
  return res.json(config);
}));

router.post('/admin/complete', verifyToken, requireAdminOrScope(ONAM_SCHEDULE_SCOPE), asyncRoute(async (req, res) => {
  const existing = await getOnamScheduleConfig();
  const config = {
    ...existing,
    eventStatus: 'completed',
    published: false,
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.email || 'admin',
  };
  await db.send(new PutCommand({ TableName: ONAM_SCHEDULE_TABLE, Item: config }));
  return res.json(config);
}));

export default router;
