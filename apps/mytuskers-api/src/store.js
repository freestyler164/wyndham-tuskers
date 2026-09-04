import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CreateTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { config, db, dynamoClient, s3 } from './aws.js';
import { seed } from './localData.js';

export const isTeamManagerRole = (role) => ['CAPTAIN', 'TEAM_ADMIN', 'GLOBAL_ADMIN'].includes(role);

const tableDefinitions = [
  {
    name: config.coreTable,
    params: {
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    },
  },
  {
    name: config.financeTable,
    params: {
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    },
  },
  {
    name: config.auditTable,
    params: {
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    },
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureTable = async ({ name, params }) => {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: name }));
    return;
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') throw error;
  }

  await dynamoClient.send(new CreateTableCommand({ TableName: name, ...params }));
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const result = await dynamoClient.send(new DescribeTableCommand({ TableName: name }));
    if (result.Table?.TableStatus === 'ACTIVE') return;
    await wait(500);
  }
  throw new Error(`Table ${name} did not become active in time`);
};

const ensureBucket = async () => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.receiptsBucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.receiptsBucket }));
  }
};

const waitForLocalstack = async () => {
  const start = Date.now();
  while (Date.now() - start < 45000) {
    try {
      await dynamoClient.send(new ListTablesCommand({ Limit: 1 }));
      return;
    } catch (error) {
      const retryable = ['ECONNREFUSED', 'ENOTFOUND'].includes(error.code)
        || ['TimeoutError', 'UnknownEndpoint'].includes(error.name);
      if (!retryable) throw error;
      await wait(750);
    }
  }
  throw new Error('LocalStack endpoint did not become available in time');
};

const batchPut = async (tableName, items) => {
  for (let index = 0; index < items.length; index += 25) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: items.slice(index, index + 25).map((Item) => ({
          PutRequest: { Item },
        })),
      },
    }));
  }
};

const batchDelete = async (tableName, items) => {
  const uniqueItems = [...new Map(items.map((item) => [`${item.PK}#${item.SK}`, item])).values()];
  for (let index = 0; index < uniqueItems.length; index += 25) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: uniqueItems.slice(index, index + 25).map((item) => ({
          DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
        })),
      },
    }));
  }
};

const createSeedItems = () => {
  const coreItems = [
    ...seed.users.map((user) => ({
      PK: `USER#${user.userId}`,
      SK: 'PROFILE',
      GSI1PK: `PHONE#${user.phone}`,
      GSI1SK: `USER#${user.userId}`,
      entityType: 'USER',
      ...user,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })),
    ...seed.teams.map((team) => ({
      PK: `TEAM#${team.teamId}`,
      SK: 'PROFILE',
      entityType: 'TEAM',
      ...team,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })),
    ...seed.memberships.flatMap((membership) => [
      {
        PK: `USER#${membership.userId}`,
        SK: `MEMBERSHIP#${membership.teamId}`,
        entityType: 'USER_MEMBERSHIP',
        ...membership,
      },
      {
        PK: `TEAM#${membership.teamId}`,
        SK: `MEMBER#${membership.userId}`,
        entityType: 'TEAM_MEMBERSHIP',
        ...membership,
      },
    ]),
    ...seed.matches.map((match) => ({
      PK: `TEAM#${match.teamId}`,
      SK: `MATCH#${match.startAt}#${match.matchId}`,
      GSI1PK: `MATCH#${match.matchId}`,
      GSI1SK: `TEAM#${match.teamId}`,
      entityType: 'MATCH',
      ...match,
    })),
    ...seed.availability.map((response) => ({
      PK: `MATCH#${response.matchId}`,
      SK: `AVAILABILITY#${response.userId}`,
      entityType: 'AVAILABILITY',
      ...response,
    })),
    ...seed.lineups.map((lineup) => ({
      PK: `MATCH#${lineup.matchId}`,
      SK: 'LINEUP#CURRENT',
      entityType: 'LINEUP',
      ...lineup,
    })),
    ...seed.awards.map((award) => ({
      PK: `MATCH#${award.matchId}`,
      SK: 'AWARD#CAPTAIN_MOTM',
      entityType: 'CAPTAIN_MATCH_AWARD',
      ...award,
    })),
    {
      PK: `INVITE#${seed.invite.token}`,
      SK: 'PROFILE',
      GSI1PK: `INVITE_TOKEN#${seed.invite.token}`,
      GSI1SK: 'INVITE',
      entityType: 'INVITE',
      ...seed.invite,
    },
    {
      PK: 'TEAM#team-1xi',
      SK: 'JOIN_REQUEST#join-request-guest',
      entityType: 'JOIN_REQUEST',
      requestId: 'join-request-guest',
      teamId: 'team-1xi',
      userId: 'user-guest',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const financeItems = [
    ...seed.wallets.map((wallet) => ({
      PK: `TEAM#${wallet.teamId}`,
      SK: wallet.ownerType === 'TEAM' ? 'WALLET#TEAM' : `WALLET#PLAYER#${wallet.ownerUserId}`,
      GSI1PK: `WALLET#${wallet.walletId}`,
      GSI1SK: 'PROFILE',
      entityType: 'WALLET',
      ...wallet,
      projectedMinor: wallet.availableMinor - wallet.pendingMinor,
      earmarkedMinor: Number(wallet.earmarkedMinor || 0),
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    })),
    ...seed.transactions.map((transaction) => ({
      PK: `WALLET#${transaction.walletId}`,
      SK: `TX#${transaction.createdAt}#${transaction.transactionId}`,
      GSI1PK: `TEAM#${transaction.teamId}`,
      GSI1SK: `TX#${transaction.createdAt}#${transaction.transactionId}`,
      entityType: 'WALLET_TRANSACTION',
      ...transaction,
    })),
    ...seed.expenses.map((expense) => ({
      PK: `TEAM#${expense.teamId}`,
      SK: `EXPENSE#${expense.createdAt}#${expense.expenseId}`,
      GSI1PK: `EXPENSE#${expense.expenseId}`,
      GSI1SK: 'META',
      entityType: 'EXPENSE',
      ...expense,
    })),
    ...seed.topupRequests.map((request) => ({
      PK: `TEAM#${request.teamId}`,
      SK: `TOPUP#${request.createdAt}#${request.requestId}`,
      GSI1PK: `TOPUP#${request.requestId}`,
      GSI1SK: 'META',
      entityType: 'TOPUP_REQUEST',
      ...request,
    })),
    ...(seed.collections || []).map((collection) => ({
      PK: `TEAM#${collection.teamId}`,
      SK: `COLLECTION#${collection.createdAt}#${collection.collectionId}`,
      GSI1PK: `COLLECTION#${collection.collectionId}`,
      GSI1SK: 'META',
      entityType: 'COLLECTION',
      ...collection,
    })),
    ...(seed.collectionShares || []).map((share) => ({
      PK: `TEAM#${share.teamId}`,
      SK: `COLLECTION_SHARE#${share.collectionId}#${share.userId}`,
      GSI1PK: `COLLECTION#${share.collectionId}`,
      GSI1SK: `SHARE#${share.userId}`,
      entityType: 'COLLECTION_SHARE',
      ...share,
    })),
  ];

  return { coreItems, financeItems };
};

export const ensureLocalData = async () => {
  if (process.env.NODE_ENV === 'production' && process.env.MYTUSKERS_SEED_ON_STARTUP !== 'true') {
    return;
  }

  await waitForLocalstack();
  for (const table of tableDefinitions) {
    await ensureTable(table);
  }
  await ensureBucket();

  const { coreItems, financeItems } = createSeedItems();
  await batchPut(config.coreTable, coreItems);
  await batchPut(config.financeTable, financeItems);
  await db.send(new PutCommand({
    TableName: config.auditTable,
    Item: {
      PK: 'AUDIT',
      SK: `SEED#${new Date().toISOString()}`,
      entityType: 'AUDIT_EVENT',
      actorUserId: 'local-seed',
      action: 'LOCAL_SEED_CREATED',
      targetType: 'LOCAL_DATA',
      targetId: 'mytuskers',
      correlationId: 'local-seed',
      createdAt: new Date().toISOString(),
    },
  }));
};

const clearTable = async (tableName) => {
  let ExclusiveStartKey;
  do {
    const result = await db.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'PK, SK',
      ExclusiveStartKey,
    }));
    for (const item of result.Items || []) {
      await db.send(new DeleteCommand({
        TableName: tableName,
        Key: { PK: item.PK, SK: item.SK },
      }));
    }
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
};

export const resetLocalData = async () => {
  await waitForLocalstack();
  for (const table of tableDefinitions) {
    await ensureTable(table);
  }
  await ensureBucket();
  await clearTable(config.coreTable);
  await clearTable(config.financeTable);
  await clearTable(config.auditTable);

  const { coreItems, financeItems } = createSeedItems();
  await batchPut(config.coreTable, coreItems);
  await batchPut(config.financeTable, financeItems);
  await db.send(new PutCommand({
    TableName: config.auditTable,
    Item: {
      PK: 'AUDIT',
      SK: `RESET#${new Date().toISOString()}`,
      entityType: 'AUDIT_EVENT',
      actorUserId: 'local-reset',
      action: 'LOCAL_SEED_RESET',
      targetType: 'LOCAL_DATA',
      targetId: 'mytuskers',
      correlationId: 'local-reset',
      createdAt: new Date().toISOString(),
    },
  }));
  return { ok: true, coreItems: coreItems.length, financeItems: financeItems.length };
};

export const isGlobalAdmin = (user) => user?.globalRole === 'GLOBAL_ADMIN';

export const normalizePhone = (phone) => {
  const trimmed = String(phone || '').trim();
  if (trimmed.startsWith('+')) return `+${trimmed.replace(/[^\d]/g, '')}`;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  return `+61${digits}`;
};

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const validatePassword = (password) => {
  const text = String(password || '');
  if (text.length < 12) return 'Use at least 12 characters.';
  if (!/[A-Z]/.test(text)) return 'Use at least one uppercase letter.';
  if (!/[a-z]/.test(text)) return 'Use at least one lowercase letter.';
  if (!/[0-9]/.test(text)) return 'Use at least one number.';
  return '';
};

export const getUserByPhone = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': `PHONE#${normalizedPhone}` },
  }));
  let candidates = result.Items || [];
  if (!candidates.length) {
    const fallback = await db.send(new ScanCommand({
      TableName: config.coreTable,
      FilterExpression: 'entityType = :type AND phone = :phone',
      ExpressionAttributeValues: {
        ':type': 'USER',
        ':phone': normalizedPhone,
      },
    }));
    candidates = fallback.Items || [];
  }
  return candidates
    .sort((a, b) => {
      if (Boolean(a.needsProfile) !== Boolean(b.needsProfile)) return a.needsProfile ? 1 : -1;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    })[0] || null;
};

export const getUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const result = await db.send(new ScanCommand({
    TableName: config.coreTable,
    FilterExpression: 'entityType = :type AND email = :email',
    ExpressionAttributeValues: {
      ':type': 'USER',
      ':email': normalizedEmail,
    },
  }));
  return (result.Items || [])[0] || null;
};

export const getUserByLogin = async (login) => {
  const value = String(login || '').trim();
  if (!value) return null;
  if (value.includes('@')) return getUserByEmail(value);
  return getUserByPhone(value);
};

export const createUserForPhone = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const userId = `user-${crypto.randomUUID()}`;
  const user = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    GSI1PK: `PHONE#${normalizedPhone}`,
    GSI1SK: `USER#${userId}`,
    entityType: 'USER',
    userId,
    phone: normalizedPhone,
    displayName: '',
    preferredName: '',
    initials: 'MT',
    needsProfile: true,
    onboardingCompletedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: user }));
  return user;
};

const tokenHash = (token) => createHash('sha256')
  .update(`${config.jwtSecret}:${token}`)
  .digest('hex');

export const createAuthToken = async ({ userId, email, purpose, ttlMinutes = 60 }) => {
  const token = randomBytes(32).toString('base64url');
  const nowEpoch = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = nowEpoch + ttlMinutes * 60;
  const nowText = new Date().toISOString();
  await db.send(new PutCommand({
    TableName: config.coreTable,
    Item: {
      PK: `AUTH_TOKEN#${tokenHash(token)}`,
      SK: purpose,
      entityType: 'AUTH_TOKEN',
      userId,
      email,
      purpose,
      expiresAtEpoch,
      expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
      createdAt: nowText,
      updatedAt: nowText,
    },
  }));
  return token;
};

export const consumeAuthToken = async (token, purpose) => {
  const key = { PK: `AUTH_TOKEN#${tokenHash(token)}`, SK: purpose };
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: key,
  }));
  const item = result.Item;
  if (!item || Number(item.expiresAtEpoch || 0) < Math.floor(Date.now() / 1000)) {
    const error = new Error('This link is invalid or has expired.');
    error.status = 400;
    throw error;
  }
  await db.send(new DeleteCommand({
    TableName: config.coreTable,
    Key: key,
  }));
  return item;
};

export const verifyUserEmail = async (token) => {
  const record = await consumeAuthToken(token, 'EMAIL_VERIFY');
  const nowText = new Date().toISOString();
  const result = await db.send(new UpdateCommand({
    TableName: config.coreTable,
    Key: { PK: `USER#${record.userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET emailVerifiedAt = :emailVerifiedAt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':emailVerifiedAt': nowText,
      ':updatedAt': nowText,
    },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
};

export const updateUserPassword = async (userId, password) => {
  const passwordError = validatePassword(password);
  if (passwordError) {
    const error = new Error(passwordError);
    error.status = 400;
    throw error;
  }
  const nowText = new Date().toISOString();
  const result = await db.send(new UpdateCommand({
    TableName: config.coreTable,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET passwordHash = :passwordHash, passwordUpdatedAt = :passwordUpdatedAt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':passwordHash': await bcrypt.hash(password, 12),
      ':passwordUpdatedAt': nowText,
      ':updatedAt': nowText,
    },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
};

export const verifyUserPassword = async (user, password) => Boolean(user?.passwordHash)
  && bcrypt.compare(String(password || ''), user.passwordHash);

export const createSignupUser = async ({ name, email, phone, password }) => {
  const normalizedPhone = normalizePhone(phone);
  const emailText = normalizeEmail(email);
  const existingPhone = await getUserByPhone(normalizedPhone);
  if (existingPhone) {
    const error = new Error('This mobile number already has a MyTuskers account. Sign in instead.');
    error.status = 409;
    throw error;
  }
  const existingEmail = await getUserByEmail(emailText);
  if (existingEmail) {
    const error = new Error('This email already has a MyTuskers account. Sign in instead.');
    error.status = 409;
    throw error;
  }

  const displayName = String(name || '').trim();
  if (!displayName) {
    const error = new Error('Name is required.');
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) {
    const error = new Error('A valid email is required.');
    error.status = 400;
    throw error;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    const error = new Error(passwordError);
    error.status = 400;
    throw error;
  }

  const preferredName = displayName.split(' ')[0] || displayName;
  const userId = `user-${crypto.randomUUID()}`;
  const nowText = new Date().toISOString();
  const user = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    GSI1PK: `PHONE#${normalizedPhone}`,
    GSI1SK: `USER#${userId}`,
    entityType: 'USER',
    userId,
    phone: normalizedPhone,
    email: emailText,
    passwordHash: await bcrypt.hash(password, 12),
    passwordUpdatedAt: nowText,
    emailVerifiedAt: '',
    displayName,
    preferredName,
    initials: preferredName.slice(0, 2).toUpperCase(),
    needsProfile: false,
    onboardingCompletedAt: '',
    createdAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: user }));
  return user;
};

export const updateUserProfile = async (userId, profile) => {
  const displayName = String(profile.displayName || '').trim();
  if (!displayName) {
    const error = new Error('Display name is required.');
    error.status = 400;
    throw error;
  }
  const preferredName = String(profile.preferredName || displayName.split(' ')[0] || displayName).trim();
  const initials = preferredName.slice(0, 2).toUpperCase();
  const result = await db.send(new UpdateCommand({
    TableName: config.coreTable,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET displayName = :displayName, preferredName = :preferredName, initials = :initials, needsProfile = :needsProfile, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':displayName': displayName,
      ':preferredName': preferredName,
      ':initials': initials,
      ':needsProfile': false,
      ':updatedAt': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
};

export const completeUserOnboarding = async (userId) => {
  const nowText = new Date().toISOString();
  const result = await db.send(new UpdateCommand({
    TableName: config.coreTable,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET onboardingCompletedAt = :onboardingCompletedAt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':onboardingCompletedAt': nowText,
      ':updatedAt': nowText,
    },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
};

export const getUserById = async (userId) => {
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }));
  return result.Item || null;
};

// Feed hydration looks up the same handful of team members once per post and once
// per comment. Caching the promise rather than the result also collapses the
// lookups that Promise.all fires concurrently.
const createUserLoader = () => {
  const cache = new Map();
  return (userId) => {
    if (!userId) return Promise.resolve(null);
    if (!cache.has(userId)) cache.set(userId, getUserById(userId));
    return cache.get(userId);
  };
};

export const getTeam = async (teamId) => {
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: { PK: `TEAM#${teamId}`, SK: 'PROFILE' },
  }));
  return result.Item || null;
};

