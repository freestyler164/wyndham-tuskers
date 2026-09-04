import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

export const config = {
  port: Number(process.env.PORT || 4100),
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  awsEndpoint: process.env.AWS_ENDPOINT || undefined,
  coreTable: process.env.MYTUSKERS_CORE_TABLE || 'mytuskers-core',
  financeTable: process.env.MYTUSKERS_FINANCE_TABLE || 'mytuskers-finance',
  auditTable: process.env.MYTUSKERS_AUDIT_TABLE || 'mytuskers-audit',
  receiptsBucket: process.env.MYTUSKERS_RECEIPTS_BUCKET || 'mytuskers-local-receipts',
  jwtSecret: process.env.MYTUSKERS_JWT_SECRET || 'mytuskers-local-dev-secret',
  frontendOrigin: process.env.MYTUSKERS_WEB_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3100'),
  resendApiKey: process.env.RESEND_API_KEY || process.env.MYTUSKERS_RESEND_API_KEY || '',
  emailFrom: process.env.MYTUSKERS_EMAIL_FROM || 'MyTuskers <noreply@wyndhamtuskers.com>',
  vapidPublicKey: process.env.MYTUSKERS_VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.MYTUSKERS_VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.MYTUSKERS_VAPID_SUBJECT || 'mailto:admin@wyndhamtuskers.com',
};

const hasStaticCredentials = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

export const awsClientConfig = {
  region: config.awsRegion,
  ...(config.awsEndpoint ? { endpoint: config.awsEndpoint } : {}),
  ...(hasStaticCredentials
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
        },
      }
    : {}),
};

export const dynamoClient = new DynamoDBClient(awsClientConfig);
export const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
export const s3 = new S3Client({
  ...awsClientConfig,
  forcePathStyle: Boolean(config.awsEndpoint),
});
