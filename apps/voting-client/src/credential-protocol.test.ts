import { expect, it } from 'vitest';
import {
  canonicalizeCredentialCommitment,
  canonicalizePublicMetadata,
  generateClientNonce,
} from './credential-protocol';
import { base64urlToBytes } from './base64url';

it('canonicalizes public metadata and hidden commitments', () => {
  expect(
    canonicalizePublicMetadata({
      schemaVersion: 2,
      protocol: 'RSAPBSSA-SHA384-PSS-Randomized',
      scopeId: '22222222-2222-4222-8222-222222222222',
      weight: '1.0000',
      credentialVersion: 1,
      expiresAt: '2026-08-31T23:59:59.000Z',
      issuer: 'condominium-registration-service',
      keyVersion: 'test-2026-01',
    }),
  ).toBe(
    '{"schemaVersion":2,"protocol":"RSAPBSSA-SHA384-PSS-Randomized","scopeId":"22222222-2222-4222-8222-222222222222","weight":"1.0000","credentialVersion":1,"expiresAt":"2026-08-31T23:59:59.000Z","issuer":"condominium-registration-service","keyVersion":"test-2026-01"}',
  );
  expect(
    canonicalizeCredentialCommitment({
      credentialId: '11111111-1111-4111-8111-111111111111',
      publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      publicKeyAlgorithm: 'Ed25519',
    }),
  ).toBe(
    '{"credentialId":"11111111-1111-4111-8111-111111111111","publicKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","publicKeyAlgorithm":"Ed25519"}',
  );
});

it('creates a 16-byte canonical client nonce', () => {
  const nonce = generateClientNonce();
  expect(base64urlToBytes(nonce)?.length).toBe(16);
});
