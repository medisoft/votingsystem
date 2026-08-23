import { expect, it } from 'vitest';
import { CREDENTIAL_PUBLIC_KEY_ALGORITHM } from './credential-protocol';
import {
  createMemoryVault,
  toCredentialSummary,
  type StoredCredential,
} from './credential-vault';

const sample = (): StoredCredential => ({
  privateKey: {} as CryptoKey,
  publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  credentialId: '11111111-1111-4111-8111-111111111111',
  publicMetadata: {
    schemaVersion: 2,
    protocol: 'RSAPBSSA-SHA384-PSS-Randomized',
    scopeId: '22222222-2222-4222-8222-222222222222',
    weight: '1.0000',
    credentialVersion: 1,
    expiresAt: '2026-08-31T23:59:59.000Z',
    issuer: 'issuer',
    keyVersion: 'v1',
  },
  preparedMessage: 'prepared',
  signature: 'signature',
  storedAt: '2026-08-23T00:00:00.000Z',
});

it('stores and returns a credential in memory', async () => {
  const vault = createMemoryVault();
  expect(await vault.get()).toBeNull();
  const record = sample();
  await vault.put(record);
  expect(await vault.get()).toBe(record);
});

it('omits the private key from the UI summary', () => {
  const summary = toCredentialSummary(sample());
  expect(summary).toEqual({
    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    publicKeyAlgorithm: 'Ed25519',
    expiresAt: '2026-08-31T23:59:59.000Z',
    weight: '1.0000',
    protocol: 'RSAPBSSA-SHA384-PSS-Randomized',
    scopeId: '22222222-2222-4222-8222-222222222222',
  });
});
