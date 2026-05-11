import dotenv from 'dotenv';
import { getRuntimeSecret } from './runtimeSecrets.js';

dotenv.config();

const splitList = (value) => (value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const unique = (items) => [...new Set(items.filter(Boolean))];

const defaultLocalOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const configuredOrigins = splitList(process.env.CORS_ALLOWED_ORIGINS);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: process.env.PORT || 4000,
  frontendUrl,
  corsOrigins: unique([
    ...configuredOrigins,
    frontendUrl,
    ...(process.env.NODE_ENV === 'production' ? [] : defaultLocalOrigins),
  ]),
  jwtSecret: process.env.JWT_SECRET,
  jwtSecretId: process.env.JWT_SECRET_ID,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  passwordMinLength: Number(process.env.PASSWORD_MIN_LENGTH || 12),
  enforceHttps: process.env.ENFORCE_HTTPS !== 'false',
  enableMemberRegistration: process.env.ENABLE_MEMBER_REGISTRATION === 'true',
  emailProvider: (process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'resend' : 'localstack')).toLowerCase(),
  emailFrom: process.env.EMAIL_FROM || process.env.SES_SENDER || 'club@wyndhamtuskers.local',
  resendApiKey: process.env.RESEND_API_KEY,
  resendApiKeySecretId: process.env.RESEND_API_KEY_SECRET_ID,
};

if (config.isProduction && !config.jwtSecret && !config.jwtSecretId) {
  throw new Error('JWT_SECRET or JWT_SECRET_ID is required in production.');
}

export const getJwtSecret = () => {
  const secret = getRuntimeSecret('JWT_SECRET') || config.jwtSecret;
  if (secret) return secret;

  if (!config.isProduction) {
    return 'local-dev-jwt-secret-change-me';
  }

  throw new Error('JWT_SECRET is required.');
};

export const validatePassword = (password) => {
  const issues = [];
  if (!password || password.length < config.passwordMinLength) {
    issues.push(`Use at least ${config.passwordMinLength} characters.`);
  }
  if (!/[A-Z]/.test(password || '')) {
    issues.push('Add at least one uppercase letter.');
  }
  if (!/[a-z]/.test(password || '')) {
    issues.push('Add at least one lowercase letter.');
  }
  if (!/[0-9]/.test(password || '')) {
    issues.push('Add at least one number.');
  }

  return {
    valid: issues.length === 0,
    message: issues.length ? `Password is not strong enough. ${issues.join(' ')}` : '',
  };
};
