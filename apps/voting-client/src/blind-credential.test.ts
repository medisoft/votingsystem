import { generatePrimeSync } from 'node:crypto';
import { RSAPBSSA } from '@cloudflare/blindrsa-ts';
import { expect, it } from 'vitest';
import { blindCommitment, unblindAndVerify } from './blind-credential';
import {
  BLIND_CREDENTIAL_PROTOCOL,
  canonicalizePublicMetadata,
} from './credential-protocol';

it('blinds, unblinds, and verifies against a library-issued signature', async () => {
  const suite = RSAPBSSA.SHA384.PSS.Randomized();
  const keys = await suite.generateKey(
    {
      publicExponent: Uint8Array.from([1, 0, 1]),
      modulusLength: 2048,
    },
    (length: number) => generatePrimeSync(length, { safe: true, bigint: true }),
  );
  const metadata = {
    schemaVersion: 2,
    protocol: BLIND_CREDENTIAL_PROTOCOL,
    scopeId: '22222222-2222-4222-8222-222222222222',
    weight: '1.0000',
    credentialVersion: 1,
    expiresAt: '2026-08-31T23:59:59.000Z',
    issuer: 'condominium-registration-service',
    keyVersion: 'test-2026-01',
  };
  const blinded = await blindCommitment(
    keys.publicKey,
    {
      credentialId: '11111111-1111-4111-8111-111111111111',
      publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      publicKeyAlgorithm: 'Ed25519',
    },
    metadata,
  );
  const info = new TextEncoder().encode(canonicalizePublicMetadata(metadata));
  const blindedSignature = await suite.blindSign(
    keys.privateKey,
    blinded.blindedMsg,
    info,
  );
  const signature = await unblindAndVerify(
    keys.publicKey,
    blinded.preparedMsg,
    metadata,
    blindedSignature,
    blinded.inv,
  );
  expect(signature.length).toBe(256);
}, 120_000);
