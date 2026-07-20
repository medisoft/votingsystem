import { createHash, randomBytes } from 'node:crypto';

export const ACTIVATION_TOKEN_BYTES = 32;
export const ACTIVATION_TOKEN_SUPPORT_PREFIX_LENGTH = 8;

export interface GeneratedActivationToken {
  rawToken: string;
  tokenHash: string;
  tokenPrefixForSupport: string;
}

export function hashActivationToken(rawToken: string) {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

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
