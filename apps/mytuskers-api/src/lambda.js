import serverless from 'serverless-http';
import { createApp } from './app.js';

let handlerPromise;

export const handler = async (event, context) => {
  if (!handlerPromise) {
    handlerPromise = createApp().then((app) => serverless(app));
  }
  const expressHandler = await handlerPromise;
  return expressHandler(event, context);
};
