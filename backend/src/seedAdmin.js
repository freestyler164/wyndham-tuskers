import bcrypt from 'bcryptjs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { awsClientConfig } from './awsConfig.js';
import { validatePassword } from './config.js';

const USERS_TABLE = process.env.USERS_TABLE;
const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

if (!USERS_TABLE) {
  throw new Error('USERS_TABLE is required. Refusing to seed admin into an implicit/default table.');
}

if (!adminEmail || !adminPassword) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
}

const passwordValidation = validatePassword(adminPassword);
if (!passwordValidation.valid) {
  throw new Error(passwordValidation.message);
}

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const existing = await db.send(new GetCommand({
  TableName: USERS_TABLE,
  Key: { email: adminEmail },
}));

const passwordHash = await bcrypt.hash(adminPassword, 12);
await db.send(new PutCommand({
  TableName: USERS_TABLE,
  Item: {
    ...existing.Item,
    email: adminEmail,
    passwordHash,
    role: 'admin',
    createdAt: existing.Item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
}));

console.log(`Admin user is ready: ${adminEmail}`);
console.log(`Table: ${USERS_TABLE}`);
