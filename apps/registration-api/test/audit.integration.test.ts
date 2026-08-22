import { AdminRole, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { verifyStoredAuditChain } from '../src/audit.js';
import { prisma } from '../src/plugins/database.js';
import { assertSafeTestDatabase } from './database-safety.js';
import { testConfig } from './test-config.js';

const enabled = process.env.ALLOW_DATABASE_RESET === 'true';
if (enabled) assertSafeTestDatabase(process.env.DATABASE_URL ?? '');
const config = testConfig();
const suite = enabled ? describe : describe.skip;

suite('audit integrity and operational reports', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminCookie = '';
  let auditorCookie = '';

  beforeAll(async () => {
    await prisma.issuedCredential.deleteMany();
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
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const auditorLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        email: 'auditor@example.com',
        password: 'auditor-password',
      },
    });
    adminCookie = String(adminLogin.headers['set-cookie']).split(';')[0]!;
    auditorCookie = String(auditorLogin.headers['set-cookie']).split(';')[0]!;
  });
  afterAll(async () => app.close());

  it('verifies the hash chain and fails after an older row is modified', async () => {
    expect(await verifyStoredAuditChain(prisma)).toMatchObject({ valid: true });
    const oldest = await prisma.auditEvent.findFirstOrThrow({
      orderBy: { chainIndex: 'asc' },
    });
    await prisma.auditEvent.update({
      where: { id: oldest.id },
      data: { metadata: { tampered: true } },
    });
    const broken = await verifyStoredAuditChain(prisma);
    expect(broken.valid).toBe(false);
    expect(broken.reason).toMatch(/eventHash mismatch/);
    await prisma.auditEvent.update({
      where: { id: oldest.id },
      data: { metadata: oldest.metadata as Prisma.InputJsonValue },
    });
    expect(await verifyStoredAuditChain(prisma)).toMatchObject({ valid: true });
  });

  it('lets auditors read reports and CSV exports without mutating records', async () => {
    const asOf = '2026-08-22T18:00:00.000Z';
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations',
      headers: { cookie: adminCookie },
      payload: {
        unitNumber: 'R-901',
        ownerName: 'Report Owner',
        votingWeight: '1.0000',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/registrations',
          headers: { cookie: auditorCookie },
          payload: {
            unitNumber: 'R-902',
            ownerName: 'Should fail',
            votingWeight: '1.0000',
          },
        })
      ).statusCode,
    ).toBe(403);

    const json = await app.inject({
      url: `/api/v1/admin/reports/registration-summary?asOf=${asOf}`,
      headers: { cookie: auditorCookie },
    });
    expect(json.statusCode).toBe(200);
    expect(json.json().report.totalRecords).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(json.json())).not.toContain('Report Owner');
    expect(JSON.stringify(json.json())).not.toContain('R-901');

    const csv = await app.inject({
      url: `/api/v1/admin/reports/registration-summary.csv?asOf=${asOf}`,
      headers: { cookie: auditorCookie },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body).toContain('GLOBAL');
    expect(csv.body).not.toContain('Report Owner');
    expect(csv.body).not.toContain('correct-password');
    const second = await app.inject({
      url: `/api/v1/admin/reports/registration-summary.csv?asOf=${asOf}`,
      headers: { cookie: auditorCookie },
    });
    expect(second.body).toBe(csv.body);

    const activation = await app.inject({
      url: `/api/v1/admin/reports/activation-summary?asOf=${asOf}`,
      headers: { cookie: auditorCookie },
    });
    const credentials = await app.inject({
      url: `/api/v1/admin/reports/credential-status?asOf=${asOf}`,
      headers: { cookie: auditorCookie },
    });
    expect(activation.statusCode).toBe(200);
    expect(credentials.statusCode).toBe(200);

    const exports = await prisma.auditEvent.findMany({
      where: { eventType: 'REPORT_EXPORTED' },
      orderBy: { chainIndex: 'desc' },
      take: 2,
    });
    expect(exports).toHaveLength(2);
    expect(exports[0]?.metadata).toMatchObject({
      report: 'registration-summary',
      format: 'csv',
      asOf,
    });
    expect(JSON.stringify(exports)).not.toContain('Report Owner');
  });
});
