import { generateKeyPairSync } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  blindCommitment,
  blindSignCommitment,
  bytesToBase64url,
  hashBlindedMessage,
  parseFixedBytes,
  unblindSignature,
  verifyBlindCredential,
} from '../src/blind-rsa.js';
import {
  BLIND_CREDENTIAL_PROTOCOL,
  canonicalizeCredentialCommitment,
  canonicalizePublicMetadata,
  canonicalizeRevocationList,
  formatVotingWeight,
  generateClientNonce,
  isValidClientNonce,
  parseEd25519PublicKey,
  publicCredentialStatus,
  type CredentialCommitment,
  type PublicMetadata,
} from '../src/credentials.js';
import {
  createIssuer,
  signCanonical,
  verifyCanonical,
} from '../src/issuer-keys.js';
import { testConfig } from './test-config.js';

const metadata = (overrides: Partial<PublicMetadata> = {}): PublicMetadata => ({
  schemaVersion: 2,
  protocol: BLIND_CREDENTIAL_PROTOCOL,
  scopeId: '22222222-2222-4222-8222-222222222222',
  weight: '1.0000',
  credentialVersion: 1,
  expiresAt: '2026-08-31T23:59:59.000Z',
  issuer: 'condominium-registration-service',
  keyVersion: 'test-2026-01',
  ...overrides,
});

const commitment = (
  overrides: Partial<CredentialCommitment> = {},
): CredentialCommitment => ({
  credentialId: '11111111-1111-4111-8111-111111111111',
  publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  publicKeyAlgorithm: 'Ed25519',
  ...overrides,
});

describe('blind credential cryptography', () => {
  it('canonicalizes public metadata and hidden commitments', () => {
    expect(canonicalizePublicMetadata(metadata())).toBe(
      '{"schemaVersion":2,"protocol":"RSAPBSSA-SHA384-PSS-Randomized","scopeId":"22222222-2222-4222-8222-222222222222","weight":"1.0000","credentialVersion":1,"expiresAt":"2026-08-31T23:59:59.000Z","issuer":"condominium-registration-service","keyVersion":"test-2026-01"}',
    );
    expect(canonicalizeCredentialCommitment(commitment())).toBe(
      '{"credentialId":"11111111-1111-4111-8111-111111111111","publicKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","publicKeyAlgorithm":"Ed25519"}',
    );
  });

  it('blinds, signs, unblinds, and verifies against the issuer public key', async () => {
    const issuer = await createIssuer(testConfig());
    const { publicKey } = generateKeyPairSync('ed25519');
    const voterKey = Buffer.from(
      publicKey.export({ type: 'spki', format: 'der' }),
    )
      .subarray(-32)
      .toString('base64url');
    const hidden = commitment({ publicKey: voterKey });
    const publicInfo = metadata();
    const blinded = await blindCommitment(issuer.publicKey, hidden, publicInfo);
    expect(blinded.blindedMsg).toHaveLength(256);
    const blindedSignature = await blindSignCommitment(
      issuer.privateKey,
      blinded.blindedMsg,
      publicInfo,
    );
    const signature = await unblindSignature(
      issuer.publicKey,
      blinded.preparedMsg,
      publicInfo,
      blindedSignature,
      blinded.inv,
    );
    expect(
      await verifyBlindCredential(
        issuer.publicKey,
        signature,
        blinded.preparedMsg,
        publicInfo,
      ),
    ).toBe(true);
    expect(
      await verifyBlindCredential(
        issuer.publicKey,
        signature,
        blinded.preparedMsg,
        metadata({ weight: '2.0000' }),
      ),
    ).toBe(false);
    expect(hashBlindedMessage(blinded.blindedMsg)).not.toBe(
      hashBlindedMessage(signature),
    );
    expect(hashBlindedMessage(blinded.blindedMsg)).not.toBe(
      hashBlindedMessage(blinded.preparedMsg),
    );
    expect(bytesToBase64url(blinded.blindedMsg)).not.toContain(voterKey);
    expect(bytesToBase64url(blindedSignature)).not.toContain(voterKey);
    expect(
      parseFixedBytes(bytesToBase64url(blinded.blindedMsg), 256),
    ).toHaveLength(256);
  });

  it('accepts canonical 32-byte Ed25519 public keys and rejects other encodings', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const raw = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }))
      .subarray(-32)
      .toString('base64url');
    const parsed = parseEd25519PublicKey(raw);
    expect(parsed).toHaveLength(32);
    expect(parsed?.toString('base64url')).toBe(raw);
    expect(parseEd25519PublicKey('not-a-key')).toBeNull();
    expect(parseEd25519PublicKey(raw.slice(0, 42) + '+')).toBeNull();
  });

  it('formats weights without floating-point storage and validates nonces', () => {
    expect(formatVotingWeight(new Prisma.Decimal('2.5'))).toBe('2.5000');
    expect(isValidClientNonce(generateClientNonce())).toBe(true);
    expect(isValidClientNonce('short')).toBe(false);
  });

  it('canonicalizes revocation lists of issuance ids and maps public status', async () => {
    const issuer = await createIssuer(testConfig());
    const canonical = canonicalizeRevocationList({
      schemaVersion: 2,
      scopeId: '22222222-2222-4222-8222-222222222222',
      generatedAt: '2026-07-14T18:00:00.000Z',
      issuer: 'condominium-registration-service',
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      revoked: [
        {
          issuanceId: '11111111-1111-4111-8111-111111111111',
          credentialVersion: 1,
          revokedAt: '2026-07-15T12:00:00.000Z',
        },
      ],
    });
    expect(canonical).toBe(
      '{"schemaVersion":2,"scopeId":"22222222-2222-4222-8222-222222222222","generatedAt":"2026-07-14T18:00:00.000Z","issuer":"condominium-registration-service","protocol":"RSAPBSSA-SHA384-PSS-Randomized","revoked":[{"issuanceId":"11111111-1111-4111-8111-111111111111","credentialVersion":1,"revokedAt":"2026-07-15T12:00:00.000Z"}]}',
    );
    const signature = await signCanonical(canonical, issuer.privateKey);
    expect(await verifyCanonical(canonical, signature, issuer.publicKey)).toBe(
      true,
    );
    const now = new Date('2026-07-16T00:00:00.000Z');
    expect(
      publicCredentialStatus(
        {
          id: '11111111-1111-4111-8111-111111111111',
          credentialVersion: 1,
          status: 'ACTIVE',
          expiresAt: new Date('2026-08-31T23:59:59.000Z'),
          revokedAt: null,
          replacedByCredentialId: null,
        },
        now,
      ),
    ).toMatchObject({
      issuanceId: '11111111-1111-4111-8111-111111111111',
      status: 'ACTIVE',
      replaced: false,
      revokedAt: null,
    });
    expect(
      publicCredentialStatus(
        {
          id: '11111111-1111-4111-8111-111111111111',
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
          id: '11111111-1111-4111-8111-111111111111',
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
