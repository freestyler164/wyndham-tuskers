import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { DynamoDBClient, DescribeTableCommand, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { AWS_ENDPOINT, awsClientConfig } from './awsConfig.js';

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
      AttributeDefinitions: [
        { AttributeName: 'email', AttributeType: 'S' },
      ],
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
    if (err.name === 'ResourceNotFoundException') {
      await dynamoClient.send(new CreateTableCommand({ TableName: name, ...params }));
      const start = Date.now();
      while (Date.now() - start < 30000) {
        try {
          const result = await dynamoClient.send(new DescribeTableCommand({ TableName: name }));
          if (result.Table?.TableStatus === 'ACTIVE') {
            return;
          }
        } catch (ignored) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      throw new Error(`Table ${name} did not become active in time`);
    }
    throw err;
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
      const retryable = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.name === 'TimeoutError' || err.name === 'UnknownEndpoint';
      if (!retryable) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error('LocalStack endpoint did not become available in time');
};

const seedData = async () => {
  const usersTable = process.env.USERS_TABLE || 'members';
  const surveysTable = process.env.SURVEYS_TABLE || 'surveys';
  const eventsTable = process.env.EVENTS_TABLE || 'events';

  // Seed admin user
  try {
    const adminCheck = await db.send(new GetCommand({
      TableName: usersTable,
      Key: { email: 'admin@wyndhamtuskers.local' }
    }));

    if (!adminCheck.Item) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      await db.send(new PutCommand({
        TableName: usersTable,
        Item: {
          email: 'admin@wyndhamtuskers.local',
          passwordHash: adminPassword,
          role: 'admin',
          createdAt: new Date().toISOString(),
        }
      }));
      console.log('✓ Created admin user: admin@wyndhamtuskers.local (password: admin123)');
    }
  } catch (error) {
    console.warn('Failed to seed admin user:', error.message);
  }

  // Seed sample members
  const sampleMembers = [
    { email: 'john.doe@example.com', password: 'member123', role: 'member', fullName: 'John Doe', suburb: 'Tarneit', interests: ['Cricket', 'Onam celebrations'] },
    { email: 'jane.smith@example.com', password: 'member123', role: 'member', fullName: 'Jane Smith', suburb: 'Point Cook', interests: ['Cultural activities', 'Badminton'] },
    { email: 'mike.johnson@example.com', password: 'member123', role: 'member', fullName: 'Mike Johnson', suburb: 'Wyndham Vale', interests: ['Volleyball', 'Card games'] },
    { email: 'sarah.wilson@example.com', password: 'member123', role: 'member', fullName: 'Sarah Wilson', suburb: 'Hoppers Crossing', interests: ['Basketball', 'Onam celebrations'] },
  ];

  for (const member of sampleMembers) {
    try {
      const memberCheck = await db.send(new GetCommand({
        TableName: usersTable,
        Key: { email: member.email }
      }));

      if (!memberCheck.Item) {
        const memberPassword = await bcrypt.hash(member.password, 10);
        await db.send(new PutCommand({
          TableName: usersTable,
          Item: {
            email: member.email,
            passwordHash: memberPassword,
            role: member.role,
            fullName: member.fullName,
            suburb: member.suburb,
            interests: member.interests,
            createdAt: new Date().toISOString(),
          }
        }));
        console.log(`✓ Created member: ${member.email} (password: ${member.password})`);
      }
    } catch (error) {
      console.warn(`Failed to seed member ${member.email}:`, error.message);
    }
  }

  // Seed sample surveys
  const sampleSurveys = [
    {
      id: 'match-feedback-2026',
      title: 'Match Day Experience Survey',
      description: 'Help us improve our match day experience by sharing your feedback.',
      questions: [
        {
          id: 'q1',
          text: 'How would you rate the overall match day experience?',
          type: 'choice',
          options: ['Excellent', 'Good', 'Average', 'Poor']
        },
        {
          id: 'q2',
          text: 'What did you enjoy most about the match?',
          type: 'text'
        },
        {
          id: 'q3',
          text: 'Any suggestions for improvement?',
          type: 'text'
        }
      ],
      status: 'active',
      createdBy: 'admin@wyndhamtuskers.local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'training-preference-2026',
      title: 'Training Session Preferences',
      description: 'Let us know your preferred training times and activities.',
      questions: [
        {
          id: 'q1',
          text: 'What days work best for training?',
          type: 'choice',
          options: ['Weekdays (evenings)', 'Weekends (mornings)', 'Weekends (afternoons)', 'Flexible']
        },
        {
          id: 'q2',
          text: 'Preferred training activities?',
          type: 'choice',
          options: ['Skill drills', 'Fitness training', 'Team tactics', 'Mixed sessions']
        },
        {
          id: 'q3',
          text: 'Any specific training goals?',
          type: 'text'
        }
      ],
      status: 'active',
      createdBy: 'admin@wyndhamtuskers.local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  for (const survey of sampleSurveys) {
    try {
      const surveyCheck = await db.send(new GetCommand({
        TableName: surveysTable,
        Key: { id: survey.id }
      }));

      if (!surveyCheck.Item) {
        await db.send(new PutCommand({
          TableName: surveysTable,
          Item: survey
        }));
        console.log(`✓ Created survey: ${survey.title}`);
      }
    } catch (error) {
      console.warn(`Failed to seed survey ${survey.id}:`, error.message);
    }
  }

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
    try {
      const eventCheck = await db.send(new GetCommand({
        TableName: eventsTable,
        Key: { id: event.id }
      }));

      if (!eventCheck.Item) {
        await db.send(new PutCommand({
          TableName: eventsTable,
          Item: {
            ...event,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        }));
        console.log(`Created event: ${event.title}`);
      }
    } catch (error) {
      console.warn(`Failed to seed event ${event.id}:`, error.message);
    }
  }
};

export const ensureTables = async () => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  await waitForLocalstack();
  for (const table of tables) {
    await ensureTable(table);
  }

  // Seed initial data
  await seedData();
};
