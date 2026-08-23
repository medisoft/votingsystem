import { expect, it } from 'vitest';
import { getSubtleCrypto } from './web-crypto';

it('exposes the Web Crypto SubtleCrypto interface', async () => {
  const subtle = getSubtleCrypto();
  const digest = await subtle.digest('SHA-256', new Uint8Array([1, 2, 3]));
  expect(digest.byteLength).toBe(32);
});
