import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import surveyRouter from './routes/surveys.js';
import eventRouter from './routes/events.js';
import { config } from './config.js';
import { loadRuntimeSecrets } from './runtimeSecrets.js';

const app = express();

app.set('trust proxy', 1);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true,
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
});

app.use((req, res, next) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const isLocal = !config.isProduction;
  if (!isLocal && config.enforceHttps && forwardedProto && forwardedProto !== 'https') {
    return res.status(403).json({ message: 'HTTPS is required.' });
  }
  return next();
});

app.use(async (req, res, next) => {
  try {
    await loadRuntimeSecrets();
    next();
  } catch (error) {
    next(error);
  }
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'wyndham-tuskers-backend' });
});

app.get('/api/config', (req, res) => {
  res.json({
    enableMemberRegistration: config.enableMemberRegistration,
  });
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use('/api/auth', authRouter);
app.use('/api/surveys', surveyRouter);
app.use('/api/events', eventRouter);

export default app;
