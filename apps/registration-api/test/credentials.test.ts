import { generateKeyPairSync } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeCredentialPayload,
  canonicalizeRevocationList,
  fingerprintPublicKey,
  formatVotingWeight,
  generateClientNonce,
  isValidClientNonce,
  parseEd25519PublicKey,
  publicCredentialStatus,
  type CredentialPayload,
} from '../src/credentials.js';
import {
  createIssuer,
  generateIssuerKeyMaterial,
  signCanonical,
  verifyCanonical,
} from '../src/issuer-keys.js';

const payload = (
  overrides: Partial<CredentialPayload> = {},
): CredentialPayload => ({
  schemaVersion: 1,
  credentialId: '11111111-1111-4111-8111-111111111111',
  scopeId: '22222222-2222-4222-8222-222222222222',
  publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  publicKeyAlgorithm: 'Ed25519',
  weight: '1.0000',
  credentialVersion: 1,
  issuedAt: '2026-07-14T18:00:00.000Z',
  expiresAt: '2026-08-31T23:59:59.000Z',
  issuer: 'condominium-registration-service',
  ...overrides,
});

describe('credential cryptography', () => {
  it('canonicalizes payloads with a stable field order', () => {
    const canonical = canonicalizeCredentialPayload(payload());
    expect(canonical).toBe(
      '{"schemaVersion":1,"credentialId":"11111111-1111-4111-8111-111111111111","scopeId":"22222222-2222-4222-8222-222222222222","publicKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","publicKeyAlgorithm":"Ed25519","weight":"1.0000","credentialVersion":1,"issuedAt":"2026-07-14T18:00:00.000Z","expiresAt":"2026-08-31T23:59:59.000Z","issuer":"condominium-registration-service"}',
    );
    expect(canonical).toBe(
      canonicalizeCredentialPayload(
        payload({ issuer: 'condominium-registration-service' }),
      ),
    );
  });

  it('signs canonical payloads so an independent verifier can check them', () => {
    const material = generateIssuerKeyMaterial();
    const issuer = createIssuer({
      ISSUER_PRIVATE_KEY: material.privateKeyPkcs8DerBase64url,
      ISSUER_KEY_VERSION: 'test-2026-01',
      ISSUER_ID: 'condominium-registration-service',
    });
    expect(issuer.publicKeyRawBase64url).toBe(material.publicKeyRawBase64url);
    const canonical = canonicalizeCredentialPayload(payload());
    const signature = signCanonical(canonical, issuer.privateKey);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(
      verifyCanonical(
        canonical,
        signature,
        Buffer.from(issuer.publicKeyRawBase64url, 'base64url'),
      ),
    ).toBe(true);
    expect(
      verifyCanonical(
        canonicalizeCredentialPayload(payload({ weight: '2.0000' })),
        signature,
        Buffer.from(issuer.publicKeyRawBase64url, 'base64url'),
      ),
    ).toBe(false);
    const other = generateIssuerKeyMaterial();
    expect(
      verifyCanonical(
        canonical,
        signature,
        Buffer.from(other.publicKeyRawBase64url, 'base64url'),
      ),
    ).toBe(false);
    expect(JSON.stringify({ canonical, signature })).not.toContain(
      material.privateKeyPkcs8DerBase64url,
    );
  });

  it('accepts canonical 32-byte Ed25519 public keys and rejects other encodings', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const raw = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }))
      .subarray(-32)
      .toString('base64url');
    const parsed = parseEd25519PublicKey(raw);
    expect(parsed).toHaveLength(32);
    expect(parsed?.toString('base64url')).toBe(raw);
    expect(fingerprintPublicKey(parsed!)).toMatch(/^[0-9a-f]{64}$/);
    expect(parseEd25519PublicKey('not-a-key')).toBeNull();
    expect(parseEd25519PublicKey(raw.slice(0, 42) + '+')).toBeNull();
  });

  it('formats weights without floating-point storage and validates nonces', () => {
    expect(formatVotingWeight(new Prisma.Decimal('2.5'))).toBe('2.5000');
    expect(isValidClientNonce(generateClientNonce())).toBe(true);
    expect(isValidClientNonce('short')).toBe(false);
  });

  it('canonicalizes revocation lists and maps public credential status', () => {
    const canonical = canonicalizeRevocationList({
      schemaVersion: 1,
      scopeId: '22222222-2222-4222-8222-222222222222',
      generatedAt: '2026-07-14T18:00:00.000Z',
      issuer: 'condominium-registration-service',
      revoked: [
        {
          credentialId: '11111111-1111-4111-8111-111111111111',
          credentialVersion: 1,
          revokedAt: '2026-07-15T12:00:00.000Z',
        },
      ],
    });
    expect(canonical).toBe(
      '{"schemaVersion":1,"scopeId":"22222222-2222-4222-8222-222222222222","generatedAt":"2026-07-14T18:00:00.000Z","issuer":"condominium-registration-service","revoked":[{"credentialId":"11111111-1111-4111-8111-111111111111","credentialVersion":1,"revokedAt":"2026-07-15T12:00:00.000Z"}]}',
    );
    const now = new Date('2026-07-16T00:00:00.000Z');
    expect(
      publicCredentialStatus(
        {
          credentialId: '11111111-1111-4111-8111-111111111111',
          credentialVersion: 1,
          status: 'ACTIVE',
          expiresAt: new Date('2026-08-31T23:59:59.000Z'),
          revokedAt: null,
          replacedByCredentialId: null,
        },
        now,
      ),
    ).toMatchObject({ status: 'ACTIVE', replaced: false, revokedAt: null });
    expect(
      publicCredentialStatus(
        {
          credentialId: '11111111-1111-4111-8111-111111111111',
          credentialVersion: 1,
          status: 'REVOKED',
          expiresAt: new Date('2026-08-31T23:59:59.000Z'),
          revokedAt: new Date('2026-07-15T12:00:00.000Z'),
          replacedByCredentialId: '33333333-3333-4333-8333-333333333333',
        },
        now,
      ),
    ).toMatchObject({ status: 'REVOKED', replaced: true });
    expect(
      publicCredentialStatus(
        {
          credentialId: '11111111-1111-4111-8111-111111111111',
          credentialVersion: 1,
          status: 'ACTIVE',
          expiresAt: new Date('2026-07-15T00:00:00.000Z'),
          revokedAt: null,
          replacedByCredentialId: null,
        },
        now,
      ).status,
    ).toBe('EXPIRED');
  });
});
