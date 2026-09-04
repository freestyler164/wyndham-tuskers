import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { awsClientConfig } from './awsConfig.js';
import { validatePassword } from './config.js';

const USERS_TABLE = process.env.USERS_TABLE;
const ALLOWED_SCOPES = new Set(['painting:judge', 'onam-schedule:manage']);
const DEFAULT_TTL_HOURS = 72;
const MAX_TTL_HOURS = 720;

if (!USERS_TABLE) {
  throw new Error('USERS_TABLE is required.');
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig), {
  marshallOptions: { removeUndefinedValues: true },
});

const randomToken = (bytes = 6) => crypto.randomBytes(bytes).toString('base64url');
const normalize = (value) => String(value || '').trim().toLowerCase();
const purposeSlug = (value) => String(value || 'painting-judge')
  .trim()
  .replace(/[^a-z0-9-]/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase() || 'guest';
const generatedUsername = (purpose) => `${purposeSlug(purpose)}-${randomToken(4)}`;
const generatedPassword = () => `Wt-${randomToken(6)}-${randomToken(6)}-7A`;
const normalizeScopes = (value) => {
  const list = String(value || 'painting:judge')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  return [...new Set(list)].filter((scope) => ALLOWED_SCOPES.has(scope));
};

const purpose = String(process.env.GUEST_PURPOSE || 'painting-judge').trim();
const scopes = normalizeScopes(process.env.GUEST_SCOPES);
const username = normalize(process.env.GUEST_USERNAME || generatedUsername(purpose));
const password = process.env.GUEST_PASSWORD || generatedPassword();
const ttlHours = Math.min(
  Math.max(Number(process.env.GUEST_TTL_HOURS || DEFAULT_TTL_HOURS), 1),
  MAX_TTL_HOURS,
);

if (!username) throw new Error('Guest username is required.');
if (!scopes.length) {
  throw new Error('No valid scopes provided. Allowed scopes: painting:judge, onam-schedule:manage.');
}

const passwordValidation = validatePassword(password);
if (!passwordValidation.valid) {
  throw new Error(passwordValidation.message);
}

const existing = await db.send(new GetCommand({
  TableName: USERS_TABLE,
  Key: { email: username },
}));
if (existing.Item) {
  throw new Error(`Guest user already exists: ${username}`);
}

const now = new Date();
const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
const item = {
  email: username,
  username,
  fullName: String(process.env.GUEST_FULL_NAME || `Guest ${purpose}`).trim().slice(0, 120),
  passwordHash: await bcrypt.hash(password, 12),
  role: 'guest',
  membershipStatus: 'guest',
  scopes,
  guestPurpose: purpose,
  source: 'guest-access-cli',
  createdBy: process.env.GUEST_CREATED_BY || 'cli',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  expiresAt,
};

await db.send(new PutCommand({
  TableName: USERS_TABLE,
  Item: item,
  ConditionExpression: 'attribute_not_exists(email)',
}));

console.log(JSON.stringify({
  username,
  password,
  expiresAt,
  scopes,
  message: 'Guest user created. Store the password now; it is not recoverable.',
}, null, 2));