export const getUserTeams = async (userId) => {
  const user = await getUserById(userId);
  if (isGlobalAdmin(user)) {
    const teams = await listTeams();
    return teams
      .filter((team) => team.status === 'ACTIVE')
      .map((team) => ({
        ...team,
        membership: {
          teamId: team.teamId,
          userId,
          role: 'GLOBAL_ADMIN',
          status: 'ACTIVE',
          playerType: 'UNSPECIFIED',
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
        },
      }));
  }

  const memberships = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'MEMBERSHIP#' },
  }));

  const activeMemberships = (memberships.Items || []).filter((item) => item.status === 'ACTIVE');
  const teams = [];
  for (const membership of activeMemberships) {
    const team = await getTeam(membership.teamId);
    if (team?.status === 'ACTIVE') teams.push({ ...stripKeys(team), membership: stripKeys(membership) });
  }
  return teams;
};

export const listTeams = async () => {
  const result = await db.send(new ScanCommand({
    TableName: config.coreTable,
    FilterExpression: 'entityType = :type',
    ExpressionAttributeValues: { ':type': 'TEAM' },
  }));
  return (result.Items || []).map(stripKeys).sort((a, b) => a.name.localeCompare(b.name));
};

export const deleteLocalTestTeams = async () => {
  const teams = (await listTeams()).filter((team) => team.name.startsWith('Tuskers Local '));
  for (const team of teams) {
    await deleteTeam(team.teamId, 'local-cleanup');
  }
  return { deletedTeamIds: teams.map((team) => team.teamId) };
};

export const deleteTeam = async (teamId, actorUserId) => {
  const team = await getTeam(teamId);
  if (!team) return null;

  const coreQuery = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}` },
  }));
  const coreItems = coreQuery.Items || [];
  const memberIds = coreItems
    .filter((item) => item.SK?.startsWith('MEMBER#'))
    .map((item) => item.userId)
    .filter(Boolean);
  const matchIds = coreItems
    .filter((item) => item.entityType === 'MATCH')
    .map((item) => item.matchId)
    .filter(Boolean);

  const mirroredMemberships = memberIds.map((userId) => ({
    PK: `USER#${userId}`,
    SK: `MEMBERSHIP#${teamId}`,
  }));

  const matchOwnedItems = [];
  for (const matchId of matchIds) {
    const result = await db.send(new QueryCommand({
      TableName: config.coreTable,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `MATCH#${matchId}` },
    }));
    matchOwnedItems.push(...(result.Items || []));
  }

  const inviteScan = await db.send(new ScanCommand({
    TableName: config.coreTable,
    FilterExpression: 'entityType = :type AND teamId = :teamId',
    ExpressionAttributeValues: { ':type': 'INVITE', ':teamId': teamId },
  }));

  const financeQuery = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}` },
  }));
  const teamTransactionQuery = await db.send(new QueryCommand({
    TableName: config.financeTable,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}` },
  }));
  const auditQuery = await db.send(new QueryCommand({
    TableName: config.auditTable,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}` },
  }));

  await batchDelete(config.coreTable, [
    ...coreItems,
    ...mirroredMemberships,
    ...matchOwnedItems,
    ...(inviteScan.Items || []),
  ]);
  await batchDelete(config.financeTable, [
    ...(financeQuery.Items || []),
    ...(teamTransactionQuery.Items || []),
  ]);
  await batchDelete(config.auditTable, auditQuery.Items || []);

  await writeAudit('', actorUserId, 'TEAM_DELETED', 'TEAM', teamId, {
    teamId,
    name: team.name,
    memberCount: memberIds.length,
    matchCount: matchIds.length,
  });
  return { deletedTeamId: teamId };
};

export const createTeam = async ({ name, shortName, sport = 'CRICKET', captainUserId, includeAllPlayers = false }, actorUserId) => {
  const teamId = `team-${String(name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 6)}`;
  const nowText = new Date().toISOString();
  const team = {
    PK: `TEAM#${teamId}`,
    SK: 'PROFILE',
    entityType: 'TEAM',
    teamId,
    name: String(name || 'New Team').trim(),
    shortName: String(shortName || 'NEW').trim().slice(0, 4).toUpperCase(),
    sport,
    playerCount: captainUserId ? 1 : 0,
    status: 'ACTIVE',
    captainUserId: captainUserId || '',
    createdAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: team }));
  await db.send(new PutCommand({
    TableName: config.financeTable,
    Item: {
      PK: `TEAM#${teamId}`,
      SK: 'WALLET#TEAM',
      GSI1PK: `WALLET#wallet-${teamId}`,
      GSI1SK: 'PROFILE',
      entityType: 'WALLET',
      walletId: `wallet-${teamId}`,
      teamId,
      ownerType: 'TEAM',
      availableMinor: 0,
      pendingMinor: 0,
      projectedMinor: 0,
      currency: 'AUD',
      createdAt: nowText,
      updatedAt: nowText,
      createdByUserId: actorUserId,
    },
  }));
  if (captainUserId) await setCaptain(teamId, captainUserId, actorUserId);
  if (includeAllPlayers) {
    const users = await listUsers();
    for (const user of users.filter((item) => !item.globalRole)) {
      await addMemberToTeam(teamId, user.userId, actorUserId, { role: user.userId === captainUserId ? 'CAPTAIN' : 'PLAYER' });
    }
  }
  await recalculateTeamPlayerCount(teamId);
  return getTeam(teamId).then(stripKeys);
};

export const updateTeam = async (teamId, changes) => {
  const current = await getTeam(teamId);
  if (!current) return null;
  const updated = {
    ...current,
    name: changes.name ? String(changes.name).trim() : current.name,
    shortName: changes.shortName ? String(changes.shortName).trim().slice(0, 4).toUpperCase() : current.shortName,
    sport: changes.sport || current.sport,
    walletCardColor: changes.walletCardColor || current.walletCardColor || '#063d93',
    walletCardImageUrl: changes.walletCardImageUrl ?? current.walletCardImageUrl ?? '',
    status: changes.status || current.status,
    updatedAt: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: updated }));
  return stripKeys(updated);
};

const extensionForContentType = (contentType) => {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
};

const allowedMatchStatuses = new Set(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'ABANDONED', 'POSTPONED']);

const normalizeMatchStatus = (status, fallback = 'SCHEDULED') => {
  const normalized = String(status || fallback).toUpperCase();
  return allowedMatchStatuses.has(normalized) ? normalized : fallback;
};

const allowedMatchResults = new Set(['WON', 'LOST', 'DRAW', 'TIE', 'NO_RESULT']);
const MATCH_RESULT_SUMMARY_MAX = 280;

const normalizeMatchResult = (result) => {
  const normalized = String(result || '').toUpperCase();
  return allowedMatchResults.has(normalized) ? normalized : undefined;
};

export const uploadTeamWalletCardImage = async (teamId, payload, actorUserId) => {
  const contentType = String(payload.contentType || '');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    const error = new Error('Wallet card image must be JPEG, PNG, or WebP.');
    error.status = 400;
    throw error;
  }

  const base64 = String(payload.dataUrl || '').split(',').pop();
  const body = Buffer.from(base64, 'base64');
  if (!body.length || body.length > 7 * 1024 * 1024) {
    const error = new Error('Wallet card image must be between 1 byte and 7 MB.');
    error.status = 400;
    throw error;
  }

  const key = `wallet-cards/${teamId}/${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
  await s3.send(new PutObjectCommand({
    Bucket: config.receiptsBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  const walletCardImageUrl = `/v1/assets/${encodeURIComponent(key)}`;
  const team = await updateTeam(teamId, { walletCardImageUrl });
  await writeAudit(teamId, actorUserId, 'TEAM_WALLET_CARD_IMAGE_UPLOADED', 'TEAM', teamId, { walletCardImageUrl });
  return team;
};

export const uploadUserProfilePhoto = async (userId, payload) => {
  const contentType = String(payload.contentType || '');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    const error = new Error('Profile photo must be JPEG, PNG, or WebP.');
    error.status = 400;
    throw error;
  }

  const base64 = String(payload.dataUrl || '').split(',').pop();
  const body = Buffer.from(base64, 'base64');
  if (!body.length || body.length > 4 * 1024 * 1024) {
    const error = new Error('Profile photo must be between 1 byte and 4 MB.');
    error.status = 400;
    throw error;
  }

  const key = `profile-photos/${userId}/${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
  await s3.send(new PutObjectCommand({
    Bucket: config.receiptsBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  const photoUrl = `/v1/assets/${encodeURIComponent(key)}`;
  const result = await db.send(new UpdateCommand({
    TableName: config.coreTable,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET photoUrl = :photoUrl, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':photoUrl': photoUrl,
      ':updatedAt': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
};

export const getAsset = async (key) => {
  const result = await s3.send(new GetObjectCommand({
    Bucket: config.receiptsBucket,
    Key: key,
  }));
  const chunks = [];
  for await (const chunk of result.Body) chunks.push(chunk);
  return {
    body: Buffer.concat(chunks),
    contentType: result.ContentType || 'application/octet-stream',
  };
};

export const getAssetDownloadUrl = async (key) => getSignedUrl(s3, new GetObjectCommand({
  Bucket: config.receiptsBucket,
  Key: key,
}), { expiresIn: 5 * 60 });

const pushSubscriptionId = (endpoint) => createHash('sha256').update(endpoint).digest('hex');

export const savePushSubscription = async (userId, subscription) => {
  const endpoint = String(subscription?.endpoint || '');
  const keys = subscription?.keys || {};
  if (!endpoint || !keys.p256dh || !keys.auth) {
    const error = new Error('A valid push subscription is required.');
    error.status = 400;
    throw error;
  }
  const nowText = new Date().toISOString();
  const item = {
    PK: `USER#${userId}`,
    SK: `PUSH#${pushSubscriptionId(endpoint)}`,
    entityType: 'PUSH_SUBSCRIPTION',
    userId,
    endpoint,
    subscription: {
      endpoint,
      expirationTime: subscription.expirationTime || null,
      keys: {
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
      },
    },
    createdAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: item }));
  return stripKeys(item);
};

export const deletePushSubscription = async (userId, endpoint) => {
  if (!endpoint) return;
  await db.send(new DeleteCommand({
    TableName: config.coreTable,
    Key: { PK: `USER#${userId}`, SK: `PUSH#${pushSubscriptionId(endpoint)}` },
  }));
};

export const listPushSubscriptionsForUser = async (userId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PUSH#' },
  }));
  return (result.Items || []).map(stripKeys);
};

export const setCaptain = async (teamId, userId, actorUserId) => {
  const team = await getTeam(teamId);
  const nowText = new Date().toISOString();
  if (!team) return null;
  const existingMembers = await getTeamMembers(teamId);
  for (const member of existingMembers.filter((item) => item.role === 'CAPTAIN' && item.userId !== userId)) {
    await updateMembership(teamId, member.userId, { role: 'PLAYER', updatedAt: nowText });
  }
  const existing = await getTeamMembership(teamId, userId);
  await updateMembership(teamId, userId, {
    ...(existing || {
      teamId,
      userId,
      status: 'ACTIVE',
      playerType: 'UNSPECIFIED',
      createdAt: nowText,
    }),
    role: 'CAPTAIN',
    status: 'ACTIVE',
    joinedAt: existing?.joinedAt || nowText,
    updatedAt: nowText,
  });
  await ensurePlayerWallet(teamId, userId);
  await db.send(new UpdateCommand({
    TableName: config.coreTable,
    Key: { PK: `TEAM#${teamId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET captainUserId = :captainUserId, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':captainUserId': userId, ':updatedAt': nowText },
  }));
  await recalculateTeamPlayerCount(teamId);
  await writeAudit(teamId, actorUserId, 'CAPTAIN_ASSIGNED', 'TEAM', teamId, { captainUserId: userId });
  return getTeam(teamId).then(stripKeys);
};

export const setMemberRole = async (teamId, userId, role, actorUserId) => {
  const allowedRoles = ['PLAYER', 'TEAM_ADMIN'];
  if (!allowedRoles.includes(role)) {
    const error = new Error('Role must be PLAYER or TEAM_ADMIN.');
    error.status = 400;
    throw error;
  }
  const [team, existing, user] = await Promise.all([
    getTeam(teamId),
    getTeamMembership(teamId, userId),
    getUserById(userId),
  ]);
  if (!team) {
    const error = new Error('Team not found.');
    error.status = 404;
    throw error;
  }
  if (!existing || existing.status !== 'ACTIVE') {
    const error = new Error('Active team member not found.');
    error.status = 404;
    throw error;
  }
  if (existing.role === 'CAPTAIN') {
    const error = new Error('Use the primary captain control to change the captain.');
    error.status = 400;
    throw error;
  }
  const membership = await updateMembership(teamId, userId, {
    ...existing,
    role,
    updatedAt: new Date().toISOString(),
  });
  await writeAudit(teamId, actorUserId, 'MEMBER_ROLE_UPDATED', 'MEMBERSHIP', `${teamId}:${userId}`, { userId, role });
  return { ...stripKeys(membership), user: stripKeys(user) };
};

export const updateMembership = async (teamId, userId, membership) => {
  const item = {
    teamId,
    userId,
    role: membership.role || 'PLAYER',
    status: membership.status || 'ACTIVE',
    playerType: membership.playerType || 'UNSPECIFIED',
    playingRole: membership.playingRole,
    joinedAt: membership.joinedAt,
    removedAt: membership.removedAt,
    createdAt: membership.createdAt || new Date().toISOString(),
    updatedAt: membership.updatedAt || new Date().toISOString(),
  };
  await batchPut(config.coreTable, [
    { PK: `USER#${userId}`, SK: `MEMBERSHIP#${teamId}`, entityType: 'USER_MEMBERSHIP', ...item },
    { PK: `TEAM#${teamId}`, SK: `MEMBER#${userId}`, entityType: 'TEAM_MEMBERSHIP', ...item },
  ]);
  return item;
};

export const getTeamMembership = async (teamId, userId) => {
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: { PK: `TEAM#${teamId}`, SK: `MEMBER#${userId}` },
  }));
  return result.Item || null;
};

export const getTeamMembers = async (teamId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'MEMBER#' },
  }));
  const members = [];
  for (const membership of result.Items || []) {
    const user = await getUserById(membership.userId);
    members.push({ ...stripKeys(membership), user: stripKeys(user) });
  }
  return members;
};

export const recalculateTeamPlayerCount = async (teamId) => {
  const members = await getTeamMembers(teamId);
  const playerCount = members.filter((member) => member.status === 'ACTIVE').length;
  await db.send(new UpdateCommand({
    TableName: config.coreTable,
    Key: { PK: `TEAM#${teamId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET playerCount = :playerCount, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':playerCount': playerCount, ':updatedAt': new Date().toISOString() },
  }));
  return playerCount;
};

export const ensurePlayerWallet = async (teamId, userId) => {
  const existing = await db.send(new GetCommand({
    TableName: config.financeTable,
    Key: { PK: `TEAM#${teamId}`, SK: `WALLET#PLAYER#${userId}` },
  }));
  if (existing.Item) return stripKeys(existing.Item);
  const nowText = new Date().toISOString();
  const wallet = {
    PK: `TEAM#${teamId}`,
    SK: `WALLET#PLAYER#${userId}`,
    GSI1PK: `WALLET#wallet-${teamId}-${userId}`,
    GSI1SK: 'PROFILE',
    entityType: 'WALLET',
    walletId: `wallet-${teamId}-${userId}`,
    teamId,
    ownerType: 'PLAYER',
    ownerUserId: userId,
    availableMinor: 0,
    pendingMinor: 0,
    earmarkedMinor: 0,
    projectedMinor: 0,
    currency: 'AUD',
    createdAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.financeTable, Item: wallet }));
  return stripKeys(wallet);
};

