import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
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
const sesClient = new SESClient(awsClientConfig);

const USERS_TABLE = process.env.USERS_TABLE || 'members';
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'password_reset_tokens';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const SES_SENDER = process.env.SES_SENDER || 'club@wyndhamtuskers.local';
const MEMBER_REGISTRATION_ENABLED = process.env.ENABLE_MEMBER_REGISTRATION === 'true';

const createToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

const getUserByEmail = async (email) => {
  const params = {
    TableName: USERS_TABLE,
    KeyConditionExpression: '#email = :email',
    ExpressionAttributeNames: { '#email': 'email' },
    ExpressionAttributeValues: { ':email': email },
    IndexName: 'email-index',
  };

  try {
    const result = await db.send(new QueryCommand(params));
    return result.Items?.[0];
  } catch (error) {
    if (error.name === 'ValidationException') {
      const getParams = {
        TableName: USERS_TABLE,
        Key: { email },
      };
      const result = await db.send(new GetCommand(getParams));
      return result.Item;
    }
    throw error;
  }
};

const sendPasswordResetEmail = async (email, token) => {
  const url = `${FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  const body = `Hello from Wyndham Tuskers!\n\nUse the link below to reset your password. This link is valid for one hour.\n\n${url}\n\nIf you did not request this, please ignore this message.`;

  try {
    await sesClient.send(new SendEmailCommand({
      Source: SES_SENDER,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Wyndham Tuskers Password Reset' },
        Body: { Text: { Data: body } },
      },
    }));
  } catch (error) {
    console.warn('SES send failed; falling back to console log:', error?.message);
    console.log('Password reset link:', url);
  }
};

router.post('/signup', async (req, res) => {
  if (!MEMBER_REGISTRATION_ENABLED) {
    return res.status(403).json({ message: 'Member registration is currently closed.' });
  }

  const {
    email,
    password,
    fullName,
    phone,
    suburb,
    familyCount,
    interests,
  } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const existingUser = await getUserByEmail(email.toLowerCase());
  if (existingUser) return res.status(409).json({ message: 'Email already registered.' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    email: email.toLowerCase(),
    passwordHash: hashedPassword,
    fullName: fullName?.trim(),
    phone: phone?.trim(),
    suburb: suburb?.trim(),
    familyCount: familyCount ? Number(familyCount) : undefined,
    interests: Array.isArray(interests) ? interests : [],
    role: 'pending',
    createdAt: new Date().toISOString(),
  };

  await db.send(new PutCommand({ TableName: USERS_TABLE, Item: user }));
  const token = createToken({ email: user.email, role: user.role });
  return res.status(201).json({ token, role: user.role, email: user.email });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) return res.status(401).json({ message: 'Invalid email or password.' });

  if (user.role === 'pending') {
    return res.status(403).json({ message: 'Your registration is pending approval. Please contact an administrator.' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return res.status(401).json({ message: 'Invalid email or password.' });

  const token = createToken({ email: user.email, role: user.role });
  return res.json({ token, role: user.role, email: user.email });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) return res.status(200).json({ message: 'If the account exists, a reset link was sent.' });

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await db.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      email: user.email,
      token,
      expiresAt,
    },
  }));

  await sendPasswordResetEmail(user.email, token);
  return res.status(200).json({ message: 'If the account exists, a reset link was sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { email, token, password } = req.body;
  if (!email || !token || !password) return res.status(400).json({ message: 'Email, token, and new password are required.' });

  const getParams = {
    TableName: TOKENS_TABLE,
    Key: { email, token },
  };
  const result = await db.send(new GetCommand(getParams));
  const record = result.Item;
  if (!record || new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({ message: 'Invalid or expired reset token.' });
  }

  const user = await getUserByEmail(email.toLowerCase());
  const hashedPassword = await bcrypt.hash(password, 10);
  await db.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      ...user,
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      role: user?.role || 'member',
      updatedAt: new Date().toISOString(),
    },
  }));

  await db.send(new DeleteCommand({ TableName: TOKENS_TABLE, Key: { email, token } }));
  return res.json({ message: 'Password has been reset successfully.' });
});

router.get('/pending-registrations', verifyToken, requireAdmin, async (req, res) => {
  const params = {
    TableName: USERS_TABLE,
    FilterExpression: '#role = :pending',
    ExpressionAttributeNames: { '#role': 'role' },
    ExpressionAttributeValues: { ':pending': 'pending' },
  };
  const result = await db.send(new ScanCommand(params));
  return res.json(result.Items || []);
});

router.get('/members', verifyToken, requireAdmin, async (req, res) => {
  const params = {
    TableName: USERS_TABLE,
    FilterExpression: '#role = :member OR #role = :admin',
    ExpressionAttributeNames: { '#role': 'role' },
    ExpressionAttributeValues: {
      ':member': 'member',
      ':admin': 'admin',
    },
  };
  const result = await db.send(new ScanCommand(params));
  const members = (result.Items || []).map(({ passwordHash, ...member }) => member);
  return res.json(members);
});

router.post('/approve-registration/:email', verifyToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase();
  const user = await getUserByEmail(email);
  if (!user || user.role !== 'pending') {
    return res.status(404).json({ message: 'Pending registration not found.' });
  }

  await db.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      ...user,
      role: 'member',
      approvedAt: new Date().toISOString(),
    },
  }));

  return res.json({ message: 'Registration approved.' });
});

router.post('/reject-registration/:email', verifyToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase();
  const user = await getUserByEmail(email);
  if (!user || user.role !== 'pending') {
    return res.status(404).json({ message: 'Pending registration not found.' });
  }

  await db.send(new DeleteCommand({
    TableName: USERS_TABLE,
    Key: { email },
  }));

  return res.json({ message: 'Registration rejected.' });
});

router.post('/create-admin/:email', verifyToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase();
  const user = await getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  await db.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      ...user,
      role: 'admin',
      updatedAt: new Date().toISOString(),
    },
  }));

  return res.json({ message: 'User promoted to admin.' });
});

export default router;
