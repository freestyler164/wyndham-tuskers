import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import surveyRouter from './routes/surveys.js';
import eventRouter from './routes/events.js';
import newsRouter from './routes/news.js';
import marketplaceRouter from './routes/marketplace.js';
import galleryRouter from './routes/gallery.js';
import paintingCompetitionRouter, { getPaintingCompetitionConfig, isPaintingCompetitionPublic } from './routes/paintingCompetition.js';
import onamScheduleRouter, { getOnamScheduleConfig, isOnamSchedulePublic } from './routes/onamSchedule.js';
import { config } from './config.js';
import { loadRuntimeSecrets } from './runtimeSecrets.js';
import { getMemberRegistrationSetting } from './services/settings.js';

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
app.use(express.json({ limit: '8mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'wyndham-tuskers-backend' });
});

app.get('/api/config', async (req, res, next) => {
  try {
    const [memberRegistration, onamSchedule, paintingCompetition] = await Promise.all([
      getMemberRegistrationSetting(),
      getOnamScheduleConfig(),
      getPaintingCompetitionConfig(),
    ]);
    res.json({
      enableMemberRegistration: Boolean(memberRegistration.enabled),
      onamSchedulePublished: isOnamSchedulePublic(onamSchedule),
      onamScheduleMenuLabel: onamSchedule.menuLabel || 'Onam 2026',
      onamScheduleStatus: onamSchedule.eventStatus || 'upcoming',
      paintingCompetitionPublic: isPaintingCompetitionPublic(paintingCompetition),
    });
  } catch (error) {
    next(error);
  }
});

const paintingSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.PAINTING_SUBMISSION_RATE_LIMIT_MAX || 8),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many painting submissions from this connection. Please try again later.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/painting-competition/submissions', paintingSubmissionLimiter);

app.use('/api/auth', authRouter);
app.use('/api/surveys', surveyRouter);
app.use('/api/events', eventRouter);
app.use('/api/news', newsRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/painting-competition', paintingCompetitionRouter);
app.use('/api/onam-schedule', onamScheduleRouter);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  return res.status(error.status || 500).json({
    message: config.isProduction ? 'The request could not be completed.' : error.message,
  });
});

export default app;
