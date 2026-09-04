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
import { verifyToken, requireAdmin, requireAdminOrScope } from '../middleware/auth.js';
import { AWS_ENDPOINT, awsClientConfig } from '../awsConfig.js';
import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  convertHeicToJpeg,
  isHeicLikeImage,
  jpegDimensions,
  pngDimensions,
} from '../services/imageProcessing.js';

const router = express.Router();
const db = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({
  ...awsClientConfig,
  forcePathStyle: Boolean(AWS_ENDPOINT),
});

const COMPETITION_TABLE = process.env.PAINTING_COMPETITION_TABLE || 'painting_competition';
const SUBMISSIONS_TABLE = process.env.PAINTING_SUBMISSIONS_TABLE || 'painting_submissions';
const ASSETS_BUCKET = process.env.PAINTING_ASSETS_BUCKET || 'wt-local-painting-assets';
const PAINTING_JUDGE_SCOPE = 'painting:judge';
const MAX_ARTWORK_BYTES = 4 * 1024 * 1024;
const MAX_TEMPLATE_BYTES = 4 * 1024 * 1024;
const AGE_GROUPS = [
  {
    id: 'under-5',
    label: '<5 years',
    activity: 'Colouring using the provided template',
    requiresTemplate: true,
  },
  {
    id: '5-7',
    label: '5-7 years',
    activity: 'Drawing and painting, or pencil sketch',
    requiresTemplate: false,
  },
  {
    id: '8-10',
    label: '8-10 years',
    activity: 'Drawing and painting, or pencil sketch',
    requiresTemplate: false,
  },
  {
    id: '11-14',
    label: '11-14 years',
    activity: 'Drawing and painting, or pencil sketch',
    requiresTemplate: false,
  },
];

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const cleanText = (value, maxLength = 500) => String(value || '')
  .replace(/\0/g, '')
  .trim()
  .slice(0, maxLength);
const safeFileName = (value, fallback) => {
  const name = cleanText(value, 120).replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, '-');
  return name || fallback;
};
const decodeBase64 = (value) => {
  const raw = String(value || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(raw, 'base64');
};

let bucketReady = false;
const ensureAssetsBucket = async () => {
  if (bucketReady) return;
  if (!AWS_ENDPOINT || process.env.NODE_ENV === 'production') {
    bucketReady = true;
    return;
  }
  try {
    await s3.send(new HeadBucketCommand({ Bucket: ASSETS_BUCKET }));
  } catch (error) {
    await s3.send(new CreateBucketCommand({ Bucket: ASSETS_BUCKET }));
  }
  bucketReady = true;
};

const validateArtwork = async (buffer) => {
  if (!buffer.length) return { error: 'Artwork file is empty.' };
  if (buffer.length > MAX_ARTWORK_BYTES) return { error: 'Artwork must be 4 MB or smaller.' };
  let artworkBuffer = buffer;
  let wasConverted = false;
  if (isHeicLikeImage(buffer)) {
    try {
      artworkBuffer = await convertHeicToJpeg(buffer, MAX_ARTWORK_BYTES);
      wasConverted = true;
    } catch (error) {
      return { error: 'Could not read this HEIC/HEIF photo. Please try exporting it as JPG and upload again.' };
    }
  }
  const image = pngDimensions(artworkBuffer) || jpegDimensions(artworkBuffer);
  if (!image) {
    return { error: 'Only valid JPG and PNG artwork images are accepted.' };
  }
  if (artworkBuffer.length > MAX_ARTWORK_BYTES) return { error: 'Converted artwork must be 4 MB or smaller. Please upload a smaller image.' };
  if (image.width < 100 || image.height < 100) return { error: 'Artwork image dimensions are too small.' };
  if (image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE || image.width * image.height > MAX_IMAGE_PIXELS) {
    return { error: 'Artwork image dimensions are too large.' };
  }
  return { image, buffer: artworkBuffer, wasConverted };
};

const pdfTemplateInfo = (buffer) => {
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') return null;
  const pdfText = buffer.toString('latin1');
  if (/\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile|RichMedia|AA)\b/i.test(pdfText)) {
    return { error: 'PDF contains unsupported active content.' };
  }
  return { type: 'application/pdf', extension: 'pdf' };
};

