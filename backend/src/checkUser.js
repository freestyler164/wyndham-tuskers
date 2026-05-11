import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { awsClientConfig } from './awsConfig.js';

const USERS_TABLE = process.env.USERS_TABLE || 'members';
const email = process.env.CHECK_EMAIL?.toLowerCase();

const db = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const result = email
  ? await db.send(new GetCommand({ TableName: USERS_TABLE, Key: { email } }))
  : { Item: undefined };

const scan = await db.send(new ScanCommand({
  TableName: USERS_TABLE,
  ProjectionExpression: 'email,#role',
  ExpressionAttributeNames: { '#role': 'role' },
  Limit: 20,
}));

console.log(JSON.stringify({
  table: USERS_TABLE,
  checkedEmail: email,
  checkedUser: result.Item ? {
    email: result.Item.email,
    role: result.Item.role,
    hasPassword: Boolean(result.Item.passwordHash),
  } : null,
  users: scan.Items || [],
}, null, 2));
