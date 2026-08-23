import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { ActivationTokenStatus, AdminRole, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  generateActivationToken,
  hashActivationToken,
} from '../src/activation-tokens.js';
import { bytesToBase64url, hashBlindedMessage } from '../src/blind-rsa.js';
import {
  BLIND_CREDENTIAL_PROTOCOL,
  canonicalizeRevocationList,
  generateClientNonce,
  type PublicMetadata,
  type RevocationListPayload,
} from '../src/credentials.js';
import { createIssuer, verifyCanonical } from '../src/issuer-keys.js';
import { generateTotpCode } from '../src/totp.js';
import {
  IMPORT_TRANSACTION_TIMEOUT_MS,
  REGISTRATION_WRITE_LOCK,
} from '../src/imports.js';
import { prisma } from '../src/plugins/database.js';
import { assertSafeTestDatabase } from './database-safety.js';
import { redeemBlindActivation } from './blind-activate.js';
import { testConfig, testIssuerPrivateKey } from './test-config.js';

const enabled = process.env.ALLOW_DATABASE_RESET === 'true';
if (enabled) assertSafeTestDatabase(process.env.DATABASE_URL ?? '');
const config = testConfig();
const suite = enabled ? describe : describe.skip;

/**
 * Builds a 32-byte Ed25519 public key encoded as canonical base64url.
 *
 * @returns Voter public key accepted by the activation endpoint.
 */
function voterPublicKey() {
  return Buffer.from(
    generateKeyPairSync('ed25519').publicKey.export({
      type: 'spki',
      format: 'der',
    }),
  )
    .subarray(-32)
    .toString('base64url');
}

/**
 * Well-formed activate body that is not a successful client blinding.
 *
 * @param rawToken - Activation token placed in the request.
 * @returns Payload accepted by request validation.
 */
function dummyActivatePayload(rawToken: string) {
  return {
    activationToken: rawToken,
    protocol: BLIND_CREDENTIAL_PROTOCOL,
    blindedMessage: Buffer.alloc(256, 1).toString('base64url'),
    publicMetadata: {
      schemaVersion: 2,
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      scopeId: '11111111-1111-4111-8111-111111111111',
      weight: '1.0000',
      credentialVersion: 1,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      issuer: config.ISSUER_ID,
      keyVersion: config.ISSUER_KEY_VERSION,
    },
    clientNonce: generateClientNonce(),
  };
}

/**
 * Creates an eligible registration, open activation scope, and unused token.
 *
 * @param unitNumber - Unique unit identifier for the registration record.
 * @returns Persisted rows plus the one-time raw activation token.
 */
async function openActivation(unitNumber: string) {
  const administrator = await prisma.adminUser.findUniqueOrThrow({
    where: { email: 'admin@example.com' },
  });
  const now = Date.now();
  const registration = await prisma.registrationRecord.create({
    data: {
      unitNumber,
      ownerName: 'Credential owner',
      votingWeight: new Prisma.Decimal('2.5000'),
    },
  });
  const scope = await prisma.votingScope.create({
    data: {
      name: `Credential scope ${unitNumber}`,
      status: 'ACTIVATION_OPEN',
      startsAt: new Date(now + 3_600_000),
      endsAt: new Date(now + 7_200_000),
      activationStartsAt: new Date(now - 3_600_000),
      activationEndsAt: new Date(now + 5_400_000),
      credentialExpiresAt: new Date(now + 86_400_000),
      issuerKeyVersion: config.ISSUER_KEY_VERSION,
    },
  });
  const generated = generateActivationToken();
  const token = await prisma.activationToken.create({
    data: {
      registrationRecordId: registration.id,
      votingScopeId: scope.id,
      tokenHash: generated.tokenHash,
      tokenPrefixForSupport: generated.tokenPrefixForSupport,
      generatedBy: administrator.id,
      expiresAt: new Date(now + 5_400_000),
    },
  });
  return { registration, scope, token, rawToken: generated.rawToken };
}

