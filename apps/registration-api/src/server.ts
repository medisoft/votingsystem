import { buildApp } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const app = await buildApp(config);
const shutdown = async () => {
  await app.close();
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
