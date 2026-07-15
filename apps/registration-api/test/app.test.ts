import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
const config: AppConfig = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  ADMIN_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
};
describe('health', () => {
  it('reports live and ready', async () => {
    const app = await buildApp(config, async () => undefined);
    expect((await app.inject({ url: '/health/live' })).json()).toEqual({
      status: 'ok',
    });
    expect((await app.inject({ url: '/health/ready' })).json()).toEqual({
      status: 'ready',
      database: 'connected',
    });
    await app.close();
  });
  it('returns 503 without database', async () => {
    const app = await buildApp(config, async () => {
      throw new Error('offline');
    });
    expect((await app.inject({ url: '/health/ready' })).statusCode).toBe(503);
    await app.close();
  });
});