export const addMemberToTeam = async (teamId, userId, actorUserId, options = {}) => {
  const [team, user, existing] = await Promise.all([
    getTeam(teamId),
    getUserById(userId),
    getTeamMembership(teamId, userId),
  ]);
  if (!team) {
    const error = new Error('Team not found.');
    error.status = 404;
    throw error;
  }
  if (!user || user.globalRole) {
    const error = new Error('Player not found.');
    error.status = 404;
    throw error;
  }
  const nowText = new Date().toISOString();
  const membership = await updateMembership(teamId, userId, {
    ...(existing || {
      teamId,
      userId,
      createdAt: nowText,
    }),
    role: options.role || existing?.role || 'PLAYER',
    status: 'ACTIVE',
    playerType: options.playerType || existing?.playerType || 'CLUB_MEMBER',
    playingRole: existing?.playingRole || user.playingRole || 'BATTER',
    joinedAt: existing?.joinedAt || nowText,
    removedAt: undefined,
    updatedAt: nowText,
  });
  await ensurePlayerWallet(teamId, userId);
  await recalculateTeamPlayerCount(teamId);
  await writeAudit(teamId, actorUserId, existing ? 'MEMBER_ADDED_EXISTING' : 'MEMBER_ADDED', 'MEMBERSHIP', `${teamId}:${userId}`, membership);
  return { ...stripKeys(membership), user: stripKeys(user) };
};

export const listPlayerCandidatesForTeam = async (teamId) => {
  const [users, members] = await Promise.all([listUsers(), getTeamMembers(teamId)]);
  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  return users
    .filter((user) => !user.globalRole)
    .map((user) => {
      const membership = memberByUserId.get(user.userId);
      return {
        ...user,
        membershipStatus: membership?.status || 'NOT_IN_TEAM',
        membershipRole: membership?.role || '',
      };
    });
};

export const setMemberStatus = async (teamId, userId, status, actorUserId) => {
  const existing = await getTeamMembership(teamId, userId);
  if (!existing) return null;
  const membership = await updateMembership(teamId, userId, {
    ...existing,
    status,
    removedAt: status === 'REMOVED' ? new Date().toISOString() : undefined,
    updatedAt: new Date().toISOString(),
  });
  if (status === 'ACTIVE') await ensurePlayerWallet(teamId, userId);
  await recalculateTeamPlayerCount(teamId);
  await writeAudit(teamId, actorUserId, `MEMBER_${status}`, 'MEMBERSHIP', `${teamId}:${userId}`, membership);
  return stripKeys(membership);
};

export const listUsers = async () => {
  const result = await db.send(new ScanCommand({
    TableName: config.coreTable,
    FilterExpression: 'entityType = :type',
    ExpressionAttributeValues: { ':type': 'USER' },
  }));
  return (result.Items || []).map(stripKeys).sort((a, b) => (a.displayName || a.phone).localeCompare(b.displayName || b.phone));
};

export const getTeamWallet = async (teamId) => {
  const result = await db.send(new GetCommand({
    TableName: config.financeTable,
    Key: { PK: `TEAM#${teamId}`, SK: 'WALLET#TEAM' },
  }));
  return result.Item || null;
};

export const getPlayerWallets = async (teamId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'WALLET#PLAYER#' },
  }));
  const wallets = [];
  for (const wallet of result.Items || []) {
    const user = await getUserById(wallet.ownerUserId);
    wallets.push({ ...stripKeys(wallet), user: stripKeys(user) });
  }
  return wallets.sort((a, b) => (a.user?.displayName || '').localeCompare(b.user?.displayName || ''));
};

const walletPutItem = (wallet, values = {}) => ({
  PK: `TEAM#${wallet.teamId}`,
  SK: wallet.ownerType === 'TEAM' ? 'WALLET#TEAM' : `WALLET#PLAYER#${wallet.ownerUserId}`,
  GSI1PK: `WALLET#${wallet.walletId}`,
  GSI1SK: 'PROFILE',
  entityType: 'WALLET',
  ...wallet,
  ...values,
});

const signedTransactionAmount = (transaction) => {
  const amount = Number(transaction.amountMinor || 0);
  return transaction.direction === 'CREDIT' ? amount : -amount;
};

const createWalletTransactionItem = ({ teamId, wallet, userId, amountMinor, direction, transactionType, reason, actorUserId, referenceType, referenceId, createdAt }) => {
  const transactionId = `tx-${crypto.randomUUID()}`;
  const nowText = createdAt || new Date().toISOString();
  return {
    PK: `WALLET#${wallet.walletId}`,
    SK: `TX#${nowText}#${transactionId}`,
    GSI1PK: `TEAM#${teamId}`,
    GSI1SK: `TX#${nowText}#${transactionId}`,
    entityType: 'WALLET_TRANSACTION',
    transactionId,
    teamId,
    walletId: wallet.walletId,
    ownerType: wallet.ownerType,
    ownerUserId: userId,
    amountMinor: Number(amountMinor || 0),
    currency: 'AUD',
    direction,
    transactionType,
    status: 'POSTED',
    reason,
    referenceType,
    referenceId,
    createdByUserId: actorUserId,
    createdAt: nowText,
    updatedAt: nowText,
  };
};

const postWalletTransaction = async ({
  teamId,
  userId,
  amountMinor,
  direction,
  transactionType,
  reason,
  actorUserId,
  referenceType,
  referenceId,
  bucket = 'available',
}) => {
  const wallet = await getWalletForUser(teamId, userId);
  const amount = Number(amountMinor || 0);
  const delta = direction === 'CREDIT' ? amount : -amount;
  const nowText = new Date().toISOString();
  let availableMinor = Number(wallet.availableMinor || 0);
  let earmarkedMinor = Number(wallet.earmarkedMinor || 0);

  if (bucket === 'earmarked') {
    earmarkedMinor += delta;
    if (earmarkedMinor < 0) {
      const error = new Error('Prepaid collection balance cannot go below zero.');
      error.status = 400;
      throw error;
    }
  } else if (bucket === 'release') {
    // Move leftover from earmarked into available; activity shows as a CREDIT.
    if (amount <= 0) {
      const error = new Error('Release amount must be greater than zero.');
      error.status = 400;
      throw error;
    }
    if (earmarkedMinor < amount) {
      const error = new Error('Cannot release more than the prepaid collection balance.');
      error.status = 400;
      throw error;
    }
    earmarkedMinor -= amount;
    availableMinor += amount;
  } else {
    availableMinor += delta;
  }

  const walletItem = walletPutItem(wallet, {
    availableMinor,
    earmarkedMinor,
    projectedMinor: availableMinor - Number(wallet.pendingMinor || 0),
    updatedAt: nowText,
  });
  const tx = createWalletTransactionItem({
    teamId,
    wallet,
    userId,
    amountMinor: amount,
    direction: bucket === 'release' ? 'CREDIT' : direction,
    transactionType,
    reason,
    actorUserId,
    referenceType,
    referenceId,
    createdAt: nowText,
  });
  await batchPut(config.financeTable, [walletItem, tx]);
  return { wallet: stripKeys(walletItem), transaction: stripKeys(tx) };
};

export const creditPlayerWallet = async (teamId, userId, amountMinor, reason, actorUserId) => {
  const result = await postWalletTransaction({
    teamId,
    userId,
    amountMinor,
    direction: 'CREDIT',
    transactionType: 'CREDIT',
    reason: reason || 'Captain wallet credit',
    actorUserId,
  });
  await writeAudit(teamId, actorUserId, 'PLAYER_WALLET_CREDITED', 'WALLET', result.wallet.walletId, { userId, amountMinor });
  return result.wallet;
};

export const creditPlayerWallets = async (teamId, actorUserId, payload) => {
  const amountMinor = Math.round(Number(payload.amountMinor || 0));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    const error = new Error('Credit amount must be greater than zero.');
    error.status = 400;
    throw error;
  }
  const reason = String(payload.reason || '').trim() || 'Captain wallet credit';
  const members = await getTeamMembers(teamId);
  const activePlayerIds = members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId);
  const appliesTo = payload.appliesTo === 'WHOLE_TEAM' ? 'WHOLE_TEAM' : 'SELECTED_PLAYERS';
  const selectedUserIds = appliesTo === 'WHOLE_TEAM'
    ? activePlayerIds
    : [...new Set(Array.isArray(payload.selectedUserIds) ? payload.selectedUserIds.filter((userId) => activePlayerIds.includes(userId)) : [])];
  if (!selectedUserIds.length) {
    const error = new Error('Select at least one active player.');
    error.status = 400;
    throw error;
  }
  const wallets = [];
  for (const userId of selectedUserIds) {
    wallets.push(await creditPlayerWallet(teamId, userId, amountMinor, reason, actorUserId));
  }
  await writeAudit(teamId, actorUserId, 'PLAYER_WALLETS_CREDITED', 'WALLET', teamId, { selectedUserIds, amountMinor, reason });
  return { wallets, count: wallets.length };
};

export const adjustPlayerWallet = async (teamId, userId, amountMinor, reason, actorUserId) => {
  const amount = Math.round(Number(amountMinor || 0));
  if (!Number.isInteger(amount) || amount === 0) {
    const error = new Error('Adjustment amount must be a non-zero integer.');
    error.status = 400;
    throw error;
  }
  const result = await postWalletTransaction({
    teamId,
    userId,
    amountMinor: Math.abs(amount),
    direction: amount > 0 ? 'CREDIT' : 'DEBIT',
    transactionType: amount > 0 ? 'MANUAL_ADJUSTMENT_CREDIT' : 'MANUAL_ADJUSTMENT_DEBIT',
    reason: reason || 'Wallet correction',
    actorUserId,
  });
  await writeAudit(teamId, actorUserId, 'PLAYER_WALLET_ADJUSTED', 'WALLET', result.wallet.walletId, { userId, amountMinor: amount, reason });
  return result.wallet;
};

export const getWalletForUser = async (teamId, userId) => {
  const result = await db.send(new GetCommand({
    TableName: config.financeTable,
    Key: { PK: `TEAM#${teamId}`, SK: `WALLET#PLAYER#${userId}` },
  }));
  return result.Item || {
    walletId: `wallet-${teamId}-${userId}`,
    teamId,
    ownerType: 'PLAYER',
    ownerUserId: userId,
    availableMinor: 0,
    pendingMinor: 0,
    earmarkedMinor: 0,
    projectedMinor: 0,
    currency: 'AUD',
  };
};

export const getWalletTransactions = async (walletId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `WALLET#${walletId}`, ':sk': 'TX#' },
    ScanIndexForward: false,
  }));
  return (result.Items || []).map(stripKeys);
};

export const listTeamWalletTransactions = async (teamId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'TX#' },
    ScanIndexForward: false,
  }));
  return Promise.all((result.Items || []).map(async (transaction) => {
    const user = transaction.ownerUserId ? await getUserById(transaction.ownerUserId) : null;
    return { ...stripKeys(transaction), user: stripKeys(user) };
  }));
};

const getWalletTransactionItems = async (walletId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `WALLET#${walletId}`, ':sk': 'TX#' },
    ScanIndexForward: false,
  }));
  return result.Items || [];
};

export const updateWalletTransaction = async (teamId, userId, transactionId, payload, actorUserId) => {
  const wallet = await getWalletForUser(teamId, userId);
  const transactions = await getWalletTransactionItems(wallet.walletId);
  const existing = transactions.find((transaction) => transaction.transactionId === transactionId);
  if (!existing) return null;

  const amountMinor = Math.round(Number(payload.amountMinor ?? existing.amountMinor));
  const direction = ['CREDIT', 'DEBIT'].includes(payload.direction) ? payload.direction : existing.direction;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    const error = new Error('Transaction amount must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const updated = {
    ...existing,
    amountMinor,
    direction,
    reason: String(payload.reason ?? existing.reason).trim() || existing.reason,
    editedByUserId: actorUserId,
    editedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const delta = signedTransactionAmount(updated) - signedTransactionAmount(existing);
  const availableMinor = Number(wallet.availableMinor || 0) + delta;
  const walletItem = walletPutItem(wallet, {
    availableMinor,
    earmarkedMinor: Number(wallet.earmarkedMinor || 0),
    projectedMinor: availableMinor - Number(wallet.pendingMinor || 0),
    updatedAt: new Date().toISOString(),
  });

  await batchPut(config.financeTable, [walletItem, updated]);
  await writeAudit(teamId, actorUserId, 'WALLET_TRANSACTION_EDITED', 'WALLET_TRANSACTION', transactionId, stripKeys(updated));
  return { wallet: stripKeys(walletItem), transaction: stripKeys(updated) };
};

export const listTopupRequests = async (teamId, userId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'TOPUP#' },
    ScanIndexForward: false,
  }));
  const requests = (result.Items || []).filter((request) => !userId || request.userId === userId);
  return Promise.all(requests.map(async (request) => {
    const user = await getUserById(request.userId);
    return { ...stripKeys(request), user: stripKeys(user) };
  }));
};

export const createTopupRequest = async (teamId, userId, payload) => {
  const amountMinor = Math.round(Number(payload.amountMinor || 0));
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    const error = new Error('Topup amount must be greater than zero.');
    error.status = 400;
    throw error;
  }
  if (payload.paymentConfirmed !== true) {
    const error = new Error('Confirm that you have made the payment outside MyTuskers.');
    error.status = 400;
    throw error;
  }
  const nowText = new Date().toISOString();
  const requestId = `topup-${crypto.randomUUID()}`;
  const request = {
    PK: `TEAM#${teamId}`,
    SK: `TOPUP#${nowText}#${requestId}`,
    GSI1PK: `TOPUP#${requestId}`,
    GSI1SK: 'META',
    entityType: 'TOPUP_REQUEST',
    requestId,
    teamId,
    userId,
    amountMinor,
    status: 'SUBMITTED',
    paymentConfirmed: true,
    note: String(payload.note || '').trim(),
    createdAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.financeTable, Item: request }));
  await writeAudit(teamId, userId, 'TOPUP_REQUEST_SUBMITTED', 'TOPUP_REQUEST', request.requestId, stripKeys(request));
  return stripKeys(request);
};

export const decideTopupRequest = async (teamId, requestId, decision, actorUserId) => {
  const requests = await listTopupRequests(teamId);
  const request = requests.find((item) => item.requestId === requestId);
  if (!request) return null;
  if (request.status !== 'SUBMITTED') return request;
  const nowText = new Date().toISOString();
  const item = {
    PK: `TEAM#${teamId}`,
    SK: `TOPUP#${request.createdAt}#${request.requestId}`,
    GSI1PK: `TOPUP#${request.requestId}`,
    GSI1SK: 'META',
    entityType: 'TOPUP_REQUEST',
    ...request,
    user: undefined,
    status: decision,
    decidedByUserId: actorUserId,
    decidedAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.financeTable, Item: item }));
  let wallet = null;
  if (decision === 'APPROVED') {
    const result = await postWalletTransaction({
      teamId,
      userId: request.userId,
      amountMinor: request.amountMinor,
      direction: 'CREDIT',
      transactionType: 'TOPUP_CREDIT',
      reason: 'Player topup confirmed',
      actorUserId,
      referenceType: 'TOPUP_REQUEST',
      referenceId: request.requestId,
    });
    wallet = result.wallet;
  }
  await writeAudit(teamId, actorUserId, `TOPUP_REQUEST_${decision}`, 'TOPUP_REQUEST', requestId, stripKeys(item));
  return { request: stripKeys(item), wallet };
};

const collectionPutItem = (collection) => ({
  PK: `TEAM#${collection.teamId}`,
  SK: `COLLECTION#${collection.createdAt}#${collection.collectionId}`,
  GSI1PK: `COLLECTION#${collection.collectionId}`,
  GSI1SK: 'META',
  entityType: 'COLLECTION',
  ...collection,
});

const collectionSharePutItem = (share) => ({
  PK: `TEAM#${share.teamId}`,
  SK: `COLLECTION_SHARE#${share.collectionId}#${share.userId}`,
  GSI1PK: `COLLECTION#${share.collectionId}`,
  GSI1SK: `SHARE#${share.userId}`,
  entityType: 'COLLECTION_SHARE',
  ...share,
});

const sumShareField = (shares, field) => shares.reduce((total, share) => total + Number(share[field] || 0), 0);

const enrichCollection = async (collection, shares) => {
  const enrichedShares = await Promise.all(shares.map(async (share) => {
    const user = await getUserById(share.userId);
    return { ...stripKeys(share), user: stripKeys(user) };
  }));
  return {
    ...stripKeys(collection),
    totalDueMinor: sumShareField(shares, 'amountDueMinor'),
    totalPrepaidMinor: sumShareField(shares, 'amountPrepaidMinor'),
    totalSpentMinor: sumShareField(shares, 'amountSpentMinor'),
    shares: enrichedShares.sort((a, b) => (a.user?.displayName || a.userId).localeCompare(b.user?.displayName || b.userId)),
  };
};

