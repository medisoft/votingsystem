import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';

export const prisma = new PrismaClient();

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp(async (app) => {
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => prisma.$disconnect());
});