const validateTemplate = (buffer) => {
  if (!buffer.length) return { error: 'Template file is empty.' };
  if (buffer.length > MAX_TEMPLATE_BYTES) return { error: 'Template must be 4 MB or smaller.' };
  const template = pdfTemplateInfo(buffer) || pngDimensions(buffer) || jpegDimensions(buffer);
  if (!template) return { error: 'Only valid PDF, JPG and PNG templates are accepted.' };
  if (template.error) return { error: template.error };
  if (template.width && template.height) {
    if (template.width < 100 || template.height < 100) return { error: 'Template image dimensions are too small.' };
    if (template.width > MAX_IMAGE_SIDE || template.height > MAX_IMAGE_SIDE || template.width * template.height > MAX_IMAGE_PIXELS) {
      return { error: 'Template image dimensions are too large.' };
    }
  }
  return { template };
};

const inferTemplateContentType = (template, object) => {
  if (template.contentType) return template.contentType;
  if (object?.ContentType && object.ContentType !== 'binary/octet-stream') return object.ContentType;
  const name = `${template.fileName || ''} ${template.assetKey || ''}`.toLowerCase();
  if (name.includes('.png')) return 'image/png';
  if (name.includes('.jpg') || name.includes('.jpeg')) return 'image/jpeg';
  if (name.includes('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
};

const withFileExtension = (fileName, extension) => {
  const clean = safeFileName(fileName, `painting-template.${extension}`);
  const withoutExtension = clean.replace(/\.[^.]+$/, '');
  return `${withoutExtension}.${extension}`;
};

const getConfig = async () => {
  const result = await db.send(new GetCommand({ TableName: COMPETITION_TABLE, Key: { id: 'config' } }));
  return result.Item || {
    id: 'config',
    title: 'Onam 2026 Kids Painting Competition',
    subtitle: 'A colourful celebration for young artists in the Wyndham Tuskers family.',
    status: 'open',
    eventDate: '2026-08-08',
    venue: 'Bacchus Marsh Hall',
    instructions: [
      'Under 5 participants must colour the official printed template.',
      'Participants aged 5-7, 8-10, and 11-14 may submit an original drawing, painting, or pencil sketch.',
      'For participants aged 5 and above, the artwork theme must be Onam.',
      'The artwork must be completed by the child.',
      'Photograph or scan the finished page in good light with the full page in frame.',
      'Keep the original artwork safe in case the judging team asks to see it.',
    ],
    consentText: "I confirm that I am the child's parent or guardian and consent to this artwork being reviewed by the Wyndham Tuskers judging team.",
  };
};

export const getPaintingCompetitionConfig = getConfig;

export const isPaintingCompetitionPublic = (paintingConfig) => (
  paintingConfig?.status !== 'closed'
);

const getTemplates = async (includeInactive = false) => {
  const result = await db.send(new ScanCommand({ TableName: COMPETITION_TABLE }));
  return (result.Items || [])
    .filter((item) => item.type === 'template' && (includeInactive || item.active))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
};

const isUnderFiveTemplate = (template) => (
  Number(template.minAge) === 0
  && Number(template.maxAge) === 4
);

router.get('/', asyncRoute(async (req, res) => {
  const [config, templates] = await Promise.all([getConfig(), getTemplates(false)]);
  return res.json({
    config,
    templates: templates.filter(isUnderFiveTemplate),
    ageGroups: AGE_GROUPS,
    maxArtworkBytes: MAX_ARTWORK_BYTES,
  });
}));

router.get('/templates/:id/download', asyncRoute(async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: COMPETITION_TABLE, Key: { id: req.params.id } }));
  const template = result.Item;
  if (!template || template.type !== 'template' || !template.active || !isUnderFiveTemplate(template)) {
    return res.status(404).json({ message: 'Template not found.' });
  }
  await ensureAssetsBucket();
  const object = await s3.send(new GetObjectCommand({ Bucket: ASSETS_BUCKET, Key: template.assetKey }));
  const contentType = inferTemplateContentType(template, object);
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'pdf';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(template.fileName, `painting-template.${extension}`)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const body = Buffer.from(await object.Body.transformToByteArray());
  return res.end(body);
}));

