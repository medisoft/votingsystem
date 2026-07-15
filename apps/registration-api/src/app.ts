import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
const prisma = new PrismaClient();
export async function buildApp(
  config: AppConfig,
  checkDb = async () => {
    await prisma.$connect();
  },
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
  await app.register(cors, { origin: config.ADMIN_ORIGIN, credentials: true });
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await checkDb();
      return { status: 'ready', database: 'connected' };
    } catch {
      return reply
        .code(503)
        .send({ status: 'not_ready', database: 'unavailable' });
    }
  });
  app.get('/api/v1', async () => ({ service: 'registration-api', version: 1 }));
  return app;
}
export const disconnectDatabase = async (): Promise<void> =>
  prisma.$disconnect();
