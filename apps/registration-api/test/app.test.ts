import { describe, expect, it } from 'vitest';
import { buildApp, MAX_JSON_BODY_BYTES } from '../src/app.js';
import { testConfig } from './test-config.js';
const config = testConfig({
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
});
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

describe('request limits', () => {
  it('rejects malformed JSON before the handler runs', async () => {
    const app = await buildApp(config, async () => undefined);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{not-json',
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('rejects oversized JSON bodies', async () => {
    const app = await buildApp(config, async () => undefined);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: `{"email":"${'a'.repeat(MAX_JSON_BODY_BYTES)}"}`,
    });
    expect(response.statusCode).toBe(413);
    await app.close();
  });

  it('rejects a malformed public scope id without querying the database', async () => {
    const app = await buildApp(config, async () => undefined);
    const response = await app.inject({
      url: '/api/v1/public/scopes/not-a-uuid/status',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'INVALID_SCOPE_ID' });
    await app.close();
  });
});
