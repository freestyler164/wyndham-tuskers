import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { awsClientConfig } from './awsConfig.js';

const secretsClient = new SecretsManagerClient(awsClientConfig);
const cache = {};
let loadPromise;

const readSecret = async (secretId) => {
  if (!secretId) {
    return undefined;
  }

  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  return result.SecretString;
};

export const loadRuntimeSecrets = async () => {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = Promise.all([
    readSecret(process.env.JWT_SECRET_ID),
    readSecret(process.env.RESEND_API_KEY_SECRET_ID),
  ]).then(([jwtSecret, resendApiKey]) => {
    if (jwtSecret) {
      cache.JWT_SECRET = jwtSecret;
    }
    if (resendApiKey) {
      cache.RESEND_API_KEY = resendApiKey;
    }
    return cache;
  });

  return loadPromise;
};

export const getRuntimeSecret = (name) => cache[name];
