import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.js';
import type { AppConfig } from './config.js';
import databasePlugin from './plugins/database.js';
import { registerScopeRoutes } from './scopes.js';
export async function buildApp(
  config: AppConfig,
  checkDb?: () => Promise<void>,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
  });
  await app.register(databasePlugin);
  await app.register(cors, { origin: config.ADMIN_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await (checkDb?.() ?? app.prisma.$connect());
      return { status: 'ready', database: 'connected' };
    } catch {
      return reply
        .code(503)
        .send({ status: 'not_ready', database: 'unavailable' });
    }
  });
  app.get('/api/v1', async () => ({ service: 'registration-api', version: 1 }));
  registerAuthRoutes(app, config.NODE_ENV === 'production');
  registerScopeRoutes(app);
  return app;
}
