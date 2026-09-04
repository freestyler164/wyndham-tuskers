import { config } from './aws.js';
import { createApp } from './app.js';

const app = await createApp();

app.listen(config.port, () => {
  console.log(`MyTuskers local API listening on http://localhost:${config.port}`);
});
