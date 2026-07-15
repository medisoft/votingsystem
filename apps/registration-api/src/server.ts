import { buildApp, disconnectDatabase } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const app = await buildApp(config);
const shutdown = async () => {
  await app.close();
  await disconnectDatabase();
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  await disconnectDatabase();
  process.exit(1);
}
