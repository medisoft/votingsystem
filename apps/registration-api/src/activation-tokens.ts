import { createHash, randomBytes } from 'node:crypto';

export const ACTIVATION_TOKEN_BYTES = 32;
export const ACTIVATION_TOKEN_SUPPORT_PREFIX_LENGTH = 8;

export interface GeneratedActivationToken {
  rawToken: string;
  tokenHash: string;
  tokenPrefixForSupport: string;
}

/**
 * Hashes an opaque activation token exactly as received using SHA-256.
 *
 * @param rawToken - URL-safe activation token whose UTF-8 bytes are hashed without normalization.
 * @returns The lowercase 64-character hexadecimal digest used for storage and lookup.
 */
export function hashActivationToken(rawToken: string) {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Creates a new 256-bit opaque activation token and its safe stored derivatives.
 *
 * @returns The one-time URL-safe raw token, its SHA-256 hexadecimal hash, and
 * the first eight raw-token characters used only as a support prefix.
 */
export function generateActivationToken(): GeneratedActivationToken {
  const rawToken = randomBytes(ACTIVATION_TOKEN_BYTES).toString('base64url');
  return {
    rawToken,
    tokenHash: hashActivationToken(rawToken),
    tokenPrefixForSupport: rawToken.slice(
      0,
      ACTIVATION_TOKEN_SUPPORT_PREFIX_LENGTH,
    ),
  };
}
