import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import surveyRouter from './routes/surveys.js';
import eventRouter from './routes/events.js';
import { ensureTables } from './setupTables.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 4000;

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'wyndham-tuskers-backend' });
});

app.use('/api/auth', authRouter);
app.use('/api/surveys', surveyRouter);
app.use('/api/events', eventRouter);

const runServer = async () => {
  await ensureTables();
  app.listen(port, () => {
    console.log(`Backend running on http://0.0.0.0:${port}`);
  });
};

runServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
