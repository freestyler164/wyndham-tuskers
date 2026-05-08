const AWS_ENDPOINT = process.env.AWS_ENDPOINT || undefined;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const hasStaticCredentials = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

export const awsClientConfig = {
  region: AWS_REGION,
  ...(AWS_ENDPOINT ? { endpoint: AWS_ENDPOINT } : {}),
  ...(hasStaticCredentials
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
};

export { AWS_ENDPOINT };
