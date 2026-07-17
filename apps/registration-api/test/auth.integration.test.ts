import { AdminRole, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { REGISTRATION_WRITE_LOCK } from '../src/imports.js';
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
        unitNumber: 'Case-Existing-501',
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
    await prisma.$transaction(async (tx) => {
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(completed).toBe(false);
    });
    expect((await pending).statusCode).toBe(201);
  });
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
      );
      pending = app
        .inject({
          method: 'PATCH',
          url: `/api/v1/admin/registrations/${record.id}`,
          headers: { cookie },
          payload: {
            unitNumber: 'PATCH-LOCK-TARGET',
            version: record.version,
          },
        })
        .then((response) => {
          completed = true;
          return response;
        });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(completed).toBe(false);
    });
    expect((await pending).statusCode).toBe(200);
    expect(
      await prisma.registrationRecord.findUnique({
        where: { unitNumber: 'PATCH-LOCK-TARGET' },
      }),
    ).not.toBeNull();
  });
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
        unitNumber: 'Canonical-Manual-501',
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
});
