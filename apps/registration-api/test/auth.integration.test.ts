import { AdminRole } from '@prisma/client';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { prisma } from '../src/plugins/database.js';

const enabled = process.env.ALLOW_DATABASE_RESET === 'true';
const config: AppConfig = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://unused:unused@localhost:5432/unused',
  ADMIN_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
};
const suite = enabled ? describe : describe.skip;

suite('administrative authentication', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.adminSession.deleteMany();
    await prisma.adminUser.deleteMany();
    await prisma.adminUser.create({
      data: {
        email: 'admin@example.com',
        passwordHash: await argon2.hash('correct-password', {
          type: argon2.argon2id,
        }),
        role: AdminRole.SYSTEM_ADMIN,
      },
    });
    app = await buildApp(config);
  });
  afterAll(async () => app.close());
  it('logs in, protects routes, audits access, and logs out', async () => {
    expect((await app.inject({ url: '/api/v1/admin/me' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/auth/login',
          payload: { email: 'admin@example.com', password: 'wrong' },
        })
      ).statusCode,
    ).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user).not.toHaveProperty('passwordHash');
    const setCookie = login.headers['set-cookie']!;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(
      ';',
    )[0]!;
    expect(
      (await app.inject({ url: '/api/v1/admin/me', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/v1/admin/users', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/auth/logout',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: '/api/v1/admin/me', headers: { cookie } }))
        .statusCode,
    ).toBe(401);
    expect(await prisma.auditEvent.count()).toBeGreaterThanOrEqual(3);
  });
});
