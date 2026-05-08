import express from 'express';
import crypto from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
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

const EVENTS_TABLE = process.env.EVENTS_TABLE || 'events';

const sortEvents = (events) => [...events].sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.send(new ScanCommand({
    TableName: EVENTS_TABLE,
    FilterExpression: '#status = :active AND #eventDate >= :today',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#eventDate': 'eventDate',
    },
    ExpressionAttributeValues: {
      ':active': 'active',
      ':today': today,
    },
  }));

  return res.json(sortEvents(result.Items || []).slice(0, 5));
});

router.get('/all', verifyToken, requireAdmin, async (req, res) => {
  const result = await db.send(new ScanCommand({ TableName: EVENTS_TABLE }));
  return res.json(sortEvents(result.Items || []));
});

router.post('/', verifyToken, requireAdmin, async (req, res) => {
  const { title, eventDate, location, summary, status } = req.body;
  if (!title || !eventDate) {
    return res.status(400).json({ message: 'Event title and date are required.' });
  }

  const event = {
    id: crypto.randomBytes(12).toString('hex'),
    title,
    eventDate,
    location: location || '',
    summary: summary || '',
    status: status || 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.send(new PutCommand({ TableName: EVENTS_TABLE, Item: event }));
  return res.status(201).json(event);
});

router.patch('/:id', verifyToken, requireAdmin, async (req, res) => {
  const allowedFields = ['title', 'eventDate', 'location', 'summary', 'status'];
  const names = {};
  const values = {};
  const updates = [];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      names[`#${field}`] = field;
      values[`:${field}`] = req.body[field];
      updates.push(`#${field} = :${field}`);
    }
  });

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update.' });
  }

  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = new Date().toISOString();
  updates.push('#updatedAt = :updatedAt');

  const result = await db.send(new UpdateCommand({
    TableName: EVENTS_TABLE,
    Key: { id: req.params.id },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW',
  }));

  return res.json(result.Attributes);
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  await db.send(new DeleteCommand({ TableName: EVENTS_TABLE, Key: { id: req.params.id } }));
  return res.status(204).send();
});

export default router;