export const listCollectionShares = async (teamId, collectionId = null) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `TEAM#${teamId}`,
      ':sk': collectionId ? `COLLECTION_SHARE#${collectionId}#` : 'COLLECTION_SHARE#',
    },
  }));
  return (result.Items || []).map(stripKeys);
};

export const listCollections = async (teamId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'COLLECTION#' },
    ScanIndexForward: false,
  }));
  const collections = (result.Items || []).filter((item) => item.entityType === 'COLLECTION');
  const allShares = await listCollectionShares(teamId);
  return Promise.all(collections.map((collection) => {
    const shares = allShares.filter((share) => share.collectionId === collection.collectionId);
    return enrichCollection(collection, shares);
  }));
};

export const getCollection = async (teamId, collectionId) => {
  const collections = await listCollections(teamId);
  return collections.find((collection) => collection.collectionId === collectionId) || null;
};

export const createCollection = async (teamId, actorUserId, payload) => {
  const title = String(payload.title || '').trim();
  if (!title) {
    const error = new Error('Collection title is required.');
    error.status = 400;
    throw error;
  }
  const rawShares = Array.isArray(payload.shares) ? payload.shares : [];
  const sharesInput = rawShares
    .map((share) => ({
      userId: String(share.userId || '').trim(),
      amountMinor: Math.round(Number(share.amountMinor || 0)),
    }))
    .filter((share) => share.userId && share.amountMinor > 0);
  if (!sharesInput.length) {
    const error = new Error('Add at least one player with an amount owed.');
    error.status = 400;
    throw error;
  }
  const members = await getTeamMembers(teamId);
  const activeIds = new Set(members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId));
  for (const share of sharesInput) {
    if (!activeIds.has(share.userId)) {
      const error = new Error('All collection shares must be for active team members.');
      error.status = 400;
      throw error;
    }
  }

  const nowText = new Date().toISOString();
  const collectionId = `collection-${crypto.randomUUID()}`;
  const totalDueMinor = sharesInput.reduce((total, share) => total + share.amountMinor, 0);
  const collection = {
    collectionId,
    teamId,
    title,
    note: String(payload.note || '').trim(),
    status: 'OPEN',
    totalDueMinor,
    totalPrepaidMinor: 0,
    totalSpentMinor: 0,
    createdByUserId: actorUserId,
    createdAt: nowText,
    updatedAt: nowText,
  };
  const shareItems = sharesInput.map((share) => ({
    collectionId,
    teamId,
    userId: share.userId,
    amountDueMinor: share.amountMinor,
    amountPrepaidMinor: 0,
    amountSpentMinor: 0,
    status: 'REQUESTED',
    createdAt: nowText,
    updatedAt: nowText,
  }));

  await batchPut(config.financeTable, [
    collectionPutItem(collection),
    ...shareItems.map(collectionSharePutItem),
  ]);
  await writeAudit(teamId, actorUserId, 'COLLECTION_CREATED', 'COLLECTION', collectionId, {
    title,
    totalDueMinor,
    shareCount: shareItems.length,
  });
  return enrichCollection(collection, shareItems);
};

export const submitCollectionPayment = async (teamId, collectionId, userId, payload) => {
  const collection = await getCollection(teamId, collectionId);
  if (!collection || collection.status !== 'OPEN') {
    const error = new Error('Collection not found or is closed.');
    error.status = 404;
    throw error;
  }
  const share = (collection.shares || []).find((item) => item.userId === userId);
  if (!share) {
    const error = new Error('You are not part of this collection.');
    error.status = 404;
    throw error;
  }
  if (share.status !== 'REQUESTED' && share.status !== 'REJECTED') {
    const error = new Error('This payment has already been submitted or prepaid.');
    error.status = 400;
    throw error;
  }
  if (payload.paymentConfirmed !== true) {
    const error = new Error('Confirm that you have made the payment outside MyTuskers.');
    error.status = 400;
    throw error;
  }
  const nowText = new Date().toISOString();
  const updatedShare = {
    ...share,
    user: undefined,
    status: 'PAYMENT_SUBMITTED',
    paymentConfirmed: true,
    paymentNote: String(payload.note || '').trim(),
    paymentSubmittedAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.financeTable, Item: collectionSharePutItem(updatedShare) }));
  await writeAudit(teamId, userId, 'COLLECTION_PAYMENT_SUBMITTED', 'COLLECTION_SHARE', `${collectionId}:${userId}`, stripKeys(updatedShare));
  return getCollection(teamId, collectionId);
};

export const decideCollectionShare = async (teamId, collectionId, userId, decision, actorUserId) => {
  const collection = await getCollection(teamId, collectionId);
  if (!collection || collection.status !== 'OPEN') {
    const error = new Error('Collection not found or is closed.');
    error.status = 404;
    throw error;
  }
  const share = (collection.shares || []).find((item) => item.userId === userId);
  if (!share) return null;
  if (share.status !== 'PAYMENT_SUBMITTED') {
    const error = new Error('Only submitted payments can be approved or rejected.');
    error.status = 400;
    throw error;
  }
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    const error = new Error('Decision must be APPROVED or REJECTED.');
    error.status = 400;
    throw error;
  }

  const nowText = new Date().toISOString();
  let wallet = null;
  let updatedShare;

  if (decision === 'APPROVED') {
    const result = await postWalletTransaction({
      teamId,
      userId,
      amountMinor: share.amountDueMinor,
      direction: 'CREDIT',
      transactionType: 'COLLECTION_CREDIT',
      reason: `${collection.title} · prepaid`,
      actorUserId,
      referenceType: 'COLLECTION',
      referenceId: collectionId,
      bucket: 'earmarked',
    });
    wallet = result.wallet;
    updatedShare = {
      ...share,
      user: undefined,
      status: 'PREPAID',
      amountPrepaidMinor: Number(share.amountDueMinor || 0),
      decidedByUserId: actorUserId,
      decidedAt: nowText,
      updatedAt: nowText,
    };
  } else {
    updatedShare = {
      ...share,
      user: undefined,
      status: 'REJECTED',
      decidedByUserId: actorUserId,
      decidedAt: nowText,
      updatedAt: nowText,
    };
  }

  await db.send(new PutCommand({ TableName: config.financeTable, Item: collectionSharePutItem(updatedShare) }));
  const refreshed = await getCollection(teamId, collectionId);
  await db.send(new PutCommand({
    TableName: config.financeTable,
    Item: collectionPutItem({
      ...refreshed,
      shares: undefined,
      totalDueMinor: refreshed.totalDueMinor,
      totalPrepaidMinor: refreshed.totalPrepaidMinor,
      totalSpentMinor: refreshed.totalSpentMinor,
      updatedAt: nowText,
    }),
  }));
  await writeAudit(teamId, actorUserId, `COLLECTION_SHARE_${decision}`, 'COLLECTION_SHARE', `${collectionId}:${userId}`, stripKeys(updatedShare));
  return { collection: await getCollection(teamId, collectionId), wallet, share: stripKeys(updatedShare) };
};

/** Captain records that payment was received (cash/EFT), without waiting for player submit. */
export const markCollectionSharePaid = async (teamId, collectionId, userId, actorUserId) => {
  const collection = await getCollection(teamId, collectionId);
  if (!collection || collection.status !== 'OPEN') {
    const error = new Error('Collection not found or is closed.');
    error.status = 404;
    throw error;
  }
  const share = (collection.shares || []).find((item) => item.userId === userId);
  if (!share) return null;
  if (!['REQUESTED', 'REJECTED', 'PAYMENT_SUBMITTED'].includes(share.status)) {
    const error = new Error('Only unpaid or submitted shares can be marked paid.');
    error.status = 400;
    throw error;
  }

  const nowText = new Date().toISOString();
  const result = await postWalletTransaction({
    teamId,
    userId,
    amountMinor: share.amountDueMinor,
    direction: 'CREDIT',
    transactionType: 'COLLECTION_CREDIT',
    reason: `${collection.title} · prepaid`,
    actorUserId,
    referenceType: 'COLLECTION',
    referenceId: collectionId,
    bucket: 'earmarked',
  });
  const updatedShare = {
    ...share,
    user: undefined,
    status: 'PREPAID',
    amountPrepaidMinor: Number(share.amountDueMinor || 0),
    paymentConfirmed: true,
    paymentNote: share.paymentNote || 'Marked paid by captain',
    paymentSubmittedAt: share.paymentSubmittedAt || nowText,
    decidedByUserId: actorUserId,
    decidedAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.financeTable, Item: collectionSharePutItem(updatedShare) }));
  const refreshed = await getCollection(teamId, collectionId);
  await db.send(new PutCommand({
    TableName: config.financeTable,
    Item: collectionPutItem({
      ...refreshed,
      shares: undefined,
      totalDueMinor: refreshed.totalDueMinor,
      totalPrepaidMinor: refreshed.totalPrepaidMinor,
      totalSpentMinor: refreshed.totalSpentMinor,
      updatedAt: nowText,
    }),
  }));
  await writeAudit(teamId, actorUserId, 'COLLECTION_SHARE_MARKED_PAID', 'COLLECTION_SHARE', `${collectionId}:${userId}`, stripKeys(updatedShare));
  return { collection: await getCollection(teamId, collectionId), wallet: result.wallet, share: stripKeys(updatedShare) };
};

export const settleCollection = async (teamId, collectionId, actorUserId, payload = {}) => {
  const collection = await getCollection(teamId, collectionId);
  if (!collection || collection.status !== 'OPEN') {
    const error = new Error('Collection not found or is closed.');
    error.status = 404;
    throw error;
  }

  const spendByUser = new Map();
  for (const entry of Array.isArray(payload.shares) ? payload.shares : []) {
    const userId = String(entry.userId || '').trim();
    if (!userId) continue;
    spendByUser.set(userId, Math.round(Number(entry.amountMinor)));
  }

  const prepaidShares = (collection.shares || []).filter((share) => share.status === 'PREPAID');
  if (!prepaidShares.length) {
    const error = new Error('No prepaid shares are ready to settle.');
    error.status = 400;
    throw error;
  }

  const nowText = new Date().toISOString();
  const settledShares = [];
  const releaseNotices = [];

  for (const share of prepaidShares) {
    const spendMinor = spendByUser.has(share.userId)
      ? spendByUser.get(share.userId)
      : Number(share.amountPrepaidMinor || 0);
    if (!Number.isInteger(spendMinor) || spendMinor < 0) {
      const error = new Error('Spend amounts must be zero or a positive amount in cents.');
      error.status = 400;
      throw error;
    }
    if (spendMinor > Number(share.amountPrepaidMinor || 0)) {
      const error = new Error('Spend cannot exceed the prepaid amount for a player.');
      error.status = 400;
      throw error;
    }

    if (spendMinor > 0) {
      await postWalletTransaction({
        teamId,
        userId: share.userId,
        amountMinor: spendMinor,
        direction: 'DEBIT',
        transactionType: 'COLLECTION_DEBIT',
        reason: `${collection.title} · purchase`,
        actorUserId,
        referenceType: 'COLLECTION',
        referenceId: collectionId,
        bucket: 'earmarked',
      });
    }

    const leftover = Number(share.amountPrepaidMinor || 0) - spendMinor;
    if (leftover > 0) {
      await postWalletTransaction({
        teamId,
        userId: share.userId,
        amountMinor: leftover,
        direction: 'CREDIT',
        transactionType: 'COLLECTION_RELEASE',
        reason: `${collection.title} · unused prepaid released`,
        actorUserId,
        referenceType: 'COLLECTION',
        referenceId: collectionId,
        bucket: 'release',
      });
      releaseNotices.push({ userId: share.userId, amountMinor: leftover });
    }

    const updatedShare = {
      ...share,
      user: undefined,
      status: 'SETTLED',
      amountSpentMinor: spendMinor,
      settledAt: nowText,
      updatedAt: nowText,
    };
    await db.send(new PutCommand({ TableName: config.financeTable, Item: collectionSharePutItem(updatedShare) }));
    settledShares.push(stripKeys(updatedShare));
  }

  const refreshed = await getCollection(teamId, collectionId);
  const openStatuses = new Set(['REQUESTED', 'PAYMENT_SUBMITTED', 'PREPAID', 'REJECTED']);
  const stillOpen = (refreshed.shares || []).some((share) => openStatuses.has(share.status));
  const updatedCollection = {
    ...refreshed,
    shares: undefined,
    status: stillOpen ? 'OPEN' : 'SETTLED',
    settledAt: stillOpen ? refreshed.settledAt : nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.financeTable, Item: collectionPutItem(updatedCollection) }));
  await writeAudit(teamId, actorUserId, 'COLLECTION_SETTLED', 'COLLECTION', collectionId, {
    settledCount: settledShares.length,
    stillOpen,
  });
  return {
    collection: await getCollection(teamId, collectionId),
    settledShares,
    releaseNotices,
  };
};

export const refundCollectionShare = async (teamId, collectionId, userId, actorUserId) => {
  const collection = await getCollection(teamId, collectionId);
  if (!collection) return null;
  const share = (collection.shares || []).find((item) => item.userId === userId);
  if (!share || share.status !== 'PREPAID') {
    const error = new Error('Only prepaid shares can be refunded.');
    error.status = 400;
    throw error;
  }
  const amountMinor = Number(share.amountPrepaidMinor || 0);
  if (amountMinor > 0) {
    await postWalletTransaction({
      teamId,
      userId,
      amountMinor,
      direction: 'DEBIT',
      transactionType: 'COLLECTION_REFUND',
      reason: `${collection.title} · refund`,
      actorUserId,
      referenceType: 'COLLECTION',
      referenceId: collectionId,
      bucket: 'earmarked',
    });
  }
  const nowText = new Date().toISOString();
  const updatedShare = {
    ...share,
    user: undefined,
    status: 'CANCELLED',
    amountPrepaidMinor: 0,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.financeTable, Item: collectionSharePutItem(updatedShare) }));
  await writeAudit(teamId, actorUserId, 'COLLECTION_SHARE_REFUNDED', 'COLLECTION_SHARE', `${collectionId}:${userId}`, stripKeys(updatedShare));
  return getCollection(teamId, collectionId);
};

export const cancelCollection = async (teamId, collectionId, actorUserId) => {
  const collection = await getCollection(teamId, collectionId);
  if (!collection) return null;
  if (collection.status !== 'OPEN') return collection;

  const nowText = new Date().toISOString();
  for (const share of collection.shares || []) {
    if (share.status === 'PREPAID' && Number(share.amountPrepaidMinor || 0) > 0) {
      await postWalletTransaction({
        teamId,
        userId: share.userId,
        amountMinor: share.amountPrepaidMinor,
        direction: 'DEBIT',
        transactionType: 'COLLECTION_REFUND',
        reason: `${collection.title} · refund`,
        actorUserId,
        referenceType: 'COLLECTION',
        referenceId: collectionId,
        bucket: 'earmarked',
      });
    }
    if (['REQUESTED', 'PAYMENT_SUBMITTED', 'PREPAID', 'REJECTED'].includes(share.status)) {
      await db.send(new PutCommand({
        TableName: config.financeTable,
        Item: collectionSharePutItem({
          ...share,
          user: undefined,
          status: 'CANCELLED',
          amountPrepaidMinor: share.status === 'PREPAID' ? 0 : Number(share.amountPrepaidMinor || 0),
          updatedAt: nowText,
        }),
      }));
    }
  }

  const refreshed = await getCollection(teamId, collectionId);
  await db.send(new PutCommand({
    TableName: config.financeTable,
    Item: collectionPutItem({
      ...refreshed,
      shares: undefined,
      status: 'CANCELLED',
      cancelledAt: nowText,
      updatedAt: nowText,
    }),
  }));
  await writeAudit(teamId, actorUserId, 'COLLECTION_CANCELLED', 'COLLECTION', collectionId, { collectionId });
  return getCollection(teamId, collectionId);
};

export const getExpensesForTeam = async (teamId, userId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'EXPENSE#' },
    ScanIndexForward: false,
  }));
  return (result.Items || [])
    .filter((expense) => expense.submittedByUserId === userId || (expense.allocations || []).some((allocation) => allocation.userId === userId))
    .map(stripKeys);
};

export const getExpenseById = async (teamId, expenseId, userId, membership) => {
  const expenses = await listTeamExpenses(teamId);
  const expense = expenses.find((item) => item.expenseId === expenseId);
  if (!expense) return null;
  const canManage = isTeamManagerRole(membership?.role);
  const allocatedToUser = (expense.allocations || []).some((allocation) => allocation.userId === userId);
  if (!canManage && expense.submittedByUserId !== userId && !allocatedToUser) {
    const error = new Error('You do not have access to this expense.');
    error.status = 403;
    throw error;
  }
  const allocations = await Promise.all((expense.allocations || []).map(async (allocation) => {
    const user = await getUserById(allocation.userId);
    return { ...allocation, user: stripKeys(user) };
  }));
  return { ...expense, allocations };
};

