import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { awsClientConfig } from '../awsConfig.js';
import { config } from '../config.js';

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const SETTINGS_TABLE = process.env.SETTINGS_TABLE || 'settings';
const MEMBER_REGISTRATION_SETTING_ID = 'memberRegistration';

export const getMemberRegistrationSetting = async () => {
  try {
    const result = await db.send(new GetCommand({
      TableName: SETTINGS_TABLE,
      Key: { id: MEMBER_REGISTRATION_SETTING_ID },
    }));

    return {
      enabled: result.Item?.enabled ?? config.enableMemberRegistration,
      updatedAt: result.Item?.updatedAt,
      updatedBy: result.Item?.updatedBy,
      source: result.Item ? 'settings' : 'environment',
    };
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return {
        enabled: config.enableMemberRegistration,
        source: 'environment',
      };
    }
    throw error;
  }
};

export const isMemberRegistrationEnabled = async () => {
  const setting = await getMemberRegistrationSetting();
  return Boolean(setting.enabled);
};

export const updateMemberRegistrationSetting = async ({ enabled, updatedBy }) => {
  const now = new Date().toISOString();
  const item = {
    id: MEMBER_REGISTRATION_SETTING_ID,
    enabled: Boolean(enabled),
    updatedAt: now,
    updatedBy,
  };

  await db.send(new PutCommand({
    TableName: SETTINGS_TABLE,
    Item: item,
  }));

  return {
    enabled: item.enabled,
    updatedAt: item.updatedAt,
    updatedBy: item.updatedBy,
    source: 'settings',
  };
};
