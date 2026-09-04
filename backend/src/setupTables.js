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
  {
    name: process.env.NEWS_TABLE || 'news_posts',
    params: {
      AttributeDefinitions: [{ AttributeName: 'slug', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'slug', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.MARKETPLACE_TABLE || 'marketplace',
    params: {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.GALLERY_TABLE || 'gallery',
    params: {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.SETTINGS_TABLE || 'settings',
    params: {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.PAINTING_COMPETITION_TABLE || 'painting_competition',
    params: {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.PAINTING_SUBMISSIONS_TABLE || 'painting_submissions',
    params: {
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  },
  {
    name: process.env.ONAM_SCHEDULE_TABLE || 'onam_schedule',
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

const seedNews = async (newsTable) => {
  const post = {
    slug: 'tuskers-volleyball-championship-2026',
    title: 'Tuskers Volleyball Championship 2026',
    excerpt: 'A high-energy championship week that brought Wyndham Tuskers families together through rallies, teamwork and community spirit.',
    body: [
      'The **Tuskers Volleyball Championship 2026** turned last week into a proper community celebration, with players, families and supporters filling the venue with energy from the first serve to the final point.',
      'Across the matches, the standard kept rising. Teams backed each other, fought for every rally and still kept the friendly Tuskers spirit alive. The sidelines were just as lively, with families cheering, catching up and making the day feel bigger than just a tournament.',
      'A huge thank you to every player, organiser, volunteer and supporter who helped make TVC 2026 such a memorable event. Moments like these are exactly what Wyndham Tuskers is about: sport, friendship, family and a community that shows up for one another.',
    ].join('\n\n'),
    author: 'Wyndham Tuskers Committee',
    category: 'Sports',
    coverImageUrl: '/static/photos/tvc-26/tvc-26-01.jpeg',
    supportingPhotos: [
      '/static/photos/tvc-26/tvc-26-02.jpeg',
      '/static/photos/tvc-26/tvc-26-03.jpeg',
      '/static/photos/tvc-26/tvc-26-04.jpeg',
      '/static/photos/tvc-26/tvc-26-05.jpeg',
      '/static/photos/tvc-26/tvc-26-06.jpeg',
      '/static/photos/tvc-26/tvc-26-07.jpeg',
      '/static/photos/tvc-26/tvc-26-08.jpeg',
      '/static/photos/tvc-26/tvc-26-09.jpeg',
    ].map((url) => ({ url, caption: 'TVC 2026 moment' })),
    status: 'published',
    viewCount: 0,
    publishedAt: '2026-06-08T08:00:00.000Z',
    createdBy: process.env.SEED_ADMIN_EMAIL || 'local-seed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const newsCheck = await db.send(new GetCommand({
    TableName: newsTable,
    Key: { slug: post.slug },
  }));

  if (newsCheck.Item) {
    return;
  }

  await db.send(new PutCommand({ TableName: newsTable, Item: post }));
  console.log(`Created news post: ${post.title}`);
};

const seedMarketplace = async (marketplaceTable) => {
  const now = new Date().toISOString();
  const businesses = [
    {
      id: 'sinis-kitchen',
      slug: 'sinis-kitchen',
      name: 'Sinis kitchen',
      category: 'Food & Catering',
      description: 'Authentic Kerala snacks, party orders and traditional sadhya prepared for family celebrations, gatherings and special occasions.',
      fullDescription: 'Sinis kitchen brings the authentic taste of Kerala to local celebrations with freshly prepared snacks and party food. Popular options include parippu vada and unniappam, along with traditional sadhya orders for birthdays, housewarmings, family events, office gatherings and other special occasions. Advance booking is appreciated so each order can be prepared with care.',
      services: ['Kerala snacks', 'Parippu vada', 'Unniappam', 'Traditional sadhya', 'Party orders', 'Event catering'],
      contactPerson: 'Sini Anson',
      phone: '0431888466',
      email: '',
      website: '',
      whatsapp: '0431888466',
      logoUrl: '',
      bannerUrl: '',
      gallery: [],
      featured: true,
      active: true,
    },
    {
      id: 'aussie-werribee-naga-oggu',
      slug: 'aussie-werribee-naga-oggu',
      name: 'Aussie Werribee - Naga Tapasvee Oggu',
      category: 'Finance & Mortgage',
      description: 'Aussie Retail Broker helping first home buyers, refinancers and property investors with practical home loan guidance.',
      fullDescription: 'Naga Tapasvee Oggu is an Aussie Retail Broker based in Werribee, with a strong banking background and more than five years of experience as a credit assessor. That lender-side experience helps clients understand what banks look for when assessing a home loan application.\n\nNaga supports first home buyers, refinancers and property investors with clear options, practical advice and end-to-end paperwork support. The focus is to make the home loan process simple, transparent and less stressful, so clients can move toward their property goals with confidence.',
      services: ['First home buyer loans', 'Refinancing support', 'Investment property loans', 'Borrowing capacity guidance', 'Loan application paperwork', 'Lender assessment guidance'],
      contactPerson: 'Naga Tapasvee Oggu',
      phone: '0478240725',
      email: 'naga.oggu@aussie.com.au',
      website: '',
      whatsapp: '0478240725',
      logoUrl: '/static/logos/aussie-werribee-logo.svg',
      bannerUrl: '',
      gallery: [],
      featured: false,
      active: true,
    },
    {
      id: 'curry-leaf-by-lakshmi',
      slug: 'curry-leaf-by-lakshmi',
      name: 'Curry Leaf By Lakshmi',
      category: 'Food & Catering',
      description: 'Homestyle Indian and Kerala-inspired food prepared for family meals, gatherings and small celebrations.',
      fullDescription: 'Curry Leaf By Lakshmi offers homestyle food for families, get-togethers and community occasions. The menu is available as a PDF on this page, making it easy to browse dishes and plan an order before getting in touch.',
      services: ['Homestyle meals', 'Kerala-inspired dishes', 'Party food orders', 'Family gathering catering'],
      contactPerson: 'Lakshmi',
      phone: '',
      email: '',
      website: '',
      whatsapp: '+91 6235179095,+91 9497323231',
      logoUrl: '/static/logos/curry-leaf-by-lakshmi-logo.svg',
      bannerUrl: '',
      menuPdfUrl: '/static/marketplace/curry-leaf-by-lakshmi-menu.pdf',
      gallery: [],
      featured: false,
      active: true,
    },
    {
      id: 'reliance-real-estate-harsha',
      slug: 'reliance-real-estate-harsha',
      name: 'Reliance Real Estate',
      category: 'Real Estate',
      description: "Helping buyers, sellers, landlords and investors achieve their property goals with trusted advice, local expertise and personalised service across Melbourne's western suburbs.",
      fullDescription: "Whether you're buying your first home, selling your property, leasing an investment or looking for reliable property management, the Reliance team provides expert guidance and end-to-end support to help you achieve the best possible outcome. Their focus is on building lasting relationships through honest advice, local market knowledge and exceptional customer service.",
      services: ['Residential property sales', 'Property management', 'Residential leasing', 'Property appraisals', 'First home buyer guidance', 'Investment property advice', 'Property marketing', 'Auction sales', 'End-to-end buying and selling support'],
      contactPerson: 'Harsha',
      phone: '+61444512647',
      email: 'Harsha@reliancere.com.au',
      website: '',
      whatsapp: '+61444512647',
      logoUrl: '/static/logos/reliance_logo.jpg',
      bannerUrl: '',
      gallery: [],
      featured: true,
      active: true,
    },
  ];

  for (const business of businesses) {
    const businessCheck = await db.send(new GetCommand({
      TableName: marketplaceTable,
      Key: { id: business.id },
    }));

    if (businessCheck.Item) {
      continue;
    }

    await db.send(new PutCommand({
      TableName: marketplaceTable,
      Item: {
        ...business,
        createdBy: process.env.SEED_ADMIN_EMAIL || 'local-seed',
        createdAt: now,
        updatedAt: now,
      },
    }));
    console.log(`Created marketplace listing: ${business.name}`);
  }
};

const seedSettings = async (settingsTable) => {
  const settingCheck = await db.send(new GetCommand({
    TableName: settingsTable,
    Key: { id: 'memberRegistration' },
  }));

  if (settingCheck.Item) {
    return;
  }

  await db.send(new PutCommand({
    TableName: settingsTable,
    Item: {
      id: 'memberRegistration',
      enabled: process.env.ENABLE_MEMBER_REGISTRATION === 'true',
      updatedAt: new Date().toISOString(),
      updatedBy: 'local-seed',
    },
  }));
  console.log('Created setting: memberRegistration');
};

const seedPaintingCompetition = async (competitionTable) => {
  const existing = await db.send(new GetCommand({
    TableName: competitionTable,
    Key: { id: 'config' },
  }));
  if (existing.Item) return;

  await db.send(new PutCommand({
    TableName: competitionTable,
    Item: {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'local-seed',
    },
  }));
  console.log('Created painting competition configuration.');
};

const seedOnamSchedule = async (onamScheduleTable) => {
  const existing = await db.send(new GetCommand({
    TableName: onamScheduleTable,
    Key: { id: 'config' },
  }));
  if (existing.Item) return;

  const now = new Date().toISOString();
  const seedItems = [
    {
      id: 'item#registration-welcome',
      type: 'scheduleItem',
      timeLabel: '9:00 AM',
      title: 'Registration & Welcome',
      location: 'Main Hall',
      status: 'upcoming',
      published: true,
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'local-seed',
    },
    {
      id: 'item#inaugural-thiruvathira',
      type: 'scheduleItem',
      timeLabel: '9:30 AM',
      title: 'Inaugural Ceremony & Thiruvathira',
      location: 'Main Hall',
      status: 'upcoming',
      published: true,
      sortOrder: 20,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'local-seed',
    },
    {
      id: 'item#pookalam',
      type: 'scheduleItem',
      timeLabel: '10:30 AM',
      title: 'Pookalam Competition',
      location: 'Lawn Area',
      status: 'upcoming',
      published: true,
      sortOrder: 30,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'local-seed',
    },
  ];

  await db.send(new PutCommand({
    TableName: onamScheduleTable,
    Item: {
      id: 'config',
      title: 'Onam 2026',
      eyebrow: 'Wyndham Tuskers presents',
      description: "A day of flowers, feasts, and togetherness — join the Wyndham Tuskers community as we celebrate Kerala's harvest festival with games, dance, and a grand Sadya.",
      eventDate: '2026-08-08',
      venue: 'Bacchus Marsh Public Hall',
      eventStatus: 'upcoming',
      published: false,
      menuLabel: 'Onam 2026',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'local-seed',
    },
  }));

  for (const item of seedItems) {
    await db.send(new PutCommand({ TableName: onamScheduleTable, Item: item }));
  }
  console.log('Created Onam schedule configuration and sample schedule.');
};

const seedData = async () => {
  const usersTable = process.env.USERS_TABLE || 'members';
  const surveysTable = process.env.SURVEYS_TABLE || 'surveys';
  const eventsTable = process.env.EVENTS_TABLE || 'events';
  const newsTable = process.env.NEWS_TABLE || 'news_posts';
  const marketplaceTable = process.env.MARKETPLACE_TABLE || 'marketplace';
  const settingsTable = process.env.SETTINGS_TABLE || 'settings';
  const paintingCompetitionTable = process.env.PAINTING_COMPETITION_TABLE || 'painting_competition';
  const onamScheduleTable = process.env.ONAM_SCHEDULE_TABLE || 'onam_schedule';

  try {
    await seedAdmin(usersTable);
  } catch (error) {
    console.warn(`Skipping local admin seed: ${error.message}`);
  }

  await seedMembers(usersTable);
  await seedSurveys(surveysTable);
  await seedEvents(eventsTable);
  await seedNews(newsTable);
  await seedMarketplace(marketplaceTable);
  await seedSettings(settingsTable);
  await seedPaintingCompetition(paintingCompetitionTable);
  await seedOnamSchedule(onamScheduleTable);
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