const splitEqual = (amountMinor, userIds) => {
  const amount = Number(amountMinor || 0);
  const base = Math.floor(amount / userIds.length);
  let remainder = amount - base * userIds.length;
  return userIds.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId, amountMinor: base + extra };
  });
};

const createExpenseWithSubmitter = async (teamId, submittedByUserId, payload, actorUserId = submittedByUserId) => {
  const title = String(payload.title || payload.description || '').trim();
  const amountMinor = Math.round(Number(payload.amountMinor || 0));
  if (!title) {
    const error = new Error('Description is required.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    const error = new Error('Amount must be greater than zero.');
    error.status = 400;
    throw error;
  }

  const requestedAppliesTo = ['SELF', 'SELECTED_PLAYERS', 'WHOLE_TEAM', 'TEAM_WALLET'].includes(payload.appliesTo) ? payload.appliesTo : 'SELF';
  const appliesTo = requestedAppliesTo === 'TEAM_WALLET' ? 'WHOLE_TEAM' : requestedAppliesTo;
  const members = await getTeamMembers(teamId);
  const activePlayerIds = members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId);
  let allocationUserIds = [submittedByUserId];
  if (appliesTo === 'WHOLE_TEAM') allocationUserIds = activePlayerIds;
  if (appliesTo === 'SELECTED_PLAYERS') {
    const selected = Array.isArray(payload.selectedUserIds) ? payload.selectedUserIds.filter((userId) => activePlayerIds.includes(userId)) : [];
    if (!selected.length) {
      const error = new Error('Select at least one active player.');
      error.status = 400;
      throw error;
    }
    allocationUserIds = selected;
  }

  const allocations = splitEqual(amountMinor, allocationUserIds);
  const submitterAllocation = allocations.find((item) => item.userId === submittedByUserId)?.amountMinor || 0;
  const nowText = new Date().toISOString();
  const expenseId = `expense-${crypto.randomUUID()}`;
  const expense = {
    PK: `TEAM#${teamId}`,
    SK: `EXPENSE#${nowText}#${expenseId}`,
    GSI1PK: `EXPENSE#${expenseId}`,
    GSI1SK: 'META',
    entityType: 'EXPENSE',
    expenseId,
    teamId,
    submittedByUserId,
    title,
    amountMinor,
    status: 'SUBMITTED',
    appliesTo,
    splitMethod: 'EQUAL',
    expenseDate: payload.expenseDate || nowText.slice(0, 10),
    allocations,
    pendingAllocatedMinor: submitterAllocation,
    createdAt: nowText,
    updatedAt: nowText,
  };

  const walletItems = await Promise.all(allocations.map(async (allocation) => {
    const wallet = await getWalletForUser(teamId, allocation.userId);
    const pendingMinor = Number(wallet.pendingMinor || 0) + Number(allocation.amountMinor || 0);
    return {
      PK: `TEAM#${teamId}`,
      SK: `WALLET#PLAYER#${allocation.userId}`,
      GSI1PK: `WALLET#${wallet.walletId}`,
      GSI1SK: 'PROFILE',
      entityType: 'WALLET',
      ...wallet,
      pendingMinor,
      projectedMinor: Number(wallet.availableMinor || 0) - pendingMinor,
      updatedAt: nowText,
    };
  }));
  const submitterWallet = walletItems.find((wallet) => wallet.ownerUserId === submittedByUserId) || await getWalletForUser(teamId, submittedByUserId);

  await batchPut(config.financeTable, [expense, ...walletItems]);
  await writeAudit(teamId, actorUserId, 'EXPENSE_SUBMITTED', 'EXPENSE', expenseId, stripKeys(expense));
  return { expense: stripKeys(expense), wallet: stripKeys(submitterWallet) };
};

export const createExpense = async (teamId, actorUserId, payload) => createExpenseWithSubmitter(teamId, actorUserId, payload, actorUserId);

export const createCaptainExpense = async (teamId, actorUserId, payload) => {
  const members = await getTeamMembers(teamId);
  const activePlayerIds = members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId);
  const submittedByUserId = payload.paidByUserId || actorUserId;
  if (!activePlayerIds.includes(submittedByUserId)) {
    const error = new Error('Paid by must be an active player.');
    error.status = 400;
    throw error;
  }
  return createExpenseWithSubmitter(teamId, submittedByUserId, payload, actorUserId);
};

export const listTeamExpenses = async (teamId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.financeTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'EXPENSE#' },
    ScanIndexForward: false,
  }));
  const expenses = [];
  for (const expense of result.Items || []) {
    const submitter = await getUserById(expense.submittedByUserId);
    expenses.push({ ...stripKeys(expense), submitter: stripKeys(submitter) });
  }
  return expenses;
};

const allocationsForExpense = (expense) => {
  if (Array.isArray(expense.allocations) && expense.allocations.length) return expense.allocations;
  if (expense.submittedByUserId) return [{ userId: expense.submittedByUserId, amountMinor: Number(expense.amountMinor || 0) }];
  return [];
};

const buildExpenseAllocations = async (teamId, submittedByUserId, payload) => {
  const amountMinor = Math.round(Number(payload.amountMinor || 0));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    const error = new Error('Amount must be greater than zero.');
    error.status = 400;
    throw error;
  }
  const requestedAppliesTo = ['SELF', 'SELECTED_PLAYERS', 'WHOLE_TEAM', 'TEAM_WALLET'].includes(payload.appliesTo) ? payload.appliesTo : 'SELF';
  const appliesTo = requestedAppliesTo === 'TEAM_WALLET' ? 'WHOLE_TEAM' : requestedAppliesTo;
  const members = await getTeamMembers(teamId);
  const activePlayerIds = members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId);
  if (!activePlayerIds.includes(submittedByUserId)) {
    const error = new Error('Paid by must be an active player.');
    error.status = 400;
    throw error;
  }
  let allocationUserIds = [submittedByUserId];
  if (appliesTo === 'WHOLE_TEAM') allocationUserIds = activePlayerIds;
  if (appliesTo === 'SELECTED_PLAYERS') {
    const selected = Array.isArray(payload.selectedUserIds) ? payload.selectedUserIds.filter((userId) => activePlayerIds.includes(userId)) : [];
    if (!selected.length) {
      const error = new Error('Select at least one active player.');
      error.status = 400;
      throw error;
    }
    allocationUserIds = selected;
  }
  return {
    amountMinor,
    appliesTo,
    allocations: splitEqual(amountMinor, allocationUserIds),
  };
};

export const updateSubmittedExpense = async (teamId, expenseId, payload, actorUserId) => {
  const expenses = await listTeamExpenses(teamId);
  const expense = expenses.find((item) => item.expenseId === expenseId);
  if (!expense) return null;
  if (expense.status !== 'SUBMITTED') {
    const error = new Error('Only submitted expenses can be edited.');
    error.status = 409;
    throw error;
  }
  const title = String(payload.title || payload.description || expense.title || '').trim();
  if (!title) {
    const error = new Error('Description is required.');
    error.status = 400;
    throw error;
  }
  const submittedByUserId = payload.paidByUserId || expense.submittedByUserId;
  const { amountMinor, appliesTo, allocations } = await buildExpenseAllocations(teamId, submittedByUserId, {
    amountMinor: payload.amountMinor ?? expense.amountMinor,
    appliesTo: payload.appliesTo || expense.appliesTo,
    selectedUserIds: payload.selectedUserIds,
  });
  const nowText = new Date().toISOString();
  const oldPending = new Map();
  const newPending = new Map();
  for (const allocation of allocationsForExpense(expense)) oldPending.set(allocation.userId, Number(allocation.amountMinor || 0));
  for (const allocation of allocations) newPending.set(allocation.userId, Number(allocation.amountMinor || 0));

  const walletItems = [];
  for (const userId of new Set([...oldPending.keys(), ...newPending.keys()])) {
    const wallet = await getWalletForUser(teamId, userId);
    const pendingMinor = Math.max(0, Number(wallet.pendingMinor || 0) - Number(oldPending.get(userId) || 0) + Number(newPending.get(userId) || 0));
    walletItems.push(walletPutItem(wallet, {
      pendingMinor,
      projectedMinor: Number(wallet.availableMinor || 0) - pendingMinor,
      updatedAt: nowText,
    }));
  }

  const item = {
    PK: `TEAM#${teamId}`,
    SK: `EXPENSE#${expense.createdAt}#${expense.expenseId}`,
    GSI1PK: `EXPENSE#${expense.expenseId}`,
    GSI1SK: 'META',
    entityType: 'EXPENSE',
    ...expense,
    submitter: undefined,
    submittedByUserId,
    title,
    amountMinor,
    appliesTo,
    expenseDate: payload.expenseDate || expense.expenseDate,
    allocations,
    pendingAllocatedMinor: allocations.find((allocation) => allocation.userId === submittedByUserId)?.amountMinor || 0,
    updatedAt: nowText,
  };
  await batchPut(config.financeTable, [item, ...walletItems]);
  await writeAudit(teamId, actorUserId, 'EXPENSE_UPDATED', 'EXPENSE', expenseId, stripKeys(item));
  return stripKeys(item);
};

export const updateExpenseStatus = async (teamId, expenseId, status, actorUserId) => {
  const expenses = await listTeamExpenses(teamId);
  const expense = expenses.find((item) => item.expenseId === expenseId);
  if (!expense) return null;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    const error = new Error('Unsupported expense decision.');
    error.status = 400;
    throw error;
  }
  if (expense.status !== 'SUBMITTED') return expense;
  const nowText = new Date().toISOString();
  const item = {
    PK: `TEAM#${teamId}`,
    SK: `EXPENSE#${expense.createdAt}#${expense.expenseId}`,
    GSI1PK: `EXPENSE#${expense.expenseId}`,
    GSI1SK: 'META',
    entityType: 'EXPENSE',
    ...expense,
    submitter: undefined,
    status,
    approvedByUserId: status === 'APPROVED' ? actorUserId : expense.approvedByUserId,
    rejectedByUserId: status === 'REJECTED' ? actorUserId : expense.rejectedByUserId,
    decidedAt: nowText,
    updatedAt: nowText,
  };

  const walletItems = [];
  const transactionItems = [];
  for (const allocation of allocationsForExpense(expense)) {
    const wallet = await getWalletForUser(teamId, allocation.userId);
    const amount = Number(allocation.amountMinor || 0);
    const pendingMinor = Math.max(0, Number(wallet.pendingMinor || 0) - amount);
    const availableMinor = status === 'APPROVED'
      ? Number(wallet.availableMinor || 0) - amount
      : Number(wallet.availableMinor || 0);
    walletItems.push(walletPutItem(wallet, {
      pendingMinor,
      availableMinor,
      projectedMinor: availableMinor - pendingMinor,
      updatedAt: nowText,
    }));
    if (status === 'APPROVED' && amount > 0) {
      transactionItems.push(createWalletTransactionItem({
        teamId,
        wallet,
        userId: allocation.userId,
        amountMinor: amount,
        direction: 'DEBIT',
        transactionType: 'EXPENSE_DEBIT',
        reason: expense.title,
        actorUserId,
        referenceType: 'EXPENSE',
        referenceId: expense.expenseId,
        createdAt: nowText,
      }));
    }
  }

  await batchPut(config.financeTable, [item, ...walletItems, ...transactionItems]);
  await writeAudit(teamId, actorUserId, `EXPENSE_${status}`, 'EXPENSE', expenseId, { status });
  return stripKeys(item);
};

export const getMatchesForTeam = async (teamId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'MATCH#' },
  }));
  const byMatchId = new Map();
  for (const item of result.Items || []) {
    const current = byMatchId.get(item.matchId);
    const itemScore = `${item.availabilityRequestedAt ? '1' : '0'}#${item.updatedAt || item.createdAt || ''}`;
    const currentScore = current ? `${current.availabilityRequestedAt ? '1' : '0'}#${current.updatedAt || current.createdAt || ''}` : '';
    if (!current || itemScore > currentScore) byMatchId.set(item.matchId, item);
  }
  return [...byMatchId.values()]
    .map((match) => ({ ...match, status: normalizeMatchStatus(match.status) }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map(stripKeys);
};

export const createMatch = async (teamId, data, actorUserId) => {
  const nowText = new Date().toISOString();
  const matchId = `match-${crypto.randomUUID()}`;
  const startAt = data.startAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const opponent = String(data.opponent || '').trim();
  const venueName = String(data.venueName || '').trim();
  if (!opponent) {
    const error = new Error('Opponent is required.');
    error.status = 400;
    throw error;
  }
  if (!venueName) {
    const error = new Error('Venue is required.');
    error.status = 400;
    throw error;
  }
  const match = {
    PK: `TEAM#${teamId}`,
    SK: `MATCH#${startAt}#${matchId}`,
    GSI1PK: `MATCH#${matchId}`,
    GSI1SK: `TEAM#${teamId}`,
    entityType: 'MATCH',
    matchId,
    teamId,
    opponent,
    competition: data.competition || 'Scheduled match',
    matchFormat: data.matchFormat || 'Cricket',
    gameType: data.gameType || (String(data.competition || data.matchFormat || '').toLowerCase().includes('friendly') ? 'FRIENDLY' : 'TOURNAMENT'),
    matchFeeMinor: Math.max(0, Math.round(Number(data.matchFeeMinor || 0))),
    startAt,
    arrivalAt: data.arrivalAt,
    endAt: data.endAt,
    timezone: 'Australia/Melbourne',
    venueName,
    venueAddress: data.venueAddress,
    notes: data.notes,
    availabilityDeadline: data.availabilityDeadline,
    status: normalizeMatchStatus(data.status),
    createdByUserId: actorUserId,
    createdAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: match }));
  await writeAudit(teamId, actorUserId, 'MATCH_CREATED', 'MATCH', matchId, stripKeys(match));
  return stripKeys(match);
};

export const getMatch = async (teamId, matchId) => {
  const matches = await getMatchesForTeam(teamId);
  return matches.find((match) => match.matchId === matchId) || null;
};

const refundMatchFeesForCancelledMatch = async (teamId, matchId, actorUserId) => {
  const transactions = await listTeamWalletTransactions(teamId);
  const feeDebits = transactions.filter((transaction) => transaction.referenceType === 'MATCH_FEE' && transaction.referenceId === matchId && transaction.transactionType === 'MATCH_FEE_DEBIT');
  const existingRefundUserIds = new Set(transactions
    .filter((transaction) => transaction.referenceType === 'MATCH_FEE_REFUND' && transaction.referenceId === matchId && transaction.transactionType === 'MATCH_FEE_REFUND')
    .map((transaction) => transaction.ownerUserId));
  const refunds = [];
  for (const debit of feeDebits) {
    if (!debit.ownerUserId || existingRefundUserIds.has(debit.ownerUserId)) continue;
    const result = await postWalletTransaction({
      teamId,
      userId: debit.ownerUserId,
      amountMinor: debit.amountMinor,
      direction: 'CREDIT',
      transactionType: 'MATCH_FEE_REFUND',
      reason: `Refund: ${debit.reason}`,
      actorUserId,
      referenceType: 'MATCH_FEE_REFUND',
      referenceId: matchId,
    });
    refunds.push(result.transaction);
  }
  if (refunds.length) {
    await writeAudit(teamId, actorUserId, 'MATCH_FEES_REFUNDED', 'MATCH', matchId, { refundedUserIds: refunds.map((tx) => tx.ownerUserId) });
  }
  return refunds.map(stripKeys);
};

