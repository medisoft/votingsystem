import { expect, it } from 'vitest';
import { base64urlToBytes, bytesToBase64url } from './base64url';

it('round-trips bytes without padding', () => {
  const bytes = Uint8Array.from([1, 2, 3, 250]);
  const encoded = bytesToBase64url(bytes);
  expect(encoded).not.toContain('=');
  expect(base64urlToBytes(encoded)).toEqual(bytes);
});

it('rejects padded or non-canonical input', () => {
  expect(base64urlToBytes('AQID+g==')).toBeNull();
  expect(base64urlToBytes('not base64')).toBeNull();
});