router.post('/submissions', asyncRoute(async (req, res) => {
  const config = await getConfig();
  if (config.status !== 'open') {
    return res.status(403).json({ message: 'Painting competition submissions are not currently open.' });
  }

  const parentName = cleanText(req.body.parentName, 100);
  const childName = cleanText(req.body.childName, 100);
  const ageGroupId = cleanText(req.body.ageGroupId, 20);
  const templateId = cleanText(req.body.templateId, 100);
  const consentAccepted = req.body.consentAccepted === true;
  const ageGroup = AGE_GROUPS.find((group) => group.id === ageGroupId);
  if (!parentName || !childName || !ageGroup) {
    return res.status(400).json({ message: 'Child name, parent or guardian name, and age group are required.' });
  }
  if (!consentAccepted) return res.status(400).json({ message: 'Parent or guardian consent is required.' });

  let template;
  if (ageGroup.requiresTemplate) {
    if (!templateId) {
      return res.status(400).json({ message: 'The Under 5 colouring template is not currently available.' });
    }
    const templateResult = await db.send(new GetCommand({ TableName: COMPETITION_TABLE, Key: { id: templateId } }));
    template = templateResult.Item;
    if (!template || template.type !== 'template' || !template.active || !isUnderFiveTemplate(template)) {
      return res.status(400).json({ message: 'Select the published Under 5 colouring template.' });
    }
  }

  const buffer = decodeBase64(req.body.data);
  const validation = await validateArtwork(buffer);
  if (validation.error) return res.status(400).json({ message: validation.error });

  await ensureAssetsBucket();
  const submissionId = crypto.randomUUID();
  const assetKey = `submissions/${submissionId}.${validation.image.extension}`;
  const artworkFileName = withFileExtension(req.body.fileName, validation.image.extension);
  const originalArtworkFileName = safeFileName(req.body.fileName, `artwork.${validation.image.extension}`);
  const uploadResult = await s3.send(new PutObjectCommand({
    Bucket: ASSETS_BUCKET,
    Key: assetKey,
    Body: validation.buffer,
    ContentType: validation.image.type,
    ContentDisposition: `attachment; filename="${artworkFileName}"`,
    ServerSideEncryption: 'AES256',
    Metadata: { submissionId },
  }));

  const now = new Date().toISOString();
  const item = {
    id: submissionId,
    parentName,
    childName,
    ageGroupId: ageGroup.id,
    ageGroup: ageGroup.label,
    activityType: ageGroup.activity,
    templateId: template?.id,
    templateLabel: template?.label,
    consentAccepted: true,
    artworkKey: assetKey,
    artworkVersionId: uploadResult.VersionId,
    artworkContentType: validation.image.type,
    artworkFileName,
    artworkSize: validation.buffer.length,
    originalArtworkFileName,
    originalArtworkSize: buffer.length,
    artworkConvertedFromHeic: validation.wasConverted,
    artworkWidth: validation.image.width,
    artworkHeight: validation.image.height,
    status: 'submitted',
    judgingNotes: '',
    submittedAt: now,
    updatedAt: now,
  };

  try {
    await db.send(new PutCommand({
      TableName: SUBMISSIONS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (error) {
    await s3.send(new DeleteObjectCommand({
      Bucket: ASSETS_BUCKET,
      Key: assetKey,
      VersionId: uploadResult.VersionId,
    }));
    throw error;
  }

  return res.status(201).json({
    submissionId,
    message: 'Painting submitted successfully. Keep the original artwork for judging.',
  });
}));

router.get('/admin', verifyToken, requireAdminOrScope(PAINTING_JUDGE_SCOPE), asyncRoute(async (req, res) => {
  const [config, templates, submissionsResult] = await Promise.all([
    getConfig(),
    getTemplates(true),
    db.send(new ScanCommand({ TableName: SUBMISSIONS_TABLE })),
  ]);
  const submissions = (submissionsResult.Items || []).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return res.json({ config, templates, submissions });
}));

router.put('/admin/config', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const existing = await getConfig();
  const status = ['draft', 'open', 'closed'].includes(req.body.status) ? req.body.status : existing.status;
  const instructions = Array.isArray(req.body.instructions)
    ? req.body.instructions.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 20)
    : existing.instructions;
  const item = {
    ...existing,
    id: 'config',
    title: cleanText(req.body.title, 140) || existing.title,
    subtitle: cleanText(req.body.subtitle, 300),
    status,
    eventDate: cleanText(req.body.eventDate, 20),
    venue: cleanText(req.body.venue, 160),
    instructions,
    consentText: cleanText(req.body.consentText, 800) || existing.consentText,
    updatedAt: new Date().toISOString(),
    updatedBy: req.user?.email || 'admin',
  };
  await db.send(new PutCommand({ TableName: COMPETITION_TABLE, Item: item }));
  return res.json(item);
}));

router.post('/admin/templates', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const label = cleanText(req.body.label, 120);
  if (!label) return res.status(400).json({ message: 'Template label is required.' });
  const minAge = 0;
  const maxAge = 4;
  const ageGroup = 'Under 5 years';
  const buffer = decodeBase64(req.body.data);
  const validation = validateTemplate(buffer);
  if (validation.error) return res.status(400).json({ message: validation.error });

  await ensureAssetsBucket();
  const templateUuid = crypto.randomUUID();
  const id = `template#${templateUuid}`;
  const fileName = withFileExtension(req.body.fileName, validation.template.extension);
  const assetKey = `templates/${templateUuid}.${validation.template.extension}`;
  const uploadResult = await s3.send(new PutObjectCommand({
    Bucket: ASSETS_BUCKET,
    Key: assetKey,
    Body: buffer,
    ContentType: validation.template.type,
    ContentDisposition: `attachment; filename="${fileName}"`,
    ServerSideEncryption: 'AES256',
  }));

  const now = new Date().toISOString();
  const item = {
    id,
    type: 'template',
    label,
    ageGroup,
    minAge,
    maxAge,
    fileName,
    assetKey,
    assetVersionId: uploadResult.VersionId,
    contentType: validation.template.type,
    width: validation.template.width,
    height: validation.template.height,
    active: req.body.active !== false,
    sortOrder: Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0,
    createdAt: now,
    updatedAt: now,
    createdBy: req.user?.email || 'admin',
  };
  await db.send(new PutCommand({ TableName: COMPETITION_TABLE, Item: item }));
  return res.status(201).json(item);
}));