export const updateMatch = async (teamId, matchId, changes, actorUserId) => {
  const current = await getMatch(teamId, matchId);
  if (!current) return null;
  const nowText = new Date().toISOString();
  const startAt = changes.startAt ? new Date(changes.startAt).toISOString() : current.startAt;
  const status = changes.status !== undefined
    ? normalizeMatchStatus(changes.status, current.status || 'SCHEDULED')
    : normalizeMatchStatus(current.status);
  // A result only describes a played match, so reopening or cancelling drops it
  // rather than leaving a stale "Won" on a fixture that is live again.
  const keepsResult = status === 'COMPLETED';
  const resultSummary = changes.resultSummary !== undefined
    ? String(changes.resultSummary || '').trim().slice(0, MATCH_RESULT_SUMMARY_MAX) || undefined
    : current.resultSummary;
  const updated = {
    ...current,
    PK: `TEAM#${teamId}`,
    SK: `MATCH#${startAt}#${matchId}`,
    GSI1PK: `MATCH#${matchId}`,
    GSI1SK: `TEAM#${teamId}`,
    entityType: 'MATCH',
    opponent: changes.opponent !== undefined ? String(changes.opponent || '').trim() : current.opponent,
    competition: changes.competition !== undefined ? String(changes.competition || '').trim() : current.competition,
    matchFormat: changes.matchFormat !== undefined ? String(changes.matchFormat || '').trim() : current.matchFormat,
    gameType: changes.gameType || current.gameType,
    matchFeeMinor: changes.matchFeeMinor !== undefined ? Math.max(0, Math.round(Number(changes.matchFeeMinor || 0))) : Number(current.matchFeeMinor || 0),
    startAt,
    arrivalAt: changes.arrivalAt !== undefined ? changes.arrivalAt : current.arrivalAt,
    endAt: changes.endAt !== undefined ? changes.endAt : current.endAt,
    venueName: changes.venueName !== undefined ? String(changes.venueName || '').trim() : current.venueName,
    venueAddress: changes.venueAddress !== undefined ? changes.venueAddress : current.venueAddress,
    notes: changes.notes !== undefined ? changes.notes : current.notes,
    availabilityDeadline: changes.availabilityDeadline !== undefined ? changes.availabilityDeadline : current.availabilityDeadline,
    status,
    result: keepsResult ? (changes.result !== undefined ? normalizeMatchResult(changes.result) : current.result) : undefined,
    resultSummary: keepsResult ? resultSummary : undefined,
    completedAt: changes.status === 'COMPLETED' ? nowText : (changes.status === 'SCHEDULED' ? undefined : current.completedAt),
    cancelledAt: changes.status === 'CANCELLED' ? nowText : (changes.status === 'SCHEDULED' ? undefined : current.cancelledAt),
    updatedAt: nowText,
  };
  if (!updated.opponent) {
    const error = new Error('Opponent is required.');
    error.status = 400;
    throw error;
  }
  if (!updated.venueName) {
    const error = new Error('Venue is required.');
    error.status = 400;
    throw error;
  }
  if (current.startAt !== startAt) {
    await db.send(new DeleteCommand({
      TableName: config.coreTable,
      Key: { PK: `TEAM#${teamId}`, SK: `MATCH#${current.startAt}#${matchId}` },
    }));
  }
  await db.send(new PutCommand({ TableName: config.coreTable, Item: updated }));
  if (updated.status === 'CANCELLED' && current.status !== 'CANCELLED') {
    await refundMatchFeesForCancelledMatch(teamId, matchId, actorUserId);
  }
  await writeAudit(teamId, actorUserId, 'MATCH_UPDATED', 'MATCH', matchId, stripKeys(updated));
  return stripKeys(updated);
};

export const deleteMatch = async (teamId, matchId, actorUserId) => {
  const match = await getMatch(teamId, matchId);
  if (!match) return null;
  const lineup = await getLineup(matchId);
  if (lineup?.status === 'PUBLISHED') {
    const error = new Error('Published matches cannot be deleted. Cancel or complete the match instead.');
    error.status = 400;
    throw error;
  }

  const related = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `MATCH#${matchId}` },
  }));
  for (const item of related.Items || []) {
    await db.send(new DeleteCommand({
      TableName: config.coreTable,
      Key: { PK: item.PK, SK: item.SK },
    }));
  }
  await db.send(new DeleteCommand({
    TableName: config.coreTable,
    Key: { PK: `TEAM#${teamId}`, SK: `MATCH#${match.startAt}#${matchId}` },
  }));
  await writeAudit(teamId, actorUserId, 'MATCH_DELETED', 'MATCH', matchId, stripKeys(match));
  return { deleted: true, matchId };
};

export const requestAvailabilityForMatch = async (teamId, matchId, actorUserId, payload = {}) => {
  const match = await getMatch(teamId, matchId);
  if (!match) return null;
  if (['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match.status)) {
    const error = new Error('Availability cannot be requested for a closed match.');
    error.status = 400;
    throw error;
  }
  const nowText = new Date().toISOString();
  const deadline = payload.availabilityDeadline || match.availabilityDeadline || new Date(new Date(match.startAt).getTime() - 48 * 60 * 60 * 1000).toISOString();
  const item = {
    PK: `TEAM#${teamId}`,
    SK: `MATCH#${match.startAt}#${match.matchId}`,
    GSI1PK: `MATCH#${match.matchId}`,
    GSI1SK: `TEAM#${teamId}`,
    entityType: 'MATCH',
    ...match,
    availabilityRequestedAt: match.availabilityRequestedAt || nowText,
    availabilityRequestedByUserId: actorUserId,
    availabilityDeadline: deadline,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: item }));
  await writeAudit(teamId, actorUserId, 'AVAILABILITY_REQUESTED', 'MATCH', matchId, stripKeys(item));
  return stripKeys(item);
};

export const getAvailabilityForMatch = async (matchId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `MATCH#${matchId}`, ':sk': 'AVAILABILITY#' },
  }));
  return (result.Items || []).map(stripKeys);
};

export const putAvailability = async (teamId, matchId, userId, status, note = '') => {
  const item = {
    PK: `MATCH#${matchId}`,
    SK: `AVAILABILITY#${userId}`,
    entityType: 'AVAILABILITY',
    teamId,
    matchId,
    userId,
    status,
    note,
    respondedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: item }));
  return stripKeys(item);
};

export const CAPTAIN_AVAILABILITY_STATUSES = ['AVAILABLE', 'MAYBE', 'UNAVAILABLE'];

// Parallel to the player-owned AVAILABILITY# rows. The captain's list is their
// own working view and deliberately never overwrites what a player answered.
export const getCaptainAvailabilityForMatch = async (matchId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `MATCH#${matchId}`, ':sk': 'CAPTAIN_AVAILABILITY#' },
  }));
  return (result.Items || []).map(stripKeys);
};

export const putCaptainAvailability = async (teamId, matchId, userId, actorUserId, status, note = '') => {
  if (!CAPTAIN_AVAILABILITY_STATUSES.includes(status)) {
    const error = new Error(`Status must be one of ${CAPTAIN_AVAILABILITY_STATUSES.join(', ')}.`);
    error.status = 400;
    throw error;
  }
  const membership = await getTeamMembership(teamId, userId);
  if (!membership || membership.status !== 'ACTIVE') {
    const error = new Error('Choose an active player from this team.');
    error.status = 400;
    throw error;
  }
  const nowText = new Date().toISOString();
  const item = {
    PK: `MATCH#${matchId}`,
    SK: `CAPTAIN_AVAILABILITY#${userId}`,
    entityType: 'CAPTAIN_AVAILABILITY',
    teamId,
    matchId,
    userId,
    status,
    note: String(note || '').slice(0, 280),
    setByUserId: actorUserId,
    setAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: item }));
  await writeAudit(teamId, actorUserId, 'CAPTAIN_AVAILABILITY_SET', 'MATCH', matchId, stripKeys(item));
  return stripKeys(item);
};

export const clearCaptainAvailability = async (teamId, matchId, userId, actorUserId) => {
  await db.send(new DeleteCommand({
    TableName: config.coreTable,
    Key: { PK: `MATCH#${matchId}`, SK: `CAPTAIN_AVAILABILITY#${userId}` },
  }));
  await writeAudit(teamId, actorUserId, 'CAPTAIN_AVAILABILITY_CLEARED', 'MATCH', matchId, { matchId, userId });
  return { matchId, userId, cleared: true };
};

export const putCaptainAvailabilityBulk = async (teamId, matchId, actorUserId, entries) => {
  if (!Array.isArray(entries) || !entries.length) {
    const error = new Error('Provide at least one player to mark.');
    error.status = 400;
    throw error;
  }
  const saved = [];
  for (const entry of entries.slice(0, 40)) {
    saved.push(await putCaptainAvailability(teamId, matchId, entry.userId, actorUserId, entry.status, entry.note));
  }
  return saved;
};

const summariseCaptainAvailability = (captainRows, activePlayers) => {
  const summary = { AVAILABLE: 0, UNAVAILABLE: 0, MAYBE: 0, NOT_MARKED: 0 };
  for (const player of activePlayers) {
    const row = captainRows.find((item) => item.userId === player.userId);
    summary[row?.status || 'NOT_MARKED'] += 1;
  }
  return summary;
};

export const getLineup = async (matchId) => {
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: { PK: `MATCH#${matchId}`, SK: 'LINEUP#CURRENT' },
  }));
  if (!result.Item) return null;
  const lineup = stripKeys(result.Item);
  const hydratePlayer = async (player) => {
    if (!player.userId) {
      const displayName = player.displayName || player.guestName || 'Guest player';
      return {
        ...player,
        displayName,
        initials: player.initials || displayName.slice(0, 2).toUpperCase(),
        isGuest: true,
      };
    }
    const user = await getUserById(player.userId);
    return {
      ...player,
      displayName: user?.displayName || player.userId,
      initials: user?.initials || user?.displayName?.slice(0, 2).toUpperCase() || 'MT',
    };
  };
  lineup.startingPlayers = await Promise.all((lineup.startingPlayers || []).map(hydratePlayer));
  lineup.reservePlayers = await Promise.all((lineup.reservePlayers || []).map(hydratePlayer));
  return lineup;
};

export const getCaptainMatchAward = async (teamId, matchId) => {
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: { PK: `MATCH#${matchId}`, SK: 'AWARD#CAPTAIN_MOTM' },
  }));
  if (!result.Item || result.Item.teamId !== teamId) return null;
  return stripKeys(result.Item);
};

export const saveCaptainMatchAward = async (teamId, matchId, data, actorUserId) => {
  const match = await getMatch(teamId, matchId);
  if (!match) {
    const error = new Error('Match not found.');
    error.status = 404;
    throw error;
  }
  const lineup = await getLineup(matchId);
  if (lineup?.status !== 'PUBLISHED') {
    const error = new Error('Captain’s Man of the Match can only be set after the lineup is published.');
    error.status = 400;
    throw error;
  }

  const recipientKey = String(data.recipientKey || '').trim();
  const recipientUserId = String(data.recipientUserId || '').trim();
  const recipientGuestName = String(data.recipientGuestName || '').trim();
  const players = lineup.startingPlayers || [];
  const recipient = players.find((player) => {
    const guestName = player.guestName || player.displayName || '';
    return (recipientKey && (recipientKey === `USER#${player.userId}` || recipientKey === `GUEST#${guestName}`))
      || (recipientUserId && player.userId === recipientUserId)
      || (recipientGuestName && !player.userId && guestName === recipientGuestName);
  });

  if (!recipient) {
    const error = new Error('Award recipient must be in the published lineup.');
    error.status = 400;
    throw error;
  }

  const nowText = new Date().toISOString();
  const existing = await getCaptainMatchAward(teamId, matchId);
  const displayName = recipient.displayName || recipient.guestName || recipient.userId;
  const item = {
    PK: `MATCH#${matchId}`,
    SK: 'AWARD#CAPTAIN_MOTM',
    entityType: 'CAPTAIN_MATCH_AWARD',
    teamId,
    matchId,
    awardType: 'CAPTAIN_MOTM',
    recipientType: recipient.userId ? 'PLAYER' : 'GUEST',
    recipientUserId: recipient.userId,
    recipientGuestName: recipient.userId ? undefined : displayName,
    recipientDisplayName: displayName,
    reason: String(data.reason || '').trim().slice(0, 280),
    awardedByUserId: actorUserId,
    createdAt: existing?.createdAt || nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: item }));
  await writeAudit(teamId, actorUserId, existing ? 'CAPTAIN_MOTM_UPDATED' : 'CAPTAIN_MOTM_SET', 'MATCH', matchId, stripKeys(item));
  return stripKeys(item);
};

const getAppreciationPostItem = async (teamId, postId) => {
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: { PK: `TEAM#${teamId}`, SK: `APPRECIATION#${postId}` },
  }));
  return result.Item || null;
};

const getAppreciationLikeRows = async (teamId, postId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `TEAM#${teamId}`,
      ':sk': `APPRECIATION_LIKE#${postId}#`,
    },
  }));
  return result.Items || [];
};

const getAppreciationCommentRowItems = async (teamId, postId) => {
  const result = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `TEAM#${teamId}`,
      ':sk': `APPRECIATION_COMMENT#${postId}#`,
    },
  }));
  return (result.Items || [])
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
};

const getAppreciationCommentRows = async (teamId, postId, loadUser = getUserById) => {
  const comments = await getAppreciationCommentRowItems(teamId, postId);
  return Promise.all(comments.map(async (comment) => {
    const author = comment.authorUserId ? await loadUser(comment.authorUserId) : null;
    return stripKeys({
      ...comment,
      authorPhotoUrl: author?.photoUrl || comment.authorPhotoUrl || '',
      authorInitials: author?.initials || comment.authorInitials,
      authorDisplayName: author?.preferredName || author?.displayName || comment.authorDisplayName,
    });
  }));
};

const FEED_MEDIA_PREFIX = 'feed-media';
const FEED_MEDIA_MAX_BYTES = 4 * 1024 * 1024;

// Uploaded when the crop is confirmed, before the post exists. An upload the
// user abandons is an orphan until the bucket lifecycle rule sweeps the prefix.
export const uploadAppreciationMedia = async (teamId, payload) => {
  const contentType = String(payload?.contentType || '');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    const error = new Error('Photo must be JPEG, PNG, or WebP.');
    error.status = 400;
    throw error;
  }
  const width = Math.round(Number(payload?.width) || 0);
  const height = Math.round(Number(payload?.height) || 0);
  if (width <= 0 || height <= 0) {
    const error = new Error('Photo dimensions are required.');
    error.status = 400;
    throw error;
  }

  const base64 = String(payload?.dataUrl || '').split(',').pop();
  const body = Buffer.from(base64 || '', 'base64');
  if (!body.length || body.length > FEED_MEDIA_MAX_BYTES) {
    const error = new Error('Photo must be between 1 byte and 4 MB.');
    error.status = 400;
    throw error;
  }

  const key = `${FEED_MEDIA_PREFIX}/${teamId}/${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
  await s3.send(new PutObjectCommand({
    Bucket: config.receiptsBucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return {
    key,
    // Served straight off S3 through the CloudFront /feed-media/* behaviour in
    // production, and by the local passthrough route in development.
    url: `/${key}`,
    width,
    height,
    contentType,
    dominantColor: String(payload?.dominantColor || '').slice(0, 32),
  };
};

// Only keys this API issued may be attached, so a client cannot point a post at
// an arbitrary object in the bucket.
const sanitiseAppreciationMedia = (media, teamId) => {
  if (!Array.isArray(media)) return [];
  return media.slice(0, 1).map((entry) => {
    const key = String(entry?.key || '');
    if (!key.startsWith(`${FEED_MEDIA_PREFIX}/${teamId}/`)) {
      const error = new Error('Photo reference is not valid for this team.');
      error.status = 400;
      throw error;
    }
    return {
      key,
      url: `/${key}`,
      width: Math.round(Number(entry?.width) || 0),
      height: Math.round(Number(entry?.height) || 0),
      contentType: String(entry?.contentType || 'image/jpeg'),
      dominantColor: String(entry?.dominantColor || '').slice(0, 32),
    };
  });
};

// Dynamo TTL never touches S3, so deleting a post has to clear its media too.
// A failure here must not block the delete; the lifecycle rule sweeps orphans.
const deleteAppreciationMedia = async (media) => {
  for (const entry of media || []) {
    if (!entry?.key) continue;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: config.receiptsBucket, Key: entry.key }));
    } catch (error) {
      console.error('Failed to delete feed media', entry.key, error);
    }
  }
};

const summariseLiker = (user, like) => ({
  userId: like.userId,
  displayName: user?.preferredName || user?.displayName || 'Team member',
  initials: user?.initials || (user?.preferredName || user?.displayName || 'TM').slice(0, 2).toUpperCase(),
  photoUrl: user?.photoUrl || '',
  likedAt: like.createdAt,
});

// Like rows already carry one row per user, so "who liked this" needs no new
// storage. Newest first, since the card only shows the most recent few.
const hydrateLikers = async (likeRows, loadUser, limit) => {
  const ordered = [...likeRows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const selected = typeof limit === 'number' ? ordered.slice(0, limit) : ordered;
  return Promise.all(selected.map(async (like) => summariseLiker(await loadUser(like.userId), like)));
};

// Comment notifications only need the handful of people attached to one post,
// so resolve them directly instead of paging the whole feed to find it.
export const getAppreciationPostParticipants = async (teamId, postId) => {
  const [post, comments] = await Promise.all([
    getAppreciationPostItem(teamId, postId),
    getAppreciationCommentRows(teamId, postId),
  ]);
  if (!post) return null;
  return {
    postId,
    authorUserId: post.authorUserId,
    recipientUserId: post.recipientUserId,
    commenterUserIds: comments.map((comment) => comment.authorUserId).filter(Boolean),
  };
};

export const APPRECIATION_RETENTION_DAYS = 30;
const APPRECIATION_CARD_LIKER_COUNT = 3;
const APPRECIATION_PAGE_SIZE = 20;
const APPRECIATION_MAX_PAGE_SIZE = 50;
// Guards the short-page loop below so a partition full of swept-but-not-deleted
// rows can never turn one feed request into unbounded querying.
const APPRECIATION_MAX_QUERY_ROUNDS = 5;

const appreciationFeedKey = (teamId) => `TEAM#${teamId}#FEED`;

