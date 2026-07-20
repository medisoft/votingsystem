import { ActivationTokenStatus, AdminRole, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  generateActivationToken,
  hashActivationToken,
} from '../src/activation-tokens.js';
import {
  IMPORT_TRANSACTION_TIMEOUT_MS,
  REGISTRATION_WRITE_LOCK,
} from '../src/imports.js';
import type { AppConfig } from '../src/config.js';
import { prisma } from '../src/plugins/database.js';
import { assertSafeTestDatabase } from './database-safety.js';

const enabled = process.env.ALLOW_DATABASE_RESET === 'true';
if (enabled) assertSafeTestDatabase(process.env.DATABASE_URL ?? '');
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
    await prisma.activationToken.deleteMany();
    await prisma.registrationImport.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.scopeEligibility.deleteMany();
    await prisma.registrationRecord.deleteMany();
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
    await prisma.adminUser.create({
      data: {
        email: 'auditor@example.com',
        passwordHash: await argon2.hash('auditor-password', {
          type: argon2.argon2id,
        }),
        role: AdminRole.AUDITOR,
      },
    });
    app = await buildApp(config);
  });
  afterAll(async () => app.close());
  it('enforces activation token storage and lifecycle invariants', async () => {
    const administrator = await prisma.adminUser.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    const registration = await prisma.registrationRecord.create({
      data: {
        unitNumber: 'TOKEN-FOUNDATION-1',
        ownerName: 'Token foundation owner',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const scope = await prisma.votingScope.create({
      data: {
        name: 'Token foundation scope',
        startsAt: new Date('2030-01-01T12:00:00Z'),
        endsAt: new Date('2030-01-01T18:00:00Z'),
        activationStartsAt: new Date('2030-01-01T10:00:00Z'),
        activationEndsAt: new Date('2030-01-01T17:00:00Z'),
        credentialExpiresAt: new Date('2030-01-02T00:00:00Z'),
        issuerKeyVersion: '2030-01',
      },
    });
    const firstSecret = generateActivationToken();
    const generatedAt = new Date('2030-01-01T09:00:00Z');
    const common = {
      registrationRecordId: registration.id,
      votingScopeId: scope.id,
      expiresAt: new Date('2030-01-01T17:00:00Z'),
      generatedBy: administrator.id,
      generatedAt,
    };
    const first = await prisma.activationToken.create({
      data: {
        ...common,
        tokenHash: firstSecret.tokenHash,
        tokenPrefixForSupport: firstSecret.tokenPrefixForSupport,
      },
    });
    expect(JSON.stringify(first)).not.toContain(firstSecret.rawToken);
    expect(first.tokenHash).toBe(firstSecret.tokenHash);

    const duplicateSecret = generateActivationToken();
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          tokenHash: duplicateSecret.tokenHash,
          tokenPrefixForSupport: duplicateSecret.tokenPrefixForSupport,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.activationToken.update({
      where: { id: first.id },
      data: {
        status: ActivationTokenStatus.REVOKED,
        revokedAt: new Date('2030-01-01T09:05:00Z'),
        revocationReason: 'Replacement generated',
      },
    });
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          tokenHash: duplicateSecret.tokenHash,
          tokenPrefixForSupport: duplicateSecret.tokenPrefixForSupport,
        },
      }),
    ).resolves.toMatchObject({ status: ActivationTokenStatus.ACTIVE });

    const invalidRegistration = await prisma.registrationRecord.create({
      data: {
        unitNumber: 'TOKEN-FOUNDATION-INVALID',
        ownerName: 'Invalid token owner',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const invalidSecret = generateActivationToken();
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: invalidSecret.tokenHash,
          tokenPrefixForSupport: invalidSecret.tokenPrefixForSupport,
          expiresAt: generatedAt,
        },
      }),
    ).rejects.toThrow();

    const earlyRedemptionSecret = generateActivationToken();
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: earlyRedemptionSecret.tokenHash,
          tokenPrefixForSupport: earlyRedemptionSecret.tokenPrefixForSupport,
          status: ActivationTokenStatus.REDEEMED,
          redeemedAt: new Date('2030-01-01T08:59:59Z'),
        },
      }),
    ).rejects.toThrow();

    const lateRevocationSecret = generateActivationToken();
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: lateRevocationSecret.tokenHash,
          tokenPrefixForSupport: lateRevocationSecret.tokenPrefixForSupport,
          status: ActivationTokenStatus.REVOKED,
          revokedAt: new Date('2030-01-01T17:00:01Z'),
          revocationReason: 'Too late',
        },
      }),
    ).rejects.toThrow();

    const lateDeliverySecret = generateActivationToken();
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: lateDeliverySecret.tokenHash,
          tokenPrefixForSupport: lateDeliverySecret.tokenPrefixForSupport,
          deliveredAt: new Date('2030-01-01T17:00:01Z'),
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: invalidSecret.tokenHash,
          tokenPrefixForSupport: invalidSecret.tokenPrefixForSupport,
          status: ActivationTokenStatus.REDEEMED,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: 'not-a-valid-hash',
          tokenPrefixForSupport: 'Support1',
        },
      }),
    ).rejects.toThrow();

    await prisma.votingScope.delete({ where: { id: scope.id } });
    await prisma.registrationRecord.deleteMany({
      where: { id: { in: [registration.id, invalidRegistration.id] } },
    });
  });

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
  it('manages registration records and per-scope eligibility with decimal weights', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const raw = login.headers['set-cookie']!;
    const cookie = (Array.isArray(raw) ? raw[0]! : raw).split(';')[0]!;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations',
      headers: { cookie },
      payload: {
        unitNumber: 'A-101',
        ownerName: 'Example Owner',
        email: 'owner@example.com',
        votingWeight: '1.2500',
        eligible: true,
        status: 'ACTIVE',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().record.votingWeight).toBe('1.25');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/registrations',
          headers: { cookie },
          payload: {
            unitNumber: 'A-101',
            ownerName: 'Duplicate',
            votingWeight: '1.0000',
          },
        })
      ).statusCode,
    ).toBe(409);
    const record = created.json().record;
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations',
      headers: { cookie },
      payload: {
        unitNumber: 'B-202',
        ownerName: 'Second Owner',
        votingWeight: '1.0000',
      },
    });
    expect(second.statusCode).toBe(201);
    const duplicateUpdate = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/registrations/' + second.json().record.id,
      headers: { cookie },
      payload: { unitNumber: 'A-101', version: second.json().record.version },
    });
    expect(duplicateUpdate.statusCode).toBe(409);
    expect(duplicateUpdate.json().code).toBe('UNIT_EXISTS');
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/registrations?eligible=1',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
    const search = await app.inject({
      url: '/api/v1/admin/registrations?search=A-101',
      headers: { cookie },
    });
    expect(search.json().records).toHaveLength(1);
    const scope = await prisma.votingScope.findFirstOrThrow();
    const eligibility = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/registrations/${record.id}/scopes/${scope.id}`,
      headers: { cookie },
      payload: { eligible: true, votingWeight: '2.5000' },
    });
    expect(eligibility.statusCode).toBe(200);
    expect(eligibility.json().eligibility.votingWeight).toBe('2.5');
    const auditorLogin = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.3',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'auditor@example.com', password: 'auditor-password' },
    });
    const auditorRaw = auditorLogin.headers['set-cookie']!;
    const auditorCookie = (
      Array.isArray(auditorRaw) ? auditorRaw[0]! : auditorRaw
    ).split(';')[0]!;
    const auditorList = await app.inject({
      url: '/api/v1/admin/registrations',
      headers: { cookie: auditorCookie },
    });
    const auditorRecord = auditorList.json().records[0];
    expect(auditorRecord).not.toHaveProperty('ownerName');
    expect(auditorRecord).not.toHaveProperty('email');
    expect(auditorRecord).not.toHaveProperty('phone');
    expect(auditorRecord).not.toHaveProperty('notes');
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/registrations?search=A-101',
          headers: { cookie: auditorCookie },
        })
      ).statusCode,
    ).toBe(403);
    const currentScope = await prisma.votingScope.findUniqueOrThrow({
      where: { id: scope.id },
    });
    await app.prisma.votingScope.update({
      where: { id: scope.id },
      data: { status: 'ACTIVATION_OPEN', version: { increment: 1 } },
    });
    expect(currentScope.status).toBe('REGISTRATION_OPEN');
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/admin/registrations/${record.id}/scopes/${scope.id}`,
          headers: { cookie },
          payload: { eligible: false, votingWeight: '1.0000' },
        })
      ).statusCode,
    ).toBe(409);
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/registrations/' + record.id,
      headers: { cookie },
      payload: { ownerName: 'Updated Owner', version: record.version },
    });
    expect(updated.statusCode).toBe(200);
    const updatedRecord = updated.json().record;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/registrations/${record.id}`,
          headers: { cookie },
          payload: { ownerName: 'Stale', version: record.version },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/admin/registrations/' + record.id,
          headers: { cookie },
          payload: { version: record.version },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/admin/registrations/' + record.id,
          headers: { cookie },
          payload: { version: updatedRecord.version },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/registrations/' + record.id,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/registrations?search=A-101',
          headers: { cookie },
        })
      ).json().records,
    ).toHaveLength(0);
    const auditorEvents = await app.inject({
      url: '/api/v1/admin/audit-events',
      headers: { cookie: auditorCookie },
    });
    expect(auditorEvents.statusCode).toBe(200);
    expect(JSON.stringify(auditorEvents.json().events)).not.toContain('A-101');
    expect(JSON.stringify(auditorEvents.json().events)).not.toContain('B-202');

    const lockingScope = await prisma.votingScope.create({
      data: {
        name: 'Concurrent scope',
        description: null,
        status: 'REGISTRATION_OPEN',
        startsAt: scope.startsAt,
        endsAt: scope.endsAt,
        activationStartsAt: scope.activationStartsAt,
        activationEndsAt: scope.activationEndsAt,
        credentialExpiresAt: scope.credentialExpiresAt,
        votingWeightsEnabled: true,
        issuerKeyVersion: scope.issuerKeyVersion,
      },
    });
    let pendingEligibility!: Promise<{ statusCode: number }>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "VotingScope"
        WHERE "id" = ${lockingScope.id}::uuid
        FOR UPDATE
      `);
      pendingEligibility = app.inject({
        method: 'PUT',
        url:
          '/api/v1/admin/registrations/' +
          second.json().record.id +
          '/scopes/' +
          lockingScope.id,
        headers: { cookie },
        payload: { eligible: true, votingWeight: '1.0000' },
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      await tx.votingScope.update({
        where: { id: lockingScope.id },
        data: { status: 'ACTIVATION_OPEN', version: { increment: 1 } },
      });
    });
    expect((await pendingEligibility).statusCode).toBe(409);
    expect(
      await prisma.scopeEligibility.count({
        where: { votingScopeId: lockingScope.id },
      }),
    ).toBe(0);
  });
  it('previews and partially commits an idempotent CSV import', async () => {
    const login = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.2',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const raw = login.headers['set-cookie']!;
    const cookie = (Array.isArray(raw) ? raw[0]! : raw).split(';')[0]!;
    const auditorLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'auditor@example.com', password: 'auditor-password' },
    });
    const auditorRaw = auditorLogin.headers['set-cookie']!;
    const auditorCookie = (
      Array.isArray(auditorRaw) ? auditorRaw[0]! : auditorRaw
    ).split(';')[0]!;
    const csv = [
      'unit_number,owner_name,email,voting_weight,eligible',
      'D-401,Import Owner,import@example.com,2.5000,true',
      'D-402,,bad-email,1.0000,true',
      'D-401,Duplicate Owner,,1.0000,true',
    ].join('\n');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/registrations/import/preview',
          headers: { cookie: auditorCookie },
          payload: { fileName: 'registrations.csv', csv },
        })
      ).statusCode,
    ).toBe(403);
    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations/import/preview',
      headers: { cookie },
      payload: { fileName: 'registrations.csv', csv },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().preview.summary).toEqual({
      total: 3,
      valid: 1,
      rejected: 2,
    });
    expect(preview.json().preview.rows[1].errors[0]).toMatchObject({
      row: 3,
      field: 'owner_name',
    });
    const committed = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations/import',
      headers: { cookie },
      payload: { fileName: 'registrations.csv', csv },
    });
    expect(committed.statusCode).toBe(201);
    expect(committed.json().import).toMatchObject({
      totalRows: 3,
      importedRows: 1,
      rejectedRows: 2,
    });
    expect(
      await prisma.registrationRecord.count({ where: { unitNumber: 'D-401' } }),
    ).toBe(1);
    const repeated = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations/import',
      headers: { cookie },
      payload: { fileName: 'renamed.csv', csv },
    });
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json().code).toBe('IMPORT_ALREADY_COMMITTED');
    const report = await app.inject({
      url: committed.json().errorReportUrl,
      headers: { cookie },
    });
    expect(report.statusCode).toBe(200);
    expect(report.headers['content-type']).toContain('text/csv');
    expect(report.body).toContain('DUPLICATE_IN_FILE');
    expect(report.body).not.toContain('Duplicate Owner');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { eventType: 'REGISTRATION_CSV_IMPORTED' },
    });
    expect(audit.metadata).toMatchObject({
      totalRows: 3,
      importedRows: 1,
      rejectedRows: 2,
    });
  });
  it('detects existing units case-insensitively during import preview', async () => {
    const login = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.4',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const raw = login.headers['set-cookie']!;
    const cookie = (Array.isArray(raw) ? raw[0]! : raw).split(';')[0]!;
    await prisma.registrationRecord.create({
      data: {
        unitNumber: 'CASE-EXISTING-501',
        ownerName: 'Existing owner',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations/import/preview',
      headers: { cookie },
      payload: {
        fileName: 'case.csv',
        csv: `unit_number,owner_name
case-existing-501,Imported owner
`,
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().preview.summary).toMatchObject({
      valid: 0,
      rejected: 1,
    });
    expect(preview.json().preview.rows[0].errors[0].code).toBe(
      'DUPLICATE_EXISTING',
    );
  });

  it('allows import commits to wait beyond Prisma default transaction timeout', async () => {
    expect(IMPORT_TRANSACTION_TIMEOUT_MS).toBeGreaterThan(5_000);
    const login = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.8',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const raw = login.headers['set-cookie']!;
    const cookie = (Array.isArray(raw) ? raw[0]! : raw).split(';')[0]!;
    let completed = false;
    let pending!: Promise<Awaited<ReturnType<typeof app.inject>>>;
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
        );
        pending = app
          .inject({
            method: 'POST',
            url: '/api/v1/admin/registrations/import',
            headers: { cookie },
            payload: {
              fileName: 'lock-wait.csv',
              csv: `unit_number,owner_name
IMPORT-LOCK-WAIT,Waiting owner
`,
            },
          })
          .then((response) => {
            completed = true;
            return response;
          });
        await new Promise((resolve) => setTimeout(resolve, 5_250));
        expect(completed).toBe(false);
      },
      { timeout: 10_000 },
    );
    expect((await pending).statusCode).toBe(201);
  }, 12_000);

  it('serializes manual registration creation with imports', async () => {
    const login = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.5',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const raw = login.headers['set-cookie']!;
    const cookie = (Array.isArray(raw) ? raw[0]! : raw).split(';')[0]!;
    let completed = false;
    let pending!: Promise<Awaited<ReturnType<typeof app.inject>>>;
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
        );
        pending = app
          .inject({
            method: 'POST',
            url: '/api/v1/admin/registrations',
            headers: { cookie },
            payload: {
              unitNumber: 'LOCK-501',
              ownerName: 'Lock test',
              votingWeight: '1.0000',
            },
          })
          .then((response) => {
            completed = true;
            return response;
          });
        await new Promise((resolve) => setTimeout(resolve, 5_250));
        expect(completed).toBe(false);
      },
      { timeout: 10_000 },
    );
    expect((await pending).statusCode).toBe(201);
  }, 12_000);
  it('serializes unit-number updates with imports', async () => {
    const login = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.6',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const rawCookie = login.headers['set-cookie']!;
    const cookie = (Array.isArray(rawCookie) ? rawCookie[0]! : rawCookie).split(
      ';',
    )[0]!;
    const record = await prisma.registrationRecord.create({
      data: {
        unitNumber: 'PATCH-LOCK-SOURCE',
        ownerName: 'Patch lock test',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    let completed = false;
    let pending!: Promise<Awaited<ReturnType<typeof app.inject>>>;
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
        );
        pending = app
          .inject({
            method: 'PATCH',
            url: `/api/v1/admin/registrations/${record.id}`,
            headers: { cookie },
            payload: {
              unitNumber: 'patch-lock-target',
              version: record.version,
            },
          })
          .then((response) => {
            completed = true;
            return response;
          });
        await new Promise((resolve) => setTimeout(resolve, 5_250));
        expect(completed).toBe(false);
      },
      { timeout: 10_000 },
    );
    expect((await pending).statusCode).toBe(200);
    expect(
      await prisma.registrationRecord.findUnique({
        where: { unitNumber: 'PATCH-LOCK-TARGET' },
      }),
    ).not.toBeNull();
  }, 12_000);
  it('returns structured empty and zero-valid import errors and rejects canonical manual duplicates', async () => {
    const login = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.7',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const rawCookie = login.headers['set-cookie']!;
    const cookie = (Array.isArray(rawCookie) ? rawCookie[0]! : rawCookie).split(
      ';',
    )[0]!;
    const emptyPreview = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations/import/preview',
      headers: { cookie },
      payload: { fileName: 'empty.csv', csv: '' },
    });
    expect(emptyPreview.statusCode).toBe(200);
    expect(emptyPreview.json().preview.errors[0].code).toBe('EMPTY_FILE');

    const invalidCsv = `unit_number,owner_name
INVALID-ONLY,
`;
    const importsBefore = await prisma.registrationImport.count();
    const invalidCommit = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations/import',
      headers: { cookie },
      payload: { fileName: 'invalid-only.csv', csv: invalidCsv },
    });
    expect(invalidCommit.statusCode).toBe(400);
    expect(invalidCommit.json().code).toBe('INVALID_CSV');
    expect(invalidCommit.json().preview.summary.valid).toBe(0);
    expect(await prisma.registrationImport.count()).toBe(importsBefore);

    await prisma.registrationRecord.create({
      data: {
        unitNumber: 'CANONICAL-MANUAL-501',
        ownerName: 'Canonical owner',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations',
      headers: { cookie },
      payload: {
        unitNumber: 'canonical-manual-501',
        ownerName: 'Duplicate owner',
        votingWeight: '1.0000',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('UNIT_EXISTS');
  });
  it('rejects canonical duplicate renames and lowercase database writes', async () => {
    const login = await app.inject({
      method: 'POST',
      remoteAddress: '127.0.0.8',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const rawCookie = login.headers['set-cookie']!;
    const cookie = (Array.isArray(rawCookie) ? rawCookie[0]! : rawCookie).split(
      ';',
    )[0]!;
    const existing = await prisma.registrationRecord.create({
      data: {
        unitNumber: 'RENAME-DUPLICATE-A',
        ownerName: 'Existing canonical owner',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const renamed = await prisma.registrationRecord.create({
      data: {
        unitNumber: 'RENAME-DUPLICATE-B',
        ownerName: 'Rename source owner',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const duplicate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/registrations/${renamed.id}`,
      headers: { cookie },
      payload: {
        unitNumber: existing.unitNumber.toLowerCase(),
        version: renamed.version,
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('UNIT_EXISTS');
    expect(
      (
        await prisma.registrationRecord.findUniqueOrThrow({
          where: { id: renamed.id },
        })
      ).unitNumber,
    ).toBe('RENAME-DUPLICATE-B');
    await expect(
      prisma.registrationRecord.create({
        data: {
          unitNumber: 'database-lowercase',
          ownerName: 'Constraint test',
          votingWeight: new Prisma.Decimal('1.0000'),
        },
      }),
    ).rejects.toThrow();
  });

  it('generates, replaces, revokes, audits, and rate limits activation tokens', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      remoteAddress: '127.0.0.20',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const rawCookie = login.headers['set-cookie']!;
    const cookie = (Array.isArray(rawCookie) ? rawCookie[0]! : rawCookie).split(
      ';',
    )[0]!;
    const registration = await prisma.registrationRecord.create({
      data: {
        unitNumber: 'TOKEN-API-1',
        ownerName: 'Token API owner',
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const scope = await prisma.votingScope.create({
      data: {
        name: 'Token API scope',
        status: 'ACTIVATION_OPEN',
        startsAt: new Date('2035-01-01T12:00:00Z'),
        endsAt: new Date('2035-01-01T18:00:00Z'),
        activationStartsAt: new Date('2035-01-01T10:00:00Z'),
        activationEndsAt: new Date('2035-01-01T17:00:00Z'),
        credentialExpiresAt: new Date('2035-01-02T00:00:00Z'),
        issuerKeyVersion: '2035-01',
      },
    });
    const eligibility = await prisma.scopeEligibility.create({
      data: {
        registrationRecordId: registration.id,
        votingScopeId: scope.id,
        eligible: false,
        votingWeight: new Prisma.Decimal('1.0000'),
      },
    });
    const closedScope = await prisma.votingScope.create({
      data: {
        name: 'Closed token API scope',
        status: 'CLOSED',
        startsAt: new Date('2035-02-01T12:00:00Z'),
        endsAt: new Date('2035-02-01T18:00:00Z'),
        activationStartsAt: new Date('2035-02-01T10:00:00Z'),
        activationEndsAt: new Date('2035-02-01T17:00:00Z'),
        credentialExpiresAt: new Date('2035-02-02T00:00:00Z'),
        issuerKeyVersion: '2035-02',
      },
    });
    const closedScopeResponse = await app.inject({
      method: 'POST',
      url:
        '/api/v1/admin/registrations/' +
        registration.id +
        '/scopes/' +
        closedScope.id +
        '/activation-token',
      remoteAddress: '127.0.0.22',
      headers: { cookie },
      payload: {},
    });
    expect(closedScopeResponse.statusCode).toBe(409);
    expect(closedScopeResponse.json().code).toBe('ACTIVATION_SCOPE_NOT_OPEN');

    const generateUrl =
      '/api/v1/admin/registrations/' +
      registration.id +
      '/scopes/' +
      scope.id +
      '/activation-token';
    const ineligible = await app.inject({
      method: 'POST',
      url: generateUrl,
      headers: { cookie },
      payload: {},
    });
    expect(ineligible.statusCode).toBe(409);
    expect(ineligible.json().code).toBe('REGISTRATION_NOT_ELIGIBLE');
    await prisma.scopeEligibility.update({
      where: { id: eligibility.id },
      data: { eligible: true },
    });

    const firstResponse = await app.inject({
      method: 'POST',
      url: generateUrl,
      headers: { cookie },
      payload: { deliveryMethod: 'PRINT' },
    });
    expect(firstResponse.statusCode).toBe(201);
    const first = firstResponse.json().activationToken;
    expect(first.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toHaveProperty('tokenHash');
    expect(first).not.toHaveProperty('generatedBy');
    const storedFirst = await prisma.activationToken.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(storedFirst.tokenHash).toBe(hashActivationToken(first.rawToken));
    expect(JSON.stringify(storedFirst)).not.toContain(first.rawToken);

    const deliveredResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activation-tokens/' + first.id + '/delivered',
      headers: { cookie },
      payload: { deliveryMethod: 'PRINT' },
    });
    expect(deliveredResponse.statusCode).toBe(200);
    expect(deliveredResponse.json().activationToken.deliveredAt).toBeTruthy();
    expect(deliveredResponse.json().activationToken).not.toHaveProperty(
      'rawToken',
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/activation-tokens/' + first.id + '/delivered',
          headers: { cookie },
          payload: { deliveryMethod: 'PRINT' },
        })
      ).statusCode,
    ).toBe(409);

    const replacementResponse = await app.inject({
      method: 'POST',
      url: generateUrl,
      headers: { cookie },
      payload: {},
    });
    expect(replacementResponse.statusCode).toBe(201);
    const replacement = replacementResponse.json().activationToken;
    expect(replacement.rawToken).not.toBe(first.rawToken);
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { id: first.id },
      }),
    ).toMatchObject({
      status: ActivationTokenStatus.REVOKED,
      revocationReason: 'Replacement generated',
    });

    const revokedResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activation-tokens/' + replacement.id + '/revoke',
      headers: { cookie },
      payload: { reason: 'Resident requested replacement' },
    });
    expect(revokedResponse.statusCode).toBe(200);
    expect(revokedResponse.json().activationToken).not.toHaveProperty(
      'rawToken',
    );
    expect(revokedResponse.json().activationToken).not.toHaveProperty(
      'tokenHash',
    );
    expect(revokedResponse.json().activationToken.status).toBe('REVOKED');
    const secondRevoke = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activation-tokens/' + replacement.id + '/revoke',
      headers: { cookie },
      payload: { reason: 'Repeat request' },
    });
    expect(secondRevoke.statusCode).toBe(409);

    const expiredSecret = generateActivationToken();
    const expired = await prisma.activationToken.create({
      data: {
        registrationRecordId: registration.id,
        votingScopeId: scope.id,
        tokenHash: expiredSecret.tokenHash,
        tokenPrefixForSupport: expiredSecret.tokenPrefixForSupport,
        generatedBy: storedFirst.generatedBy,
        generatedAt: new Date(Date.now() - 2_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const expiredDelivery = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activation-tokens/' + expired.id + '/delivered',
      headers: { cookie },
      payload: { deliveryMethod: 'PRINT' },
    });
    expect(expiredDelivery.statusCode).toBe(409);
    expect(expiredDelivery.json().code).toBe('ACTIVATION_TOKEN_EXPIRED');
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { id: expired.id },
      }),
    ).toMatchObject({ deliveredAt: null });
    await prisma.activationToken.update({
      where: { id: expired.id },
      data: { status: ActivationTokenStatus.EXPIRED },
    });

    const auditorLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      remoteAddress: '127.0.0.21',
      payload: { email: 'auditor@example.com', password: 'auditor-password' },
    });
    const auditorRawCookie = auditorLogin.headers['set-cookie']!;
    const auditorCookie = (
      Array.isArray(auditorRawCookie) ? auditorRawCookie[0]! : auditorRawCookie
    ).split(';')[0]!;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: generateUrl,
          headers: { cookie: auditorCookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        targetType: 'ActivationToken',
        targetId: { in: [first.id, replacement.id] },
      },
    });
    expect(auditEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'ACTIVATION_TOKEN_GENERATED',
        'ACTIVATION_TOKEN_DELIVERED',
        'ACTIVATION_TOKEN_REPLACED',
        'ACTIVATION_TOKEN_REVOKED',
      ]),
    );
    expect(JSON.stringify(auditEvents)).not.toContain(first.rawToken);
    expect(JSON.stringify(auditEvents)).not.toContain(replacement.rawToken);

    const missingUrl =
      '/api/v1/admin/registrations/00000000-0000-4000-8000-000000000001/scopes/' +
      scope.id +
      '/activation-token';
    for (let attempt = 0; attempt < 9; attempt += 1)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: missingUrl,
            remoteAddress: '127.0.0.22',
            headers: { cookie },
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: missingUrl,
          remoteAddress: '127.0.0.22',
          headers: { cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(429);
  });
});
