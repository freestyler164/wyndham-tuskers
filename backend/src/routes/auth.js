import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { awsClientConfig } from '../awsConfig.js';
import { config, getJwtSecret, validatePassword } from '../config.js';
import { sendEmail } from '../services/email.js';

const router = express.Router();

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const USERS_TABLE = process.env.USERS_TABLE || 'members';
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'password_reset_tokens';

const createToken = (payload) => jwt.sign(payload, getJwtSecret(), { expiresIn: config.jwtExpiresIn });

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
  const url = `${config.frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  const body = `Hello from Wyndham Tuskers!\n\nUse the link below to reset your password. This link is valid for one hour.\n\n${url}\n\nIf you did not request this, please ignore this message.`;

  try {
    await sendEmail({
      to: email,
      subject: 'Wyndham Tuskers Password Reset',
      text: body,
    });
  } catch (error) {
    console.warn('Password reset email failed:', error?.message);
  }
};

const createSignupHandler = ({ preview = false } = {}) => async (req, res) => {
  if (!config.enableMemberRegistration && !preview) {
    return res.status(403).json({ message: 'Member registration is currently closed.' });
  }

  const {
    appliedBefore,
    family,
    gamesInterested,
    indoorGamesAlreadyMember,
    membershipCriteriaAccepted,
    membershipFeeDisclaimerAccepted,
    onamEoi,
    email,
    fullName,
    interests,
    phone,
    postcode,
    previousMember,
    subscribedIndoorGames,
    suburb,
  } = req.body;

  if (!email || !fullName) return res.status(400).json({ message: 'Name and email are required.' });
  if (!suburb || !postcode) return res.status(400).json({ message: 'Suburb and postcode are required.' });
  if (!membershipFeeDisclaimerAccepted) return res.status(400).json({ message: 'Please acknowledge the membership fee disclaimer.' });
  if (!membershipCriteriaAccepted) return res.status(400).json({ message: 'Please acknowledge the membership review criteria.' });

  const existingUser = await getUserByEmail(email.toLowerCase());
  if (existingUser) return res.status(409).json({ message: 'Email already registered.' });

  const normalizedFamily = family && typeof family === 'object'
    ? {
      adults: family.adults ? Number(family.adults) : 0,
      kidsUnder5: family.kidsUnder5 ? Number(family.kidsUnder5) : 0,
      kidsOver5: family.kidsOver5 ? Number(family.kidsOver5) : 0,
    }
    : undefined;

  const sportsNextYear = Array.isArray(gamesInterested)
    ? gamesInterested
    : Array.isArray(interests)
    ? interests
    : [];

  const user = {
    email: email.toLowerCase(),
    fullName: fullName?.trim(),
    phone: phone?.trim(),
    suburb: suburb?.trim(),
    postcode: String(postcode || '').trim(),
    family: normalizedFamily,
    familyCount: normalizedFamily ? normalizedFamily.adults + normalizedFamily.kidsUnder5 + normalizedFamily.kidsOver5 : undefined,
    sportsNextYear,
    interests: sportsNextYear,
    previousMember: Boolean(previousMember),
    appliedBefore: Boolean(appliedBefore),
    indoorGamesSubscribed: Boolean(subscribedIndoorGames),
    indoorGamesAlreadyMember: Boolean(indoorGamesAlreadyMember),
    onamEoi: Boolean(onamEoi),
    membershipFeeDisclaimerAccepted: Boolean(membershipFeeDisclaimerAccepted),
    membershipCriteriaAccepted: Boolean(membershipCriteriaAccepted),
    membershipStatus: 'pending',
    role: 'pending',
    source: preview ? 'member-application-preview-2026' : 'member-application',
    createdAt: new Date().toISOString(),
  };

  await db.send(new PutCommand({ TableName: USERS_TABLE, Item: user }));
  return res.status(201).json({ role: user.role, email: user.email });
};

router.post('/signup', createSignupHandler());
router.post('/signup-preview-2026', createSignupHandler({ preview: true }));

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) return res.status(401).json({ message: 'Invalid email or password.' });

  if (user.role === 'pending') {
    return res.status(403).json({ message: 'Your registration is pending approval. Please contact an administrator.' });
  }

  if (!user.passwordHash) {
    return res.status(403).json({ message: 'Your account is ready. Please use Forgot password to create your password.' });
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
  const expiresAtMs = Date.now() + 60 * 60 * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  await db.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: {
      email: user.email,
      token,
      expiresAt,
      expiresAtEpoch: Math.floor(expiresAtMs / 1000),
    },
  }));

  await sendPasswordResetEmail(user.email, token);
  return res.status(200).json({ message: 'If the account exists, a reset link was sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { email, token, password } = req.body;
  if (!email || !token || !password) return res.status(400).json({ message: 'Email, token, and new password are required.' });
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) return res.status(400).json({ message: passwordValidation.message });

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
      membershipStatus: 'active',
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
  const { password } = req.body || {};
  const user = await getUserByEmail(email);

  if (!user) {
    if (!password) return res.status(400).json({ message: 'Password is required for a new admin account.' });
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) return res.status(400).json({ message: passwordValidation.message });

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    await db.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        email,
        passwordHash,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      },
    }));

    return res.status(201).json({ message: 'Admin account created.' });
  }

  const updatedUser = {
    ...user,
    role: 'admin',
    updatedAt: new Date().toISOString(),
  };

  if (!updatedUser.passwordHash && password) {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) return res.status(400).json({ message: passwordValidation.message });
    updatedUser.passwordHash = await bcrypt.hash(password, 12);
  }

  await db.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: updatedUser,
  }));

  return res.json({ message: 'User promoted to admin.' });
});

router.delete('/members/:email', verifyToken, requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase();
  if (email === req.user.email?.toLowerCase()) {
    return res.status(400).json({ message: 'You cannot delete your own admin account.' });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ message: 'Member not found.' });
  }

  await db.send(new DeleteCommand({
    TableName: USERS_TABLE,
    Key: { email },
  }));

  return res.json({ message: 'Member deleted.' });
});

export default router;