const encodeFeedCursor = (item) => (item
  ? Buffer.from(JSON.stringify({
    PK: item.PK,
    SK: item.SK,
    GSI1PK: item.GSI1PK,
    GSI1SK: item.GSI1SK,
  }), 'utf8').toString('base64url')
  : null);

const decodeFeedCursor = (cursor) => {
  if (!cursor) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
  } catch {
    parsed = null;
  }
  if (!parsed?.PK || !parsed?.SK || !parsed?.GSI1PK || !parsed?.GSI1SK) {
    const error = new Error('Invalid feed cursor.');
    error.status = 400;
    throw error;
  }
  return parsed;
};

export const listAppreciationPosts = async (teamId, userId, options = {}) => {
  const loadUser = createUserLoader();
  const nowEpoch = Math.floor(Date.now() / 1000);
  const pageSize = Math.min(
    Math.max(Number(options.limit) || APPRECIATION_PAGE_SIZE, 1),
    APPRECIATION_MAX_PAGE_SIZE,
  );
  let exclusiveStartKey = decodeFeedCursor(options.cursor);

  // GSI1 orders the feed by createdAt so DynamoDB can hand back the newest page
  // directly. TTL deletion lags expiry by up to 48h, so the filter can still
  // shrink a page below pageSize; keep pulling until the page is full.
  const rows = [];
  let exhausted = false;
  for (let round = 0; round < APPRECIATION_MAX_QUERY_ROUNDS; round += 1) {
    const result = await db.send(new QueryCommand({
      TableName: config.coreTable,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: 'expiresAtEpoch > :now',
      ExpressionAttributeValues: { ':pk': appreciationFeedKey(teamId), ':now': nowEpoch },
      ScanIndexForward: false,
      Limit: pageSize,
      ExclusiveStartKey: exclusiveStartKey,
    }));
    rows.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
    if (!exclusiveStartKey) {
      exhausted = true;
      break;
    }
    if (rows.length >= pageSize) break;
  }

  const activePosts = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize || !exhausted;
  const nextCursor = hasMore ? encodeFeedCursor(activePosts[activePosts.length - 1]) : null;

  const posts = await Promise.all(activePosts.map(async (item) => {
    const [likes, comments, author, recipient] = await Promise.all([
      getAppreciationLikeRows(teamId, item.postId),
      getAppreciationCommentRows(teamId, item.postId, loadUser),
      item.authorUserId ? loadUser(item.authorUserId) : null,
      item.recipientUserId ? loadUser(item.recipientUserId) : null,
    ]);
    return {
      ...stripKeys(item),
      authorDisplayName: author?.preferredName || author?.displayName || item.authorDisplayName,
      authorInitials: author?.initials || item.authorInitials,
      authorPhotoUrl: author?.photoUrl || item.authorPhotoUrl || '',
      recipientDisplayName: recipient ? (recipient.preferredName || recipient.displayName || item.recipientDisplayName) : item.recipientDisplayName,
      recipientInitials: recipient?.initials || item.recipientInitials,
      recipientPhotoUrl: recipient?.photoUrl || item.recipientPhotoUrl || '',
      // Cards only render the latest comment; the detail route serves the rest.
      latestComment: comments[comments.length - 1] || null,
      commentCount: comments.length,
      reactionSummary: {
        likeCount: likes.length,
        likedByMe: likes.some((like) => like.userId === userId),
        topLikers: await hydrateLikers(likes, loadUser, APPRECIATION_CARD_LIKER_COUNT),
      },
    };
  }));

  return { posts, nextCursor };
};

export const getAppreciationPostDetail = async (teamId, postId, userId) => {
  const loadUser = createUserLoader();
  const item = await getAppreciationPostItem(teamId, postId);
  if (!item || Number(item.expiresAtEpoch || 0) <= Math.floor(Date.now() / 1000)) {
    const error = new Error('Appreciation post not found.');
    error.status = 404;
    throw error;
  }
  const [likes, comments, author, recipient] = await Promise.all([
    getAppreciationLikeRows(teamId, postId),
    getAppreciationCommentRows(teamId, postId, loadUser),
    item.authorUserId ? loadUser(item.authorUserId) : null,
    item.recipientUserId ? loadUser(item.recipientUserId) : null,
  ]);
  const likedBy = await hydrateLikers(likes, loadUser);
  return {
    ...stripKeys(item),
    authorDisplayName: author?.preferredName || author?.displayName || item.authorDisplayName,
    authorInitials: author?.initials || item.authorInitials,
    authorPhotoUrl: author?.photoUrl || item.authorPhotoUrl || '',
    recipientDisplayName: recipient ? (recipient.preferredName || recipient.displayName || item.recipientDisplayName) : item.recipientDisplayName,
    recipientInitials: recipient?.initials || item.recipientInitials,
    recipientPhotoUrl: recipient?.photoUrl || item.recipientPhotoUrl || '',
    comments,
    commentCount: comments.length,
    latestComment: comments[comments.length - 1] || null,
    likedBy,
    reactionSummary: {
      likeCount: likes.length,
      likedByMe: likes.some((like) => like.userId === userId),
      topLikers: likedBy.slice(0, APPRECIATION_CARD_LIKER_COUNT),
    },
  };
};

export const deleteAppreciationPost = async (teamId, postId, actor) => {
  const item = await getAppreciationPostItem(teamId, postId);
  if (!item) {
    const error = new Error('Appreciation post not found.');
    error.status = 404;
    throw error;
  }
  const isAuthor = item.authorUserId === actor.userId;
  if (!isAuthor && !isTeamManagerRole(actor.role)) {
    const error = new Error('Only the author or a team manager can delete this post.');
    error.status = 403;
    throw error;
  }

  const [likes, comments] = await Promise.all([
    getAppreciationLikeRows(teamId, postId),
    getAppreciationCommentRowItems(teamId, postId),
  ]);
  const keys = [
    { PK: item.PK, SK: item.SK },
    ...likes.map((like) => ({ PK: `TEAM#${teamId}`, SK: `APPRECIATION_LIKE#${postId}#${like.userId}` })),
    ...comments.map((comment) => ({ PK: comment.PK, SK: comment.SK })),
  ];
  // BatchWrite caps at 25 items per call.
  for (let start = 0; start < keys.length; start += 25) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [config.coreTable]: keys.slice(start, start + 25).map((Key) => ({ DeleteRequest: { Key } })),
      },
    }));
  }
  await deleteAppreciationMedia(item.media);
  await writeAudit(teamId, actor.userId, 'APPRECIATION_DELETED', 'APPRECIATION', postId, stripKeys(item));
  return { postId, deleted: true };
};

export const createAppreciationPost = async (teamId, user, payload) => {
  const shortDescription = String(typeof payload === 'string' ? payload : (payload?.shortDescription || payload?.message || '')).trim();
  const longDescription = String(typeof payload === 'string' ? '' : (payload?.longDescription || '')).trim();
  if (shortDescription.length < 2 || shortDescription.length > 90) {
    const error = new Error('Short appreciation must be between 2 and 90 characters.');
    error.status = 400;
    throw error;
  }
  if (longDescription.length > 1200) {
    const error = new Error('Long appreciation must be 1200 characters or fewer.');
    error.status = 400;
    throw error;
  }
  const recipientUserId = String(typeof payload === 'string' ? '' : payload?.recipientUserId || '').trim();
  let recipientMember = null;
  if (recipientUserId) {
    recipientMember = await getTeamMembership(teamId, recipientUserId);
    if (!recipientMember || recipientMember.status !== 'ACTIVE') {
      const error = new Error('Choose an active player from this team.');
      error.status = 400;
      throw error;
    }
  }
  const media = sanitiseAppreciationMedia(typeof payload === 'string' ? [] : payload?.media, teamId);
  if (!shortDescription && !media.length) {
    const error = new Error('Add a description or a photo.');
    error.status = 400;
    throw error;
  }
  const recipientUser = recipientUserId ? await getUserById(recipientUserId) : null;
  const now = Date.now();
  const nowText = new Date(now).toISOString();
  const expiresAtEpoch = Math.floor(now / 1000) + APPRECIATION_RETENTION_DAYS * 24 * 60 * 60;
  const postId = `appreciation-${crypto.randomUUID()}`;
  const item = {
    PK: `TEAM#${teamId}`,
    SK: `APPRECIATION#${postId}`,
    // The base-table SK is a random UUID, so the feed is ordered through GSI1
    // instead. postId breaks ties between posts created in the same millisecond.
    GSI1PK: appreciationFeedKey(teamId),
    GSI1SK: `${nowText}#${postId}`,
    entityType: 'APPRECIATION_POST',
    postId,
    teamId,
    authorUserId: user.userId,
    authorDisplayName: user.preferredName || user.displayName || 'Team member',
    authorInitials: user.initials || (user.preferredName || user.displayName || 'TM').slice(0, 2).toUpperCase(),
    authorPhotoUrl: user.photoUrl || '',
    recipientUserId: recipientUser?.userId,
    recipientDisplayName: recipientUser ? (recipientUser.preferredName || recipientUser.displayName || 'Team member') : undefined,
    recipientInitials: recipientUser ? (recipientUser.initials || (recipientUser.preferredName || recipientUser.displayName || 'TM').slice(0, 2).toUpperCase()) : undefined,
    recipientPhotoUrl: recipientUser?.photoUrl || '',
    message: shortDescription,
    shortDescription,
    longDescription,
    media,
    createdAt: nowText,
    updatedAt: nowText,
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
    expiresAtEpoch,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: item }));
  await writeAudit(teamId, user.userId, 'APPRECIATION_CREATED', 'APPRECIATION', item.postId, stripKeys(item));
  return {
    ...stripKeys(item),
    comments: [],
    latestComment: null,
    commentCount: 0,
    reactionSummary: { likeCount: 0, likedByMe: false, topLikers: [] },
  };
};

export const createAppreciationComment = async (teamId, postId, user, payload) => {
  const post = await getAppreciationPostItem(teamId, postId);
  if (!post || Number(post.expiresAtEpoch || 0) <= Math.floor(Date.now() / 1000)) {
    const error = new Error('Appreciation post not found.');
    error.status = 404;
    throw error;
  }
  const message = String(payload?.message || '').trim();
  if (message.length < 1 || message.length > 500) {
    const error = new Error('Comment must be between 1 and 500 characters.');
    error.status = 400;
    throw error;
  }
  const nowText = new Date().toISOString();
  const commentId = `comment-${crypto.randomUUID()}`;
  const item = {
    PK: `TEAM#${teamId}`,
    SK: `APPRECIATION_COMMENT#${postId}#${nowText}#${commentId}`,
    entityType: 'APPRECIATION_COMMENT',
    commentId,
    postId,
    teamId,
    authorUserId: user.userId,
    authorDisplayName: user.preferredName || user.displayName || 'Team member',
    authorInitials: user.initials || (user.preferredName || user.displayName || 'TM').slice(0, 2).toUpperCase(),
    authorPhotoUrl: user.photoUrl || '',
    message,
    createdAt: nowText,
    updatedAt: nowText,
    expiresAtEpoch: post.expiresAtEpoch,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: item }));
  await writeAudit(teamId, user.userId, 'APPRECIATION_COMMENT_CREATED', 'APPRECIATION', postId, stripKeys(item));
  return stripKeys(item);
};

export const setAppreciationLike = async (teamId, postId, userId, liked) => {
  const post = await getAppreciationPostItem(teamId, postId);
  if (!post || Number(post.expiresAtEpoch || 0) <= Math.floor(Date.now() / 1000)) {
    const error = new Error('Appreciation post not found.');
    error.status = 404;
    throw error;
  }
  const key = { PK: `TEAM#${teamId}`, SK: `APPRECIATION_LIKE#${postId}#${userId}` };
  if (liked) {
    const nowText = new Date().toISOString();
    await db.send(new PutCommand({
      TableName: config.coreTable,
      Item: {
        ...key,
        entityType: 'APPRECIATION_LIKE',
        teamId,
        postId,
        userId,
        createdAt: nowText,
        expiresAtEpoch: post.expiresAtEpoch,
      },
    }));
  } else {
    await db.send(new DeleteCommand({ TableName: config.coreTable, Key: key }));
  }
  const likes = await getAppreciationLikeRows(teamId, postId);
  return {
    postId,
    reactionSummary: {
      likeCount: likes.length,
      likedByMe: likes.some((like) => like.userId === userId),
      topLikers: await hydrateLikers(likes, createUserLoader(), APPRECIATION_CARD_LIKER_COUNT),
    },
  };
};

const matchChargesEnabled = (match) => {
  const text = `${match.gameType || ''} ${match.competition || ''} ${match.matchFormat || ''}`.toLowerCase();
  return !text.includes('friendly') && !text.includes('training');
};

const chargeMatchFeesForLineup = async (teamId, matchId, lineup, actorUserId, feeMinorOverride) => {
  const match = await getMatch(teamId, matchId);
  const feeMinor = Math.max(0, Math.round(Number(feeMinorOverride ?? match?.matchFeeMinor ?? 0)));
  if (!match || !matchChargesEnabled(match) || feeMinor <= 0) return [];

  const nowText = new Date().toISOString();
  const walletItems = [];
  const transactionItems = [];
  for (const player of lineup.startingPlayers || []) {
    if (!player.userId) continue;
    const wallet = await getWalletForUser(teamId, player.userId);
    const transactions = await getWalletTransactionItems(wallet.walletId);
    const alreadyCharged = transactions.some((transaction) => transaction.referenceType === 'MATCH_FEE' && transaction.referenceId === matchId && transaction.status === 'POSTED');
    if (alreadyCharged) continue;
    const availableMinor = Number(wallet.availableMinor || 0) - feeMinor;
    walletItems.push(walletPutItem(wallet, {
      availableMinor,
      projectedMinor: availableMinor - Number(wallet.pendingMinor || 0),
      updatedAt: nowText,
    }));
    transactionItems.push(createWalletTransactionItem({
      teamId,
      wallet,
      userId: player.userId,
      amountMinor: feeMinor,
      direction: 'DEBIT',
      transactionType: 'MATCH_FEE_DEBIT',
      reason: `${match.opponent} match fee`,
      actorUserId,
      referenceType: 'MATCH_FEE',
      referenceId: matchId,
      createdAt: nowText,
    }));
  }
  await batchPut(config.financeTable, [...walletItems, ...transactionItems]);
  if (transactionItems.length) {
    await writeAudit(teamId, actorUserId, 'MATCH_FEES_CHARGED', 'MATCH', matchId, { feeMinor, chargedUserIds: transactionItems.map((tx) => tx.ownerUserId) });
  }
  return transactionItems.map(stripKeys);
};

const normalizeLineupPlayers = (players = []) => players
  .map((player, index) => {
    const userId = String(player.userId || '').trim();
    const guestName = String(player.guestName || player.displayName || '').trim();
    if (!userId && !guestName) return null;
    if (userId) {
      return {
        userId,
        displayOrder: Number(player.displayOrder || index + 1),
        positionLabel: player.positionLabel || 'player',
      };
    }
    return {
      guestName,
      displayName: guestName,
      displayOrder: Number(player.displayOrder || index + 1),
      positionLabel: player.positionLabel || 'guest',
      isGuest: true,
    };
  })
  .filter(Boolean)
  .map((player, index) => ({ ...player, displayOrder: index + 1 }));