router.patch('/admin/templates/:id', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const existingResult = await db.send(new GetCommand({ TableName: COMPETITION_TABLE, Key: { id: req.params.id } }));
  const existing = existingResult.Item;
  if (!existing || existing.type !== 'template') return res.status(404).json({ message: 'Template not found.' });
  const item = {
    ...existing,
    label: cleanText(req.body.label ?? existing.label, 120),
    ageGroup: 'Under 5 years',
    minAge: 0,
    maxAge: 4,
    active: req.body.active ?? existing.active,
    sortOrder: Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : existing.sortOrder,
    updatedAt: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: COMPETITION_TABLE, Item: item }));
  return res.json(item);
}));

router.delete('/admin/templates/:id', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const existingResult = await db.send(new GetCommand({ TableName: COMPETITION_TABLE, Key: { id: req.params.id } }));
  const existing = existingResult.Item;
  if (!existing || existing.type !== 'template') return res.status(404).json({ message: 'Template not found.' });
  await ensureAssetsBucket();
  await Promise.all([
    db.send(new DeleteCommand({ TableName: COMPETITION_TABLE, Key: { id: req.params.id } })),
    s3.send(new DeleteObjectCommand({
      Bucket: ASSETS_BUCKET,
      Key: existing.assetKey,
      VersionId: existing.assetVersionId,
    })),
  ]);
  return res.json({ message: 'Template deleted.' });
}));

router.get('/admin/submissions/:id/artwork', verifyToken, requireAdminOrScope(PAINTING_JUDGE_SCOPE), asyncRoute(async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: SUBMISSIONS_TABLE, Key: { id: req.params.id } }));
  const submission = result.Item;
  if (!submission) return res.status(404).json({ message: 'Submission not found.' });
  await ensureAssetsBucket();
  const object = await s3.send(new GetObjectCommand({ Bucket: ASSETS_BUCKET, Key: submission.artworkKey }));
  res.setHeader('Content-Type', submission.artworkContentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeFileName(submission.artworkFileName, 'artwork.jpg')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  const body = Buffer.from(await object.Body.transformToByteArray());
  return res.end(body);
}));

router.patch('/admin/submissions/:id', verifyToken, requireAdminOrScope(PAINTING_JUDGE_SCOPE), asyncRoute(async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: SUBMISSIONS_TABLE, Key: { id: req.params.id } }));
  if (!result.Item) return res.status(404).json({ message: 'Submission not found.' });
  const allowedStatuses = ['submitted', 'shortlisted', 'winner', 'not_selected'];
  const item = {
    ...result.Item,
    status: allowedStatuses.includes(req.body.status) ? req.body.status : result.Item.status,
    judgingNotes: cleanText(req.body.judgingNotes ?? result.Item.judgingNotes, 2000),
    updatedAt: new Date().toISOString(),
    reviewedBy: req.user?.email || 'admin',
  };
  await db.send(new PutCommand({ TableName: SUBMISSIONS_TABLE, Item: item }));
  return res.json(item);
}));

router.delete('/admin/submissions/:id', verifyToken, requireAdmin, asyncRoute(async (req, res) => {
  const result = await db.send(new GetCommand({ TableName: SUBMISSIONS_TABLE, Key: { id: req.params.id } }));
  if (!result.Item) return res.status(404).json({ message: 'Submission not found.' });
  await ensureAssetsBucket();
  await Promise.all([
    db.send(new DeleteCommand({ TableName: SUBMISSIONS_TABLE, Key: { id: req.params.id } })),
    s3.send(new DeleteObjectCommand({
      Bucket: ASSETS_BUCKET,
      Key: result.Item.artworkKey,
      VersionId: result.Item.artworkVersionId,
    })),
  ]);
  return res.json({ message: 'Submission deleted.' });
}));

export default router;