suite('administrative authentication', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
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

    const missingReasonSecret = generateActivationToken();
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: missingReasonSecret.tokenHash,
          tokenPrefixForSupport: missingReasonSecret.tokenPrefixForSupport,
          status: ActivationTokenStatus.REVOKED,
          revokedAt: new Date('2030-01-01T09:05:00Z'),
        },
      }),
    ).rejects.toThrow();

    const blankReasonSecret = generateActivationToken();
    await expect(
      prisma.activationToken.create({
        data: {
          ...common,
          registrationRecordId: invalidRegistration.id,
          tokenHash: blankReasonSecret.tokenHash,
          tokenPrefixForSupport: blankReasonSecret.tokenPrefixForSupport,
          status: ActivationTokenStatus.REVOKED,
          revokedAt: new Date('2030-01-01T09:05:00Z'),
          revocationReason: '   ',
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
    const administrator = await prisma.adminUser.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
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
    const hour = 60 * 60 * 1_000;
    const activationStartsAt = Date.now() + 24 * hour;
    const scope = await prisma.votingScope.create({
      data: {
        name: 'Registration lifecycle scope',
        status: 'REGISTRATION_OPEN',
        activationStartsAt: new Date(activationStartsAt),
        activationEndsAt: new Date(activationStartsAt + 4 * hour),
        startsAt: new Date(activationStartsAt + 2 * hour),
        endsAt: new Date(activationStartsAt + 8 * hour),
        credentialExpiresAt: new Date(activationStartsAt + 14 * hour),
        votingWeightsEnabled: true,
        issuerKeyVersion: 'test-registration-lifecycle',
      },
    });
    const eligibility = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/registrations/${record.id}/scopes/${scope.id}`,
      headers: { cookie },
      payload: { eligible: true, votingWeight: '2.5000' },
    });
    expect(eligibility.statusCode).toBe(200);
    expect(eligibility.json().eligibility.votingWeight).toBe('2.5');
    const scopedSecret = generateActivationToken();
    const scopedToken = await prisma.activationToken.create({
      data: {
        registrationRecordId: record.id,
        votingScopeId: scope.id,
        tokenHash: scopedSecret.tokenHash,
        tokenPrefixForSupport: scopedSecret.tokenPrefixForSupport,
        expiresAt: scope.activationEndsAt,
        generatedBy: administrator.id,
      },
    });
    const madeScopeIneligible = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/registrations/${record.id}/scopes/${scope.id}`,
      headers: { cookie },
      payload: { eligible: false, votingWeight: '2.5000' },
    });
    expect(madeScopeIneligible.statusCode).toBe(200);
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { id: scopedToken.id },
      }),
    ).toMatchObject({
      status: ActivationTokenStatus.REVOKED,
      revocationReason: 'Scope eligibility removed',
    });
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          eventType: 'ACTIVATION_TOKEN_REVOKED',
          targetType: 'ActivationToken',
          targetId: scopedToken.id,
        },
      }),
    ).toMatchObject({
      actorId: administrator.id,
      metadata: {
        reason: 'Scope eligibility removed',
        trigger: 'SCOPE_ELIGIBILITY_SET',
      },
    });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/admin/registrations/${record.id}/scopes/${scope.id}`,
          headers: { cookie },
          payload: { eligible: true, votingWeight: '2.5000' },
        })
      ).statusCode,
    ).toBe(200);

    const globalSecret = generateActivationToken();
    const globalToken = await prisma.activationToken.create({
      data: {
        registrationRecordId: second.json().record.id,
        votingScopeId: scope.id,
        tokenHash: globalSecret.tokenHash,
        tokenPrefixForSupport: globalSecret.tokenPrefixForSupport,
        expiresAt: scope.activationEndsAt,
        generatedBy: administrator.id,
      },
    });
    const madeGloballyIneligible = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/registrations/' + second.json().record.id,
      headers: { cookie },
      payload: { eligible: false, version: second.json().record.version },
    });
    expect(madeGloballyIneligible.statusCode).toBe(200);
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { id: globalToken.id },
      }),
    ).toMatchObject({
      status: ActivationTokenStatus.REVOKED,
      revocationReason: 'Registration became ineligible',
    });
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          eventType: 'ACTIVATION_TOKEN_REVOKED',
          targetType: 'ActivationToken',
          targetId: globalToken.id,
        },
      }),
    ).toMatchObject({
      actorId: administrator.id,
      metadata: {
        reason: 'Registration became ineligible',
        trigger: 'REGISTRATION_UPDATED',
      },
    });
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
    const deletionSecret = generateActivationToken();
    const deletionToken = await prisma.activationToken.create({
      data: {
        registrationRecordId: record.id,
        votingScopeId: scope.id,
        tokenHash: deletionSecret.tokenHash,
        tokenPrefixForSupport: deletionSecret.tokenPrefixForSupport,
        expiresAt: scope.activationEndsAt,
        generatedBy: administrator.id,
      },
    });
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
      await prisma.activationToken.findUniqueOrThrow({
        where: { id: deletionToken.id },
      }),
    ).toMatchObject({
      status: ActivationTokenStatus.REVOKED,
      revocationReason: 'Registration soft-deleted',
    });
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          eventType: 'ACTIVATION_TOKEN_REVOKED',
          targetType: 'ActivationToken',
          targetId: deletionToken.id,
        },
      }),
    ).toMatchObject({
      actorId: administrator.id,
      metadata: {
        reason: 'Registration soft-deleted',
        trigger: 'REGISTRATION_SOFT_DELETED',
      },
    });
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
    const preWindowExpiration = await app.inject({
      method: 'POST',
      url: generateUrl,
      headers: { cookie },
      payload: { expiresAt: '2035-01-01T09:59:59Z' },
    });
    expect(preWindowExpiration.statusCode).toBe(400);
    expect(preWindowExpiration.json().code).toBe('INVALID_TOKEN_EXPIRATION');

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

    await prisma.registrationRecord.update({
      where: { id: registration.id },
      data: { eligible: false },
    });
    const ineligibleDelivery = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/activation-tokens/' + first.id + '/delivered',
      headers: { cookie },
      payload: { deliveryMethod: 'PRINT' },
    });
    expect(ineligibleDelivery.statusCode).toBe(409);
    expect(ineligibleDelivery.json().code).toBe('REGISTRATION_NOT_ELIGIBLE');
    await prisma.registrationRecord.update({
      where: { id: registration.id },
      data: { eligible: true },
    });

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
    const expiredReplacementResponse = await app.inject({
      method: 'POST',
      url: generateUrl,
      headers: { cookie },
      payload: {},
    });
    expect(expiredReplacementResponse.statusCode).toBe(201);
    expect(
      expiredReplacementResponse.json().activationToken.rawToken,
    ).toHaveLength(43);
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { id: expired.id },
      }),
    ).toMatchObject({
      status: ActivationTokenStatus.EXPIRED,
      revokedAt: null,
      revocationReason: null,
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

  it('issues one independently verifiable credential per activation token', async () => {
    const keys = await app.inject({ url: '/api/v1/public/issuer-keys' });
    expect(keys.statusCode).toBe(200);
    expect(keys.json().keys[0]).toMatchObject({
      keyVersion: config.ISSUER_KEY_VERSION,
      algorithm: 'RSAPBSSA-SHA384-PSS-Randomized',
      protocol: 'draft-amjad-cfrg-partially-blind-rsa-02',
      modulusLength: 2048,
      issuer: config.ISSUER_ID,
      publicKey: expect.objectContaining({ kty: 'RSA', alg: 'PS384' }),
    });

    const fixture = await openActivation('CRED-API-1');
    const publicKey = voterPublicKey();
    const first = await redeemBlindActivation(app, fixture.rawToken, publicKey);
    expect(first.issued.statusCode).toBe(201);
    expect(first.verified).toBe(true);
    const credential = first.issued.json().credential as {
      publicMetadata: PublicMetadata;
      blindedSignature: string;
    };
    expect(credential.publicMetadata).toMatchObject({
      schemaVersion: 2,
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      scopeId: fixture.scope.id,
      weight: '2.5000',
      credentialVersion: 1,
      issuer: config.ISSUER_ID,
      keyVersion: config.ISSUER_KEY_VERSION,
    });
    expect(JSON.stringify(first.issued.json())).not.toContain(publicKey);
    expect(JSON.stringify(first.issued.json())).not.toContain(
      first.commitment.credentialId,
    );
    expect(JSON.stringify(first.issued.json())).not.toContain(
      testIssuerPrivateKey,
    );
    expect(JSON.stringify(first.issued.json())).not.toContain(fixture.rawToken);
    const stored = await prisma.issuedCredential.findUniqueOrThrow({
      where: { activationTokenId: fixture.token.id },
    });
    expect(stored.blindedMessageHash).toBe(
      hashBlindedMessage(first.blindedMsg),
    );
    expect(JSON.stringify(stored)).not.toContain(publicKey);
    expect(JSON.stringify(stored)).not.toContain(first.commitment.credentialId);
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { id: fixture.token.id },
      }),
    ).toMatchObject({ status: ActivationTokenStatus.REDEEMED });

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.30',
      payload: {
        activationToken: fixture.rawToken,
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        blindedMessage: bytesToBase64url(first.blindedMsg),
        publicMetadata: credential.publicMetadata,
        clientNonce: generateClientNonce(),
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().credential.blindedSignature).toBe(
      credential.blindedSignature,
    );
    expect(
      await prisma.issuedCredential.count({
        where: { activationTokenId: fixture.token.id },
      }),
    ).toBe(1);

    const otherBlind = await redeemBlindActivation(
      app,
      fixture.rawToken,
      voterPublicKey(),
      '127.0.0.31',
    );
    expect(otherBlind.issued.statusCode).toBe(409);
    expect(otherBlind.issued.json().code).toBe(
      'ACTIVATION_TOKEN_ALREADY_REDEEMED',
    );

    const secondSecret = generateActivationToken();
    await prisma.activationToken.create({
      data: {
        registrationRecordId: fixture.registration.id,
        votingScopeId: fixture.scope.id,
        tokenHash: secondSecret.tokenHash,
        tokenPrefixForSupport: secondSecret.tokenPrefixForSupport,
        generatedBy: (
          await prisma.adminUser.findUniqueOrThrow({
            where: { email: 'admin@example.com' },
          })
        ).id,
        expiresAt: fixture.token.expiresAt,
      },
    });
    const secondIssuance = await redeemBlindActivation(
      app,
      secondSecret.rawToken,
      voterPublicKey(),
      '127.0.0.31',
    );
    expect(secondIssuance.issued.statusCode).toBe(409);
    expect(secondIssuance.issued.json().code).toBe('CREDENTIAL_ALREADY_ISSUED');
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { tokenHash: secondSecret.tokenHash },
      }),
    ).toMatchObject({ status: ActivationTokenStatus.ACTIVE });

    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.32',
      payload: dummyActivatePayload(generateActivationToken().rawToken),
    });
    expect(missing.statusCode).toBe(404);

    const invalidBlind = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.33',
      payload: {
        ...dummyActivatePayload(fixture.rawToken),
        blindedMessage: 'not-a-blinded-message',
      },
    });
    expect(invalidBlind.statusCode).toBe(400);
    expect(invalidBlind.json().code).toBe('INVALID_BLINDED_MESSAGE');

    const revokedFixture = await openActivation('CRED-API-REVOKED');
    await prisma.activationToken.update({
      where: { id: revokedFixture.token.id },
      data: {
        status: ActivationTokenStatus.REVOKED,
        revokedAt: new Date(),
        revocationReason: 'Lost QR',
      },
    });
    const revoked = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.34',
      payload: dummyActivatePayload(revokedFixture.rawToken),
    });
    expect(revoked.statusCode).toBe(409);
    expect(revoked.json().code).toBe('ACTIVATION_TOKEN_REVOKED');

    const expiredFixture = await openActivation('CRED-API-EXPIRED');
    await prisma.activationToken.update({
      where: { id: expiredFixture.token.id },
      data: {
        generatedAt: new Date(Date.now() - 2_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const expired = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.35',
      payload: dummyActivatePayload(expiredFixture.rawToken),
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json().code).toBe('ACTIVATION_TOKEN_EXPIRED');

    const ineligibleFixture = await openActivation('CRED-API-INELIGIBLE');
    await prisma.registrationRecord.update({
      where: { id: ineligibleFixture.registration.id },
      data: { eligible: false },
    });
    const ineligible = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.36',
      payload: dummyActivatePayload(ineligibleFixture.rawToken),
    });
    expect(ineligible.statusCode).toBe(409);
    expect(ineligible.json().code).toBe('REGISTRATION_NOT_ELIGIBLE');

    const closedFixture = await openActivation('CRED-API-CLOSED');
    await prisma.votingScope.update({
      where: { id: closedFixture.scope.id },
      data: { status: 'CLOSED' },
    });
    const closed = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.37',
      payload: dummyActivatePayload(closedFixture.rawToken),
    });
    expect(closed.statusCode).toBe(409);
    expect(closed.json().code).toBe('ACTIVATION_SCOPE_NOT_OPEN');

    const mismatchFixture = await openActivation('CRED-API-KEY');
    await prisma.votingScope.update({
      where: { id: mismatchFixture.scope.id },
      data: { issuerKeyVersion: 'other-version' },
    });
    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/v1/public/activate',
      remoteAddress: '127.0.0.38',
      payload: dummyActivatePayload(mismatchFixture.rawToken),
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().code).toBe('ISSUER_KEY_MISMATCH');

    const audits = await prisma.auditEvent.findMany({
      where: {
        eventType: { in: ['CREDENTIAL_ISSUED', 'ACTIVATION_TOKEN_REDEEMED'] },
      },
    });
    expect(audits.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'CREDENTIAL_ISSUED',
        'ACTIVATION_TOKEN_REDEEMED',
      ]),
    );
    expect(JSON.stringify(audits)).not.toContain(fixture.rawToken);
    expect(JSON.stringify(audits)).not.toContain(testIssuerPrivateKey);
    expect(JSON.stringify(audits)).not.toContain(publicKey);

    for (let attempt = 0; attempt < 10; attempt += 1)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/public/activate',
            remoteAddress: '127.0.0.39',
            payload: dummyActivatePayload(generateActivationToken().rawToken),
          })
        ).statusCode,
      ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/public/activate',
          remoteAddress: '127.0.0.39',
          payload: dummyActivatePayload(generateActivationToken().rawToken),
        })
      ).statusCode,
    ).toBe(429);
  });

  it('enforces issued credential storage invariants', async () => {
    const fixture = await openActivation('CRED-DB-1');
    const now = new Date();
    const first = await prisma.issuedCredential.create({
      data: {
        registrationRecordId: fixture.registration.id,
        votingScopeId: fixture.scope.id,
        activationTokenId: fixture.token.id,
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        publicMetadata: '{}',
        blindedMessageHash: 'a'.repeat(64),
        blindedSignature: 'b'.repeat(342),
        weight: new Prisma.Decimal('2.5000'),
        issuedAt: now,
        expiresAt: fixture.scope.credentialExpiresAt,
        issuerKeyVersion: config.ISSUER_KEY_VERSION,
      },
    });
    const secondToken = generateActivationToken();
    const otherToken = await prisma.activationToken.create({
      data: {
        registrationRecordId: fixture.registration.id,
        votingScopeId: fixture.scope.id,
        tokenHash: secondToken.tokenHash,
        tokenPrefixForSupport: secondToken.tokenPrefixForSupport,
        generatedBy: (
          await prisma.adminUser.findUniqueOrThrow({
            where: { email: 'admin@example.com' },
          })
        ).id,
        expiresAt: fixture.token.expiresAt,
        generatedAt: new Date(Date.now() - 1_000),
        status: ActivationTokenStatus.REVOKED,
        revokedAt: now,
        revocationReason: 'Replaced for invariant test',
      },
    });
    await expect(
      prisma.issuedCredential.create({
        data: {
          registrationRecordId: fixture.registration.id,
          votingScopeId: fixture.scope.id,
          activationTokenId: otherToken.id,
          protocol: BLIND_CREDENTIAL_PROTOCOL,
          publicMetadata: '{}',
          blindedMessageHash: 'c'.repeat(64),
          blindedSignature: 'd'.repeat(342),
          weight: new Prisma.Decimal('1.0000'),
          issuedAt: now,
          expiresAt: fixture.scope.credentialExpiresAt,
          issuerKeyVersion: config.ISSUER_KEY_VERSION,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.issuedCredential.create({
        data: {
          registrationRecordId: fixture.registration.id,
          votingScopeId: fixture.scope.id,
          activationTokenId: otherToken.id,
          protocol: BLIND_CREDENTIAL_PROTOCOL,
          publicMetadata: '{}',
          blindedMessageHash: 'not-hex',
          blindedSignature: 'e'.repeat(342),
          weight: new Prisma.Decimal('1.0000'),
          issuedAt: now,
          expiresAt: now,
          issuerKeyVersion: config.ISSUER_KEY_VERSION,
        },
      }),
    ).rejects.toThrow();
    expect(first.blindedMessageHash).toHaveLength(64);
  });

  it('revokes and reissues credentials without exposing voter identity', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      remoteAddress: '127.0.0.40',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const cookie = (
      Array.isArray(login.headers['set-cookie'])
        ? login.headers['set-cookie'][0]!
        : login.headers['set-cookie']!
    ).split(';')[0]!;
    const auditorLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      remoteAddress: '127.0.0.41',
      payload: { email: 'auditor@example.com', password: 'auditor-password' },
    });
    const auditorCookie = (
      Array.isArray(auditorLogin.headers['set-cookie'])
        ? auditorLogin.headers['set-cookie'][0]!
        : auditorLogin.headers['set-cookie']!
    ).split(';')[0]!;

    const fixture = await openActivation('CRED-REV-1');
    const publicKey = voterPublicKey();
    const issued = await redeemBlindActivation(
      app,
      fixture.rawToken,
      publicKey,
      '127.0.0.42',
    );
    expect(issued.issued.statusCode).toBe(201);
    expect(issued.verified).toBe(true);
    const stored = await prisma.issuedCredential.findUniqueOrThrow({
      where: { activationTokenId: fixture.token.id },
    });

    const byId = await app.inject({
      url: '/api/v1/public/issuance-status/' + stored.id,
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json()).toMatchObject({
      issuanceId: stored.id,
      status: 'ACTIVE',
      credentialVersion: 1,
      replaced: false,
      revokedAt: null,
    });
    expect(JSON.stringify(byId.json())).not.toContain(fixture.registration.id);
    expect(JSON.stringify(byId.json())).not.toContain('Credential owner');
    expect(JSON.stringify(byId.json())).not.toContain(publicKey);
    expect(JSON.stringify(stored)).not.toContain(
      issued.commitment.credentialId,
    );

    const emptyList = await app.inject({
      url: '/api/v1/public/scopes/' + fixture.scope.id + '/revocations',
    });
    expect(emptyList.statusCode).toBe(200);
    expect(emptyList.json().payload.revoked).toEqual([]);
    const issuer = await createIssuer(config);
    expect(
      await verifyCanonical(
        canonicalizeRevocationList(
          emptyList.json().payload as RevocationListPayload,
        ),
        emptyList.json().signature,
        issuer.publicKey,
      ),
    ).toBe(true);

    const auditorRevoke = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials/' + stored.id + '/revoke',
      remoteAddress: '127.0.0.41',
      headers: { cookie: auditorCookie },
      payload: { reason: 'Auditor must not revoke' },
    });
    expect(auditorRevoke.statusCode).toBe(403);

    const leftover = generateActivationToken();
    await prisma.activationToken.create({
      data: {
        registrationRecordId: fixture.registration.id,
        votingScopeId: fixture.scope.id,
        tokenHash: leftover.tokenHash,
        tokenPrefixForSupport: leftover.tokenPrefixForSupport,
        generatedBy: (
          await prisma.adminUser.findUniqueOrThrow({
            where: { email: 'admin@example.com' },
          })
        ).id,
        expiresAt: fixture.token.expiresAt,
      },
    });

    const revoked = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials/' + stored.id + '/revoke',
      remoteAddress: '127.0.0.40',
      headers: { cookie },
      payload: { reason: 'Lost device' },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().credential).toMatchObject({
      id: stored.id,
      status: 'REVOKED',
      revocationReason: 'Lost device',
    });
    expect(
      await prisma.activationToken.findUniqueOrThrow({
        where: { tokenHash: leftover.tokenHash },
      }),
    ).toMatchObject({ status: ActivationTokenStatus.REVOKED });

    const afterRevoke = await app.inject({
      url: '/api/v1/public/issuance-status/' + stored.id,
    });
    expect(afterRevoke.json()).toMatchObject({
      status: 'REVOKED',
      replaced: false,
    });
    const list = await app.inject({
      url: '/api/v1/public/scopes/' + fixture.scope.id + '/revocations',
    });
    expect(list.json().payload.revoked).toEqual([
      expect.objectContaining({
        issuanceId: stored.id,
        credentialVersion: 1,
      }),
    ]);
    expect(JSON.stringify(list.json())).not.toContain('Lost device');
    expect(JSON.stringify(list.json())).not.toContain(fixture.registration.id);

    const listed = await app.inject({
      url: '/api/v1/admin/registrations/' + fixture.registration.id,
      headers: { cookie },
    });
    expect(listed.json().record.issuedCredentials[0]).toMatchObject({
      id: stored.id,
      status: 'REVOKED',
      credentialVersion: 1,
    });
    expect(listed.json().record.issuedCredentials[0].publicKey).toBeUndefined();

    const reissued = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials/' + stored.id + '/reissue',
      remoteAddress: '127.0.0.40',
      headers: { cookie },
      payload: { reason: 'Replacement after loss', deliveryMethod: 'PRINT' },
    });
    expect(reissued.statusCode).toBe(201);
    const replacementToken = reissued.json().activationToken.rawToken as string;
    expect(replacementToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(reissued.json().credential)).not.toContain(
      replacementToken,
    );

    const replacement = await redeemBlindActivation(
      app,
      replacementToken,
      voterPublicKey(),
      '127.0.0.43',
    );
    expect(replacement.issued.statusCode).toBe(201);
    expect(replacement.verified).toBe(true);
    expect(
      (
        replacement.issued.json().credential as {
          publicMetadata: PublicMetadata;
        }
      ).publicMetadata.credentialVersion,
    ).toBe(2);

    const oldAfterReplace = await app.inject({
      url: '/api/v1/public/issuance-status/' + stored.id,
    });
    expect(oldAfterReplace.json()).toMatchObject({
      status: 'REVOKED',
      replaced: true,
    });
    const linked = await prisma.issuedCredential.findUniqueOrThrow({
      where: { id: stored.id },
    });
    const newest = await prisma.issuedCredential.findFirstOrThrow({
      where: {
        registrationRecordId: fixture.registration.id,
        votingScopeId: fixture.scope.id,
        credentialVersion: 2,
      },
    });
    expect(linked.replacedByCredentialId).toBe(newest.id);

    const alreadyReplaced = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials/' + stored.id + '/reissue',
      remoteAddress: '127.0.0.40',
      headers: { cookie },
      payload: { reason: 'Should not replace twice' },
    });
    expect(alreadyReplaced.statusCode).toBe(409);
    expect(alreadyReplaced.json().code).toBe('CREDENTIAL_ALREADY_REPLACED');

    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/credentials/00000000-0000-4000-8000-000000000001/revoke',
      remoteAddress: '127.0.0.40',
      headers: { cookie },
      payload: { reason: 'Does not exist' },
    });
    expect(missing.statusCode).toBe(404);

    const audits = await prisma.auditEvent.findMany({
      where: {
        eventType: { in: ['CREDENTIAL_REVOKED', 'CREDENTIAL_REISSUED'] },
        targetId: stored.id,
      },
    });
    expect(audits.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['CREDENTIAL_REVOKED', 'CREDENTIAL_REISSUED']),
    );
    expect(JSON.stringify(audits)).not.toContain(replacementToken);
    expect(JSON.stringify(audits)).not.toContain(publicKey);
  });

  it('changes password and requires enrolled TOTP at login', async () => {
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
    });
    const adminCookie = (
      Array.isArray(adminLogin.headers['set-cookie'])
        ? adminLogin.headers['set-cookie'][0]!
        : adminLogin.headers['set-cookie']!
    ).split(';')[0]!;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { cookie: adminCookie },
      payload: {
        email: 'security@example.com',
        password: 'initial-password',
        role: 'REGISTRATION_OPERATOR',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().user.totpEnabled).toBe(false);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'security@example.com', password: 'initial-password' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = (
      Array.isArray(login.headers['set-cookie'])
        ? login.headers['set-cookie'][0]!
        : login.headers['set-cookie']!
    ).split(';')[0]!;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/auth/password',
          headers: { cookie },
          payload: {
            currentPassword: 'wrong-password',
            newPassword: 'changed-password',
          },
        })
      ).statusCode,
    ).toBe(401);
    const changed = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/password',
      headers: { cookie },
      payload: {
        currentPassword: 'initial-password',
        newPassword: 'changed-password',
      },
    });
    expect(changed.statusCode).toBe(200);
    const relogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        email: 'security@example.com',
        password: 'changed-password',
      },
    });
    expect(relogin.statusCode).toBe(200);
    const nextCookie = (
      Array.isArray(relogin.headers['set-cookie'])
        ? relogin.headers['set-cookie'][0]!
        : relogin.headers['set-cookie']!
    ).split(';')[0]!;
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/totp/setup',
      headers: { cookie: nextCookie },
    });
    expect(setup.statusCode).toBe(200);
    const secret = setup.json().secret as string;
    expect(setup.json().otpauthUrl).toContain('otpauth://totp/');
    expect(
      JSON.stringify(await prisma.auditEvent.findMany({ take: 20 })),
    ).not.toContain(secret);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/auth/totp/confirm',
          headers: { cookie: nextCookie },
          payload: { totp: '000000' },
        })
      ).json().code,
    ).toBe('TOTP_INVALID');
    const enabled = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/totp/confirm',
      headers: { cookie: nextCookie },
      payload: { totp: generateTotpCode(secret) },
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json().user.totpEnabled).toBe(true);
    expect(enabled.json()).not.toHaveProperty('secret');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/auth/login',
          payload: {
            email: 'security@example.com',
            password: 'changed-password',
          },
        })
      ).json().code,
    ).toBe('TOTP_REQUIRED');
    const totpLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        email: 'security@example.com',
        password: 'changed-password',
        totp: generateTotpCode(secret),
      },
    });
    expect(totpLogin.statusCode).toBe(200);
    const totpCookie = (
      Array.isArray(totpLogin.headers['set-cookie'])
        ? totpLogin.headers['set-cookie'][0]!
        : totpLogin.headers['set-cookie']!
    ).split(';')[0]!;
    const disabled = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/totp/disable',
      headers: { cookie: totpCookie },
      payload: {
        password: 'changed-password',
        totp: generateTotpCode(secret),
      },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().user.totpEnabled).toBe(false);
  });

  it('edits a scope, rolls a closed scope back, and filters registrations', async () => {
    const headersFor = (cookie?: string) => ({
      remoteAddress: '127.0.0.50',
      ...(cookie ? { headers: { cookie } } : {}),
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-password' },
      ...headersFor(),
    });
    expect(login.statusCode).toBe(200);
    const cookie = (
      Array.isArray(login.headers['set-cookie'])
        ? login.headers['set-cookie'][0]!
        : login.headers['set-cookie']!
    ).split(';')[0]!;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scopes',
      headers: { cookie },
      payload: {
        name: 'Rollback scope',
        description: 'Initial',
        activationStartsAt: '2031-01-01T10:00:00Z',
        activationEndsAt: '2031-01-01T14:00:00Z',
        startsAt: '2031-01-01T12:00:00Z',
        endsAt: '2031-01-01T18:00:00Z',
        credentialExpiresAt: '2031-01-02T00:00:00Z',
        votingWeightsEnabled: false,
        issuerKeyVersion: '2031-01',
      },
    });
    expect(created.statusCode).toBe(201);
    const scope = created.json().scope;
    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/scopes/${scope.id}`,
      headers: { cookie },
      payload: { description: 'Updated description', version: scope.version },
    });
    expect(edited.statusCode).toBe(200);
    await prisma.votingScope.update({
      where: { id: scope.id },
      data: { status: 'CLOSED', version: { increment: 1 } },
    });
    const closed = await prisma.votingScope.findUniqueOrThrow({
      where: { id: scope.id },
    });
    const rolled = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/scopes/${scope.id}/rollback`,
      headers: { cookie },
      payload: { version: closed.version, reason: 'Resume voting window' },
    });
    expect(rolled.statusCode).toBe(200);
    expect(rolled.json().scope.status).toBe('VOTING_ACTIVE');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/scopes/${scope.id}/rollback`,
          headers: { cookie },
          payload: {
            version: rolled.json().scope.version,
            reason: 'Already voting',
          },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/registrations?status=ACTIVE&eligible=true&hasActiveToken=false',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
    const history = await app.inject({
      url: `/api/v1/admin/audit-events?targetType=VotingScope&targetId=${scope.id}`,
      headers: { cookie },
    });
    expect(
      history
        .json()
        .events.map((event: { eventType: string }) => event.eventType),
    ).toEqual(
      expect.arrayContaining([
        'VOTING_SCOPE_CREATED',
        'VOTING_SCOPE_UPDATED',
        'VOTING_SCOPE_ROLLED_BACK',
      ]),
    );
  });

  it('exposes public scope status without personal data', async () => {
    const now = Date.now();
    const open = await prisma.votingScope.create({
      data: {
        name: 'Public status open',
        status: 'ACTIVATION_OPEN',
        startsAt: new Date(now + 3_600_000),
        endsAt: new Date(now + 7_200_000),
        activationStartsAt: new Date(now - 3_600_000),
        activationEndsAt: new Date(now + 5_400_000),
        credentialExpiresAt: new Date(now + 86_400_000),
        issuerKeyVersion: config.ISSUER_KEY_VERSION,
      },
    });
    const draft = await prisma.votingScope.create({
      data: {
        name: 'Public status draft',
        status: 'DRAFT',
        startsAt: new Date(now + 3_600_000),
        endsAt: new Date(now + 7_200_000),
        activationStartsAt: new Date(now - 3_600_000),
        activationEndsAt: new Date(now + 5_400_000),
        credentialExpiresAt: new Date(now + 86_400_000),
        issuerKeyVersion: config.ISSUER_KEY_VERSION,
      },
    });
    const openStatus = await app.inject({
      url: `/api/v1/public/scopes/${open.id}/status`,
    });
    expect(openStatus.statusCode).toBe(200);
    const body = openStatus.json() as Record<string, unknown>;
    expect(body).toEqual({
      scopeId: open.id,
      status: 'ACTIVATION_OPEN',
      activationStartsAt: open.activationStartsAt.toISOString(),
      activationEndsAt: open.activationEndsAt.toISOString(),
      startsAt: open.startsAt.toISOString(),
      endsAt: open.endsAt.toISOString(),
      credentialExpiresAt: open.credentialExpiresAt.toISOString(),
      acceptsActivation: true,
      issuerKeyVersion: config.ISSUER_KEY_VERSION,
    });
    expect(JSON.stringify(body)).not.toMatch(/owner|unit|email|token/i);
    const draftStatus = await app.inject({
      url: `/api/v1/public/scopes/${draft.id}/status`,
    });
    expect(draftStatus.statusCode).toBe(200);
    expect(draftStatus.json().acceptsActivation).toBe(false);
    expect(
      (
        await app.inject({
          url: '/api/v1/public/scopes/11111111-1111-4111-8111-111111111111/status',
        })
      ).statusCode,
    ).toBe(404);
  });

  it('stores SQL-like registration fields without executing them', async () => {
    const administrator = await prisma.adminUser.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    const rawToken = randomBytes(32).toString('base64url');
    await prisma.adminSession.create({
      data: {
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        adminId: administrator.id,
        expiresAt: new Date(Date.now() + 8 * 60 * 60_000),
      },
    });
    const cookie = `registration_session=${rawToken}`;
    const unitNumber = 'A-101\'; DROP TABLE "RegistrationRecord"; --';
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/registrations',
      headers: { cookie },
      payload: {
        unitNumber,
        ownerName: 'Owner\'; DROP TABLE "AdminUser"; --',
        email: 'sql-like@example.com',
        votingWeight: '1.0000',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().record.unitNumber).toBe(unitNumber.toUpperCase());
    expect(await prisma.registrationRecord.count()).toBeGreaterThan(0);
    expect(await prisma.adminUser.count()).toBeGreaterThan(0);
    const listed = await app.inject({
      url:
        '/api/v1/admin/registrations?search=' +
        encodeURIComponent(unitNumber.slice(0, 5)),
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(
      listed
        .json()
        .records.some(
          (record: { unitNumber: string }) =>
            record.unitNumber === unitNumber.toUpperCase(),
        ),
    ).toBe(true);
  });
});