export const saveLineup = async (teamId, matchId, data, actorUserId, publish = false) => {
  const match = await getMatch(teamId, matchId);
  if (publish && ['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match?.status)) {
    const error = new Error('Lineup cannot be published for a closed match.');
    error.status = 400;
    throw error;
  }
  const existing = await getLineup(matchId);
  const nowText = new Date().toISOString();
  const startingPlayers = normalizeLineupPlayers(data.startingPlayers || existing?.startingPlayers || []);
  const reservePlayers = normalizeLineupPlayers(data.reservePlayers || existing?.reservePlayers || []);
  const registeredIds = startingPlayers.filter((player) => player.userId).map((player) => player.userId);
  if (new Set(registeredIds).size !== registeredIds.length) {
    const error = new Error('A registered player can only appear once in the lineup.');
    error.status = 400;
    throw error;
  }
  if (publish && startingPlayers.length !== 12) {
    const error = new Error('Published lineup must contain exactly 12 names.');
    error.status = 400;
    throw error;
  }
  const lineup = {
    PK: `MATCH#${matchId}`,
    SK: 'LINEUP#CURRENT',
    entityType: 'LINEUP',
    teamId,
    matchId,
    lineupId: existing?.lineupId || `lineup-${crypto.randomUUID()}`,
    status: publish ? 'PUBLISHED' : 'DRAFT',
    revisionNumber: Number(existing?.revisionNumber || 0) + 1,
    startingPlayers,
    reservePlayers,
    captainNote: data.captainNote || existing?.captainNote || '',
    chargedMatchFeeMinor: publish ? Math.max(0, Math.round(Number(data.matchFeeMinor ?? existing?.chargedMatchFeeMinor ?? 0))) : existing?.chargedMatchFeeMinor,
    publishedAt: publish ? nowText : existing?.publishedAt,
    publishedByUserId: publish ? actorUserId : existing?.publishedByUserId,
    createdAt: existing?.createdAt || nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: lineup }));
  if (publish) await chargeMatchFeesForLineup(teamId, matchId, lineup, actorUserId, data.matchFeeMinor);
  await writeAudit(teamId, actorUserId, publish ? 'LINEUP_PUBLISHED' : 'LINEUP_DRAFT_SAVED', 'LINEUP', lineup.lineupId, stripKeys(lineup));
  return getLineup(matchId);
};

export const listInvites = async (teamId) => {
  const result = await db.send(new ScanCommand({
    TableName: config.coreTable,
    FilterExpression: 'entityType = :type AND teamId = :teamId',
    ExpressionAttributeValues: { ':type': 'INVITE', ':teamId': teamId },
  }));
  return (result.Items || []).map(stripKeys).sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
};

export const createInvite = async (teamId, actorUserId, options = {}) => {
  if (!options.forceNew) {
    const reusable = (await listInvites(teamId)).find((invite) => invite.status === 'ACTIVE' && new Date(invite.expiresAt) > new Date());
    if (reusable) return reusable;
  }
  const token = `join-${teamId}-${crypto.randomUUID().slice(0, 8)}`;
  const nowText = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Number(options.expiryDays || 14) * 24 * 60 * 60 * 1000).toISOString();
  const invite = {
    PK: `INVITE#${token}`,
    SK: 'PROFILE',
    GSI1PK: `INVITE_TOKEN#${token}`,
    GSI1SK: 'INVITE',
    entityType: 'INVITE',
    token,
    inviteId: `invite-${crypto.randomUUID()}`,
    teamId,
    status: 'ACTIVE',
    approvalRequired: options.approvalRequired !== false,
    maxUses: Number(options.maxUses || 25),
    usedCount: 0,
    expiresAt,
    invitedByUserId: actorUserId,
    createdAt: nowText,
    updatedAt: nowText,
  };
  await db.send(new PutCommand({ TableName: config.coreTable, Item: invite }));
  await writeAudit(teamId, actorUserId, 'INVITE_CREATED', 'INVITE', invite.inviteId, stripKeys(invite));
  return stripKeys(invite);
};

export const listJoinRequests = async (teamId) => {
  const members = await getTeamMembers(teamId);
  const pendingMembers = members.filter((member) => member.status === 'PENDING');
  const seededRequests = await db.send(new QueryCommand({
    TableName: config.coreTable,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `TEAM#${teamId}`, ':sk': 'JOIN_REQUEST#' },
  }));
  const requests = [
    ...pendingMembers.map((member) => ({
      requestId: `membership-${member.userId}`,
      teamId,
      userId: member.userId,
      status: 'PENDING',
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: member.user,
    })),
    ...(seededRequests.Items || []).map(stripKeys),
  ];
  return requests.filter((request) => request.status === 'PENDING');
};

export const decideJoinRequest = async (teamId, requestId, decision, actorUserId) => {
  const requests = await listJoinRequests(teamId);
  const request = requests.find((item) => item.requestId === requestId);
  if (!request) return null;
  if (decision === 'APPROVED') {
    const existing = await getTeamMembership(teamId, request.userId);
    await updateMembership(teamId, request.userId, {
      ...(existing || request),
      role: 'PLAYER',
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await ensurePlayerWallet(teamId, request.userId);
    await recalculateTeamPlayerCount(teamId);
  }
  if (requestId.startsWith('join-request-')) {
    await db.send(new UpdateCommand({
      TableName: config.coreTable,
      Key: { PK: `TEAM#${teamId}`, SK: `JOIN_REQUEST#${requestId}` },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': decision, ':updatedAt': new Date().toISOString() },
    }));
  }
  await writeAudit(teamId, actorUserId, `JOIN_REQUEST_${decision}`, 'JOIN_REQUEST', requestId, request);
  return { ...request, status: decision };
};

const getMatchSummaryForCaptain = async (match, players) => {
  const [availability, captainAvailability, lineup] = await Promise.all([
    getAvailabilityForMatch(match.matchId),
    getCaptainAvailabilityForMatch(match.matchId),
    getLineup(match.matchId),
  ]);
  const summary = { AVAILABLE: 0, UNAVAILABLE: 0, MAYBE: 0, NO_RESPONSE: 0 };
  const activePlayers = players.filter((member) => member.status === 'ACTIVE');
  for (const player of activePlayers) {
    const response = availability.find((item) => item.userId === player.userId);
    summary[response?.status || 'NO_RESPONSE'] += 1;
  }
  return {
    ...match,
    lineupStatus: lineup?.status || 'NOT_PUBLISHED',
    availabilitySummary: summary,
    // Lets the Match Hub render the captain badge without a second fetch.
    captainAvailabilitySummary: summariseCaptainAvailability(captainAvailability, activePlayers),
    activePlayerCount: activePlayers.length,
  };
};

export const getCaptainDashboard = async (teamId, userId) => {
  const [team, teamWallet, myWallet, players, playerWallets, matches, expenses, topups, transactions, joinRequests, invites, collections] = await Promise.all([
    getTeam(teamId),
    getTeamWallet(teamId),
    getWalletForUser(teamId, userId),
    getTeamMembers(teamId),
    getPlayerWallets(teamId),
    getMatchesForTeam(teamId),
    listTeamExpenses(teamId),
    listTopupRequests(teamId),
    listTeamWalletTransactions(teamId),
    listJoinRequests(teamId),
    listInvites(teamId),
    listCollections(teamId),
  ]);
  const nextMatch = matches.find((match) => new Date(match.startAt) >= new Date() && !['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match.status)) || null;
  const availability = nextMatch ? await getAvailabilityForMatch(nextMatch.matchId) : [];
  const summary = { AVAILABLE: 0, UNAVAILABLE: 0, MAYBE: 0, NO_RESPONSE: 0 };
  for (const player of players.filter((member) => member.status === 'ACTIVE')) {
    const response = availability.find((item) => item.userId === player.userId);
    summary[response?.status || 'NO_RESPONSE'] += 1;
  }
  const activePlayerIds = new Set(players.filter((member) => member.status === 'ACTIVE').map((member) => member.userId));
  const activeWallets = playerWallets.filter((wallet) => activePlayerIds.has(wallet.ownerUserId));
  const aggregateTeamWallet = {
    ...(stripKeys(teamWallet) || {
      walletId: `wallet-${teamId}`,
      teamId,
      ownerType: 'TEAM',
      currency: 'AUD',
    }),
    availableMinor: activeWallets.reduce((total, wallet) => total + Number(wallet.availableMinor || 0), 0),
    pendingMinor: activeWallets.reduce((total, wallet) => total + Number(wallet.pendingMinor || 0), 0),
    earmarkedMinor: activeWallets.reduce((total, wallet) => total + Number(wallet.earmarkedMinor || 0), 0),
    projectedMinor: activeWallets.reduce((total, wallet) => total + Number(wallet.projectedMinor ?? (Number(wallet.availableMinor || 0) - Number(wallet.pendingMinor || 0))), 0),
  };
  const matchSummaries = await Promise.all(matches.map((match) => getMatchSummaryForCaptain(match, players)));
  const pendingCollectionPayments = collections.flatMap((collection) => (
    (collection.shares || [])
      .filter((share) => share.status === 'PAYMENT_SUBMITTED')
      .map((share) => ({ ...share, collectionId: collection.collectionId, collectionTitle: collection.title }))
  ));
  return {
    team: stripKeys(team),
    teamWallet: aggregateTeamWallet,
    myWallet: stripKeys(myWallet),
    players,
    playerWallets,
    matches,
    matchSummaries,
    nextMatch,
    availabilitySummary: summary,
    pendingExpenses: expenses.filter((expense) => expense.status === 'SUBMITTED'),
    pendingTopups: topups.filter((request) => request.status === 'SUBMITTED'),
    pendingCollectionPayments,
    collections,
    recentTransactions: transactions.slice(0, 12),
    joinRequests,
    invites,
  };
};

export const getAuditEvents = async () => {
  const result = await db.send(new ScanCommand({ TableName: config.auditTable }));
  return (result.Items || []).map(stripKeys).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};

export const writeAudit = async (teamId, actorUserId, action, targetType, targetId, after) => {
  await db.send(new PutCommand({
    TableName: config.auditTable,
    Item: {
      PK: teamId ? `TEAM#${teamId}` : 'GLOBAL',
      SK: `AUDIT#${new Date().toISOString()}#${crypto.randomUUID()}`,
      entityType: 'AUDIT_EVENT',
      auditId: crypto.randomUUID(),
      teamId,
      actorUserId,
      action,
      targetType,
      targetId,
      after,
      correlationId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
  }));
};

export const getInvite = async (token) => {
  const result = await db.send(new GetCommand({
    TableName: config.coreTable,
    Key: { PK: `INVITE#${token}`, SK: 'PROFILE' },
  }));
  if (!result.Item) return null;
  const team = await getTeam(result.Item.teamId);
  return { ...stripKeys(result.Item), team: stripKeys(team) };
};

export const joinInvite = async (token, userId) => {
  const invite = await getInvite(token);
  if (!invite || invite.status !== 'ACTIVE' || new Date(invite.expiresAt) <= new Date()) {
    const error = new Error('This invite link has expired or is no longer available.');
    error.status = 410;
    throw error;
  }

  const existing = await getTeamMembership(invite.teamId, userId);
  if (existing) return { status: existing.status, team: invite.team };

  const membershipStatus = invite.approvalRequired ? 'PENDING' : 'ACTIVE';
  const membership = {
    teamId: invite.teamId,
    userId,
    role: 'PLAYER',
    status: membershipStatus,
    playerType: 'GUEST',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await batchPut(config.coreTable, [
    { PK: `USER#${userId}`, SK: `MEMBERSHIP#${invite.teamId}`, entityType: 'USER_MEMBERSHIP', ...membership },
    { PK: `TEAM#${invite.teamId}`, SK: `MEMBER#${userId}`, entityType: 'TEAM_MEMBERSHIP', ...membership },
  ]);
  return { status: membershipStatus, team: invite.team };
};

export const getHomeData = async (teamId, userId) => {
  const [team, wallet, matches, expenses, topups, members, collections] = await Promise.all([
    getTeam(teamId),
    getWalletForUser(teamId, userId),
    getMatchesForTeam(teamId),
    getExpensesForTeam(teamId, userId),
    listTopupRequests(teamId, userId),
    getTeamMembers(teamId),
    listCollections(teamId),
  ]);

  let selectedMatch = null;
  for (const match of matches.filter((item) => new Date(item.startAt) >= new Date() && !['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(item.status))) {
    const lineup = await getLineup(match.matchId);
    if (lineup?.status === 'PUBLISHED' && lineup.startingPlayers.some((player) => player.userId === userId)) {
      selectedMatch = { ...match, lineupStatus: 'PUBLISHED', selectionStatus: 'STARTING_XI' };
      break;
    }
  }

  const nextMatch = matches.find((match) => new Date(match.startAt) >= new Date() && !['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(match.status)) || null;
  const availabilityRequests = [];
  for (const match of matches.filter((item) => new Date(item.startAt) >= new Date() && !['COMPLETED', 'CANCELLED', 'ABANDONED'].includes(item.status))) {
    const badge = await attachMatchBadges(match, userId);
    if (badge.availabilityRequestedAt && badge.availabilityStatus === 'NO_RESPONSE' && badge.lineupStatus !== 'PUBLISHED') {
      availabilityRequests.push(badge);
    }
    if (availabilityRequests.length >= 2) break;
  }
  const myCollectionShares = collections
    .filter((collection) => collection.status === 'OPEN')
    .flatMap((collection) => {
      const share = (collection.shares || []).find((item) => item.userId === userId);
      if (!share || !['REQUESTED', 'PAYMENT_SUBMITTED', 'REJECTED'].includes(share.status)) return [];
      return [{
        collectionId: collection.collectionId,
        title: collection.title,
        note: collection.note,
        amountDueMinor: share.amountDueMinor,
        status: share.status,
        paymentNote: share.paymentNote,
      }];
    });
  return {
    team: stripKeys(team),
    wallet: stripKeys(wallet),
    selectedMatch,
    nextMatch: nextMatch ? await attachMatchBadges(nextMatch, userId) : null,
    availabilityRequests,
    expenses,
    topups,
    collectionShares: myCollectionShares,
    members: members.filter((member) => member.status === 'ACTIVE'),
  };
};

export const attachMatchBadges = async (match, userId) => {
  const lineup = await getLineup(match.matchId);
  const availability = await getAvailabilityForMatch(match.matchId);
  const mine = availability.find((item) => item.userId === userId);
  return {
    ...match,
    lineupStatus: lineup?.status || 'NOT_PUBLISHED',
    selectionStatus: lineup?.status === 'PUBLISHED' && lineup.startingPlayers.some((player) => player.userId === userId) ? 'STARTING_XI' : null,
    availabilityStatus: mine?.status || 'NO_RESPONSE',
    availabilityRequestedAt: match.availabilityRequestedAt,
    availabilityDeadline: match.availabilityDeadline,
  };
};

export const getMatchDetail = async (teamId, matchId, userId, membership) => {
  const match = await getMatch(teamId, matchId);
  if (!match) return null;
  const [availability, captainAvailability, members, lineup, award] = await Promise.all([
    getAvailabilityForMatch(matchId),
    getCaptainAvailabilityForMatch(matchId),
    getTeamMembers(teamId),
    getLineup(matchId),
    getCaptainMatchAward(teamId, matchId),
  ]);
  const canManageMatch = isTeamManagerRole(membership.role);
  const visibleLineup = lineup?.status === 'PUBLISHED' || canManageMatch ? lineup : null;
  const counts = { AVAILABLE: 0, UNAVAILABLE: 0, MAYBE: 0, NO_RESPONSE: 0 };
  for (const member of members.filter((item) => item.status === 'ACTIVE')) {
    const response = availability.find((item) => item.userId === member.userId);
    counts[response?.status || 'NO_RESPONSE'] += 1;
  }
  return {
    match,
    lineup: visibleLineup,
    lineupHiddenReason: lineup && !visibleLineup ? 'Draft lineup is visible to captains only.' : null,
    availability: availability.find((item) => item.userId === userId) || { teamId, matchId, userId, status: 'NO_RESPONSE' },
    availabilitySummary: counts,
    // Manager-gated, which is what keeps the captain's list captain-only.
    availabilityRows: canManageMatch
      ? members
        .filter((item) => item.status === 'ACTIVE')
        .map((member) => {
          const captainRow = captainAvailability.find((item) => item.userId === member.userId);
          return {
            userId: member.userId,
            user: member.user,
            status: availability.find((item) => item.userId === member.userId)?.status || 'NO_RESPONSE',
            respondedAt: availability.find((item) => item.userId === member.userId)?.respondedAt,
            captainStatus: captainRow?.status || 'NOT_MARKED',
            captainNote: captainRow?.note || '',
          };
        })
      : [],
    captainAvailabilitySummary: canManageMatch
      ? summariseCaptainAvailability(captainAvailability, members.filter((item) => item.status === 'ACTIVE'))
      : null,
    award,
    canManageMatch,
  };
};

export const stripKeys = (item) => {
  if (!item) return item;
  const {
    PK,
    SK,
    GSI1PK,
    GSI1SK,
    entityType,
    passwordHash,
    passwordUpdatedAt,
    ...rest
  } = item;
  return rest;
};
