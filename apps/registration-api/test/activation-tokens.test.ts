import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_TOKEN_BYTES,
  ACTIVATION_TOKEN_SUPPORT_PREFIX_LENGTH,
  generateActivationToken,
  hashActivationToken,
} from '../src/activation-tokens.js';

describe('activation token cryptography', () => {
  it('generates 256-bit URL-safe opaque tokens and stores only derived values', () => {
    const generated = generateActivationToken();
    expect(Buffer.from(generated.rawToken, 'base64url')).toHaveLength(
      ACTIVATION_TOKEN_BYTES,
    );
    expect(generated.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.tokenHash).toBe(hashActivationToken(generated.rawToken));
    expect(generated.tokenHash).not.toContain(generated.rawToken);
    expect(generated.tokenPrefixForSupport).toBe(
      generated.rawToken.slice(0, ACTIVATION_TOKEN_SUPPORT_PREFIX_LENGTH),
    );
  });

  it('generates unique tokens', () => {
    const tokens = new Set(
      Array.from({ length: 256 }, () => generateActivationToken().rawToken),
    );
    expect(tokens).toHaveLength(256);
  });

  it('hashes tokens deterministically without normalization', () => {
    expect(hashActivationToken('token')).toBe(hashActivationToken('token'));
    expect(hashActivationToken('token')).not.toBe(hashActivationToken('Token'));
  });
});
