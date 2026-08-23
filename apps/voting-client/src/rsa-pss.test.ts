import { expect, it } from 'vitest';
import { base64urlToBytes } from './base64url';
import {
  bigintToBytes,
  bytesToBigint,
  emsaPssVerify,
  modPow,
  unblindRsaSignature,
} from './rsa-pss';

it('unblinds by multiplying the blinded signature by the inverse modulo n', () => {
  const n = 65537n * 65543n;
  const modulus = bigintToBytes(n, 6);
  const z = 12345n;
  const inv = 6789n;
  const blinded = bigintToBytes(z, 6);
  const inverse = bigintToBytes(inv, 6);
  if (!modulus || !blinded || !inverse) throw new Error('fixture');
  const unblinded = unblindRsaSignature(modulus, blinded, inverse);
  expect(unblinded && bytesToBigint(unblinded)).toBe((z * inv) % n);
});

it('verifies a WebCrypto RSA-PSS SHA-384 signature', async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-384',
    },
    true,
    ['sign', 'verify'],
  );
  const message = new TextEncoder().encode('credential-test');
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'RSA-PSS', saltLength: 48 },
      pair.privateKey,
      message,
    ),
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const modulus = jwk.n ? base64urlToBytes(jwk.n) : null;
  const exponentBytes = jwk.e ? base64urlToBytes(jwk.e) : null;
  if (!modulus || !exponentBytes) throw new Error('missing n');
  const exponent = bytesToBigint(exponentBytes);
  const n = bytesToBigint(modulus);
  const s = bytesToBigint(signature);
  const encoded = bigintToBytes(modPow(s, exponent, n), modulus.length);
  if (!encoded) throw new Error('RSAVP1 overflow');
  expect(
    await emsaPssVerify(message, encoded, n.toString(2).length - 1, 48),
  ).toBe(true);
  encoded[0] = (encoded[0] ?? 0) ^ 1;
  expect(
    await emsaPssVerify(message, encoded, n.toString(2).length - 1, 48),
  ).toBe(false);
});
