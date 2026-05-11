import app from './app.js';
import { ensureTables } from './setupTables.js';
import { config } from './config.js';

const runServer = async () => {
  await ensureTables();
  app.listen(config.port, () => {
    console.log(`Backend running on http://0.0.0.0:${config.port}`);
  });
};

runServer().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
