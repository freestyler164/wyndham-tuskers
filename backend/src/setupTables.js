import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { DynamoDBClient, DescribeTableCommand, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { AWS_ENDPOINT, awsClientConfig } from './awsConfig.js';
import { validatePassword } from './config.js';

dotenv.config();

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const tables = [
  {
    name: process.env.USERS_TABLE || 'members',
    params: {
      AttributeDefinitions: [{ AttributeName: 'email', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'email-index',
          KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.TOKENS_TABLE || 'password_reset_tokens',
    params: {
      AttributeDefinitions: [
        { AttributeName: 'email', AttributeType: 'S' },
        { AttributeName: 'token', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'email', KeyType: 'HASH' },
        { AttributeName: 'token', KeyType: 'RANGE' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.SURVEYS_TABLE || 'surveys',
    params: {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.RESPONSES_TABLE || 'survey_responses',
    params: {
      AttributeDefinitions: [
        { AttributeName: 'surveyId', AttributeType: 'S' },
        { AttributeName: 'responseId', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'surveyId', KeyType: 'HASH' },
        { AttributeName: 'responseId', KeyType: 'RANGE' },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.EVENTS_TABLE || 'events',
    params: {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
];

const dateFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const ensureTable = async ({ name, params }) => {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: name }));
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') {
      throw err;
    }

    await dynamoClient.send(new CreateTableCommand({ TableName: name, ...params }));
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const result = await dynamoClient.send(new DescribeTableCommand({ TableName: name }));
      if (result.Table?.TableStatus === 'ACTIVE') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Table ${name} did not become active in time`);
  }
};

const waitForLocalstack = async () => {
  if (!AWS_ENDPOINT || process.env.NODE_ENV === 'production') {
    return;
  }

  const start = Date.now();
  while (Date.now() - start < 30000) {
    try {
      await dynamoClient.send(new ListTablesCommand({ Limit: 1 }));
      return;
    } catch (err) {
      const retryable = ['ECONNREFUSED', 'ENOTFOUND'].includes(err.code)
        || ['TimeoutError', 'UnknownEndpoint'].includes(err.name);
      if (!retryable) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error('LocalStack endpoint did not become available in time');
};

const seedAdmin = async (usersTable) => {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log('Skipping local admin seed. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.');
    return;
  }

  const passwordValidation = validatePassword(adminPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message);
  }

  const adminCheck = await db.send(new GetCommand({
    TableName: usersTable,
    Key: { email: adminEmail },
  }));

  if (adminCheck.Item) {
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await db.send(new PutCommand({
    TableName: usersTable,
    Item: {
      email: adminEmail,
      passwordHash,
      role: 'admin',
      createdAt: new Date().toISOString(),
    },
  }));
  console.log(`Created local admin user: ${adminEmail}`);
};

const seedMembers = async (usersTable) => {
  const sampleMemberPassword = process.env.SEED_SAMPLE_MEMBER_PASSWORD;
  const sampleMembers = [
    { email: 'john.doe@example.com', role: 'member', fullName: 'John Doe', suburb: 'Tarneit', interests: ['Cricket', 'Onam celebrations'] },
    { email: 'jane.smith@example.com', role: 'member', fullName: 'Jane Smith', suburb: 'Point Cook', interests: ['Cultural activities', 'Badminton'] },
    { email: 'mike.johnson@example.com', role: 'member', fullName: 'Mike Johnson', suburb: 'Wyndham Vale', interests: ['Volleyball', 'Card games'] },
    { email: 'sarah.wilson@example.com', role: 'member', fullName: 'Sarah Wilson', suburb: 'Hoppers Crossing', interests: ['Basketball', 'Onam celebrations'] },
  ];

  for (const member of sampleMembers) {
    const memberCheck = await db.send(new GetCommand({
      TableName: usersTable,
      Key: { email: member.email },
    }));

    if (memberCheck.Item) {
      continue;
    }

    const passwordHash = sampleMemberPassword ? await bcrypt.hash(sampleMemberPassword, 12) : undefined;
    await db.send(new PutCommand({
      TableName: usersTable,
      Item: {
        ...member,
        passwordHash,
        createdAt: new Date().toISOString(),
      },
    }));
    console.log(`Created sample member: ${member.email}`);
  }
};

const seedSurveys = async (surveysTable) => {
  const sampleSurveys = [
    {
      id: 'community-pulse-2026',
      title: 'Community Pulse',
      description: 'A quick check-in to understand what activities members want next.',
      questions: [
        {
          id: 'q1',
          text: 'Which activity should we plan next?',
          type: 'choice',
          options: ['Onam gathering', 'Volleyball', 'Badminton', 'Cards and carroms'],
          analysis: 'count',
          required: true,
        },
        {
          id: 'q2',
          text: 'Any ideas for the organising team?',
          type: 'text',
          analysis: 'none',
        },
      ],
      status: 'active',
      createdBy: process.env.SEED_ADMIN_EMAIL || 'local-seed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  for (const survey of sampleSurveys) {
    const surveyCheck = await db.send(new GetCommand({
      TableName: surveysTable,
      Key: { id: survey.id },
    }));

    if (surveyCheck.Item) {
      continue;
    }

    await db.send(new PutCommand({ TableName: surveysTable, Item: survey }));
    console.log(`Created survey: ${survey.title}`);
  }
};

const seedEvents = async (eventsTable) => {
  const sampleEvents = [
    {
      id: 'weekly-cards-carroms',
      title: 'Cards and carroms evening',
      eventDate: dateFromNow(9),
      location: 'Wyndham community venue',
      summary: 'A relaxed evening for members and families to catch up.',
      status: 'active',
    },
    {
      id: 'social-volleyball-session',
      title: 'Social volleyball session',
      eventDate: dateFromNow(18),
      location: 'Wyndham indoor courts',
      summary: 'Casual mixed volleyball for all skill levels.',
      status: 'active',
    },
    {
      id: 'tpl-planning-meetup',
      title: 'TPL planning meetup',
      eventDate: dateFromNow(31),
      location: 'TBC',
      summary: 'Early planning catch-up for the next Tuskers Premier League.',
      status: 'active',
    },
  ];

  for (const event of sampleEvents) {
    const eventCheck = await db.send(new GetCommand({
      TableName: eventsTable,
      Key: { id: event.id },
    }));

    if (eventCheck.Item) {
      continue;
    }

    await db.send(new PutCommand({
      TableName: eventsTable,
      Item: {
        ...event,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
    console.log(`Created event: ${event.title}`);
  }
};

const seedData = async () => {
  const usersTable = process.env.USERS_TABLE || 'members';
  const surveysTable = process.env.SURVEYS_TABLE || 'surveys';
  const eventsTable = process.env.EVENTS_TABLE || 'events';

  try {
    await seedAdmin(usersTable);
  } catch (error) {
    console.warn(`Skipping local admin seed: ${error.message}`);
  }

  await seedMembers(usersTable);
  await seedSurveys(surveysTable);
  await seedEvents(eventsTable);
};

export const ensureTables = async () => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  await waitForLocalstack();
  for (const table of tables) {
    await ensureTable(table);
  }

  if (process.env.SEED_LOCAL_DATA !== 'false') {
    await seedData();
  }
};
