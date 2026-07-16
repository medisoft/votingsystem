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
    await prisma.votingScope.deleteMany();
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

  it('creates, edits, and advances a valid voting scope', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const setCookie = login.headers['set-cookie']!;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(
      ';',
    )[0]!;
    const body = {
      name: 'Assembly 2026',
      description: 'Annual assembly',
      activationStartsAt: '2026-08-01T10:00:00Z',
      activationEndsAt: '2026-08-01T14:00:00Z',
      startsAt: '2026-08-01T12:00:00Z',
      endsAt: '2026-08-01T18:00:00Z',
      credentialExpiresAt: '2026-08-02T00:00:00Z',
      votingWeightsEnabled: true,
      issuerKeyVersion: '2026-01',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/scopes',
          headers: { cookie },
          payload: { ...body, endsAt: '2026-08-01T11:00:00Z' },
        })
      ).statusCode,
    ).toBe(400);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scopes',
      headers: { cookie },
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    const scope = created.json().scope;
    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/scopes/${scope.id}`,
      headers: { cookie },
      payload: { name: 'Assembly 2026 updated', version: scope.version },
    });
    expect(edited.statusCode).toBe(200);
    const updated = edited.json().scope;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/scopes/${scope.id}`,
          headers: { cookie },
          payload: { name: 'stale', version: scope.version },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/scopes/${scope.id}/transition`,
          headers: { cookie },
          payload: { status: 'VOTING_ACTIVE', version: updated.version },
        })
      ).statusCode,
    ).toBe(409);
    const transitioned = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/scopes/${scope.id}/transition`,
      headers: { cookie },
      payload: { status: 'REGISTRATION_OPEN', version: updated.version },
    });
    expect(transitioned.statusCode).toBe(200);
    expect(transitioned.json().scope.status).toBe('REGISTRATION_OPEN');
    expect(
      await prisma.auditEvent.count({ where: { targetType: 'VotingScope' } }),
    ).toBe(3);
  });
});
