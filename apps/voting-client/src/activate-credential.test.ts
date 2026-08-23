import { afterEach, expect, it, vi } from 'vitest';
import {
  ActivationError,
  activationErrorMessageKey,
  redeemActivation,
  resetPendingCredential,
} from './activate-credential';
import { BLIND_CREDENTIAL_PROTOCOL } from './credential-protocol';
import { createMemoryVault } from './credential-vault';
import { ActivationApiError } from './registration-public-api';

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

const voter = {
  privateKey: { type: 'private' } as CryptoKey,
  publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  publicKeyAlgorithm: 'Ed25519' as const,
};

afterEach(() => {
  resetPendingCredential();
});

it('blinds a commitment and stores the unblinded credential without sending the public key', async () => {
  const vault = createMemoryVault();
  const activateCalls: unknown[] = [];
  const stored = await redeemActivation('token-value', {
    vault,
    generateVoterKeyPair: async () => voter,
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    generateClientNonce: () => 'AAAAAAAAAAAAAAAAAAAAAA',
    getIssuerKeys: async () => ({
      keyVersion: 'test-2026-01',
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      publicKey: { kty: 'RSA', n: 'n', e: 'AQAB' },
    }),
    importIssuerPublicJwk: async () => ({ type: 'public' }) as CryptoKey,
    getActivationContext: async () => ({
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      publicMetadata: metadata,
      keyVersion: 'test-2026-01',
      blindedMessageBytes: 256,
    }),
    blindCommitment: async () => ({
      preparedMsg: new Uint8Array([1, 2, 3]),
      blindedMsg: new Uint8Array(256).fill(9),
      inv: new Uint8Array(256).fill(7),
    }),
    postActivate: async (request) => {
      activateCalls.push(request);
      return {
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        publicMetadata: metadata,
        blindedSignature: 'c2ln',
        keyVersion: 'test-2026-01',
      };
    },
    unblindAndVerify: async () => new Uint8Array([4, 5, 6]),
  });
  const body = activateCalls[0] as {
    blindedMessage: string;
    publicMetadata: unknown;
  };
  expect(JSON.stringify(body)).not.toContain(voter.publicKey);
  expect(JSON.stringify(body)).not.toContain(
    '11111111-1111-4111-8111-111111111111',
  );
  expect(body.publicMetadata).toEqual(metadata);
  expect(stored.privateKey).toBe(voter.privateKey);
  expect(stored.signature).toBe('BAUG');
  expect(await vault.get()).toEqual(stored);
});

it('returns a stored credential without contacting the server', async () => {
  const vault = createMemoryVault();
  const existing = {
    ...voter,
    credentialId: 'id',
    publicMetadata: metadata,
    preparedMessage: 'p',
    signature: 's',
    storedAt: '2026-08-23T00:00:00.000Z',
  };
  await vault.put(existing);
  const getIssuerKeys = async () => {
    throw new Error('should not run');
  };
  await expect(
    redeemActivation('token-value', { vault, getIssuerKeys }),
  ).resolves.toEqual(existing);
});

it('maps a redeemed token to a local activation error', async () => {
  await expect(
    redeemActivation('token-value', {
      vault: createMemoryVault(),
      generateVoterKeyPair: async () => voter,
      getIssuerKeys: async () => {
        throw new ActivationApiError('ACTIVATION_TOKEN_EXPIRED', 409);
      },
    }),
  ).rejects.toMatchObject({ code: 'ACTIVATION_TOKEN_EXPIRED' });
});

it('treats a failed unblind after issuance as unrecoverable', async () => {
  await expect(
    redeemActivation('token-value', {
      vault: createMemoryVault(),
      generateVoterKeyPair: async () => voter,
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
      generateClientNonce: () => 'AAAAAAAAAAAAAAAAAAAAAA',
      getIssuerKeys: async () => ({
        keyVersion: 'v',
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        publicKey: { kty: 'RSA' },
      }),
      importIssuerPublicJwk: async () => ({ type: 'public' }) as CryptoKey,
      getActivationContext: async () => ({
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        publicMetadata: metadata,
        keyVersion: 'v',
        blindedMessageBytes: 256,
      }),
      blindCommitment: async () => ({
        preparedMsg: new Uint8Array([1]),
        blindedMsg: new Uint8Array(256),
        inv: new Uint8Array(256),
      }),
      postActivate: async () => ({
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        publicMetadata: metadata,
        blindedSignature: 'c2ln',
        keyVersion: 'v',
      }),
      unblindAndVerify: async () => {
        throw new Error('invalid signature');
      },
    }),
  ).rejects.toEqual(new ActivationError('UNBLIND_FAILED'));
});

it('maps API codes to owner-facing message keys', () => {
  expect(activationErrorMessageKey('ACTIVATION_TOKEN_EXPIRED')).toBe(
    'activationTokenExpired',
  );
  expect(activationErrorMessageKey('NETWORK')).toBe('activationNetwork');
  expect(activationErrorMessageKey('UNBLIND_FAILED')).toBe(
    'activationUnblindFailed',
  );
});

it('retries IndexedDB storage without repeating issuance', async () => {
  let failPut = true;
  let record: Awaited<ReturnType<typeof redeemActivation>> | null = null;
  const vault = {
    async get() {
      return record;
    },
    async put(credential: NonNullable<typeof record>) {
      if (failPut) throw new Error('quota');
      record = credential;
    },
  };
  const getIssuerKeys = vi.fn(async () => ({
    keyVersion: 'v',
    protocol: BLIND_CREDENTIAL_PROTOCOL,
    publicKey: { kty: 'RSA' },
  }));
  const ports = {
    vault,
    generateVoterKeyPair: async () => voter,
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    generateClientNonce: () => 'AAAAAAAAAAAAAAAAAAAAAA',
    getIssuerKeys,
    importIssuerPublicJwk: async () => ({ type: 'public' }) as CryptoKey,
    getActivationContext: async () => ({
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      publicMetadata: metadata,
      keyVersion: 'v',
      blindedMessageBytes: 256,
    }),
    blindCommitment: async () => ({
      preparedMsg: new Uint8Array([1]),
      blindedMsg: new Uint8Array(256),
      inv: new Uint8Array(256),
    }),
    postActivate: async () => ({
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      publicMetadata: metadata,
      blindedSignature: 'c2ln',
      keyVersion: 'v',
    }),
    unblindAndVerify: async () => new Uint8Array([4, 5, 6]),
  };
  await expect(redeemActivation('token-value', ports)).rejects.toMatchObject({
    code: 'STORAGE',
  });
  failPut = false;
  await expect(redeemActivation('token-value', ports)).resolves.toMatchObject({
    publicKey: voter.publicKey,
  });
  expect(getIssuerKeys).toHaveBeenCalledOnce();
});
