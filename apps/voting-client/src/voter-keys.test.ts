import { expect, it } from 'vitest';
import { base64urlToBytes } from './base64url';
import { generateVoterKeyPair } from './voter-keys';

it('generates a 32-byte Ed25519 public key and keeps the private key non-extractable', async () => {
  const pair = await generateVoterKeyPair();
  expect(pair.publicKeyAlgorithm).toBe('Ed25519');
  expect(base64urlToBytes(pair.publicKey)?.length).toBe(32);
  expect(pair.privateKey.extractable).toBe(false);
  expect(pair.privateKey.type).toBe('private');
  await expect(
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ).rejects.toThrow();
});
