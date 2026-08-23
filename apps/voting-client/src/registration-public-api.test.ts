import { afterEach, expect, it, vi } from 'vitest';
import {
  ActivationApiError,
  getIssuerKeys,
  postActivate,
} from './registration-public-api';
import { BLIND_CREDENTIAL_PROTOCOL } from './credential-protocol';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('loads the published issuer public key', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [
          {
            keyVersion: 'v1',
            protocol: BLIND_CREDENTIAL_PROTOCOL,
            publicKey: { kty: 'RSA', n: 'n', e: 'AQAB' },
          },
        ],
      }),
    }),
  );
  const key = await getIssuerKeys();
  expect(key.publicKey.n).toBe('n');
  expect(fetch).toHaveBeenCalledWith(
    '/api/v1/public/issuer-keys',
    expect.objectContaining({ credentials: 'omit' }),
  );
});

it('raises a stable API error code', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'ACTIVATION_TOKEN_EXPIRED' }),
    }),
  );
  await expect(
    postActivate({
      activationToken: 't',
      protocol: BLIND_CREDENTIAL_PROTOCOL,
      blindedMessage: 'x',
      publicMetadata: {
        schemaVersion: 2,
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        scopeId: '22222222-2222-4222-8222-222222222222',
        weight: '1.0000',
        credentialVersion: 1,
        expiresAt: '2026-08-31T23:59:59.000Z',
        issuer: 'i',
        keyVersion: 'v',
      },
      clientNonce: 'AAAAAAAAAAAAAAAAAAAAAA',
    }),
  ).rejects.toEqual(new ActivationApiError('ACTIVATION_TOKEN_EXPIRED', 409));
});
