import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const CREDENTIAL_SCHEMA_VERSION = 1;
export const CREDENTIAL_PUBLIC_KEY_ALGORITHM = 'Ed25519';
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const CLIENT_NONCE_MIN_BYTES = 16;

export interface CredentialPayload {
  schemaVersion: number;
  credentialId: string;
  scopeId: string;
  publicKey: string;
  publicKeyAlgorithm: string;
  weight: string;
  credentialVersion: number;
  issuedAt: string;
  expiresAt: string;
  issuer: string;
}

/**
 * Serializes a credential payload with a fixed field order for Ed25519 signing.
 *
 * @param payload - Version 1 credential fields.
 * @returns Canonical JSON used as the signed message.
 */
export function canonicalizeCredentialPayload(
  payload: CredentialPayload,
): string {
  return JSON.stringify({
    schemaVersion: payload.schemaVersion,
    credentialId: payload.credentialId,
    scopeId: payload.scopeId,
    publicKey: payload.publicKey,
    publicKeyAlgorithm: payload.publicKeyAlgorithm,
    weight: payload.weight,
    credentialVersion: payload.credentialVersion,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    issuer: payload.issuer,
  });
}

/**
 * Decodes a raw 32-byte Ed25519 public key from canonical base64url.
 *
 * @param encoded - Base64url public key from the activation request.
 * @returns The 32-byte public key, or null when the encoding is invalid.
 */
export function parseEd25519PublicKey(encoded: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.length !== ED25519_PUBLIC_KEY_BYTES) return null;
  if (bytes.toString('base64url') !== encoded) return null;
  return bytes;
}

/**
 * SHA-256 fingerprint of a voter public key for storage and audit metadata.
 *
 * @param publicKeyRaw - Raw 32-byte Ed25519 public key.
 * @returns Lowercase 64-character hexadecimal digest.
 */
export function fingerprintPublicKey(publicKeyRaw: Buffer): string {
  return createHash('sha256').update(publicKeyRaw).digest('hex');
}

/**
 * Formats a voting weight with exactly four decimal places.
 *
 * @param weight - PostgreSQL DECIMAL(12,4) value.
 * @returns Canonical weight string such as `1.0000`.
 */
export function formatVotingWeight(weight: Prisma.Decimal | string): string {
  return new Prisma.Decimal(weight).toFixed(4);
}

/**
 * Decodes a client nonce used only for request uniqueness, not signing.
 *
 * @param encoded - Base64url nonce from the activation request.
 * @returns True when the nonce has at least 16 decoded bytes.
 */
export function isValidClientNonce(encoded: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 64) return false;
  const bytes = Buffer.from(encoded, 'base64url');
  return (
    bytes.length >= CLIENT_NONCE_MIN_BYTES &&
    bytes.toString('base64url') === encoded
  );
}

/**
 * Creates a 128-bit client nonce for tests and manual activation requests.
 *
 * @returns Canonical base64url nonce.
 */
export function generateClientNonce(): string {
  return randomBytes(CLIENT_NONCE_MIN_BYTES).toString('base64url');
}

export interface RevokedCredentialEntry {
  credentialId: string;
  credentialVersion: number;
  revokedAt: string;
}

export interface RevocationListPayload {
  schemaVersion: number;
  scopeId: string;
  generatedAt: string;
  issuer: string;
  revoked: RevokedCredentialEntry[];
}

/**
 * Serializes a revocation list with a fixed field order for Ed25519 signing.
 *
 * @param payload - Public revoked-credential identifiers for one voting scope.
 * @returns Canonical JSON used as the signed message.
 */
export function canonicalizeRevocationList(
  payload: RevocationListPayload,
): string {
  return JSON.stringify({
    schemaVersion: payload.schemaVersion,
    scopeId: payload.scopeId,
    generatedAt: payload.generatedAt,
    issuer: payload.issuer,
    revoked: payload.revoked.map((entry) => ({
      credentialId: entry.credentialId,
      credentialVersion: entry.credentialVersion,
      revokedAt: entry.revokedAt,
    })),
  });
}

/**
 * Public credential validity for ballot services, with no registration identity.
 */
export type PublicCredentialStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

/**
 * Maps a stored credential to a public status response.
 *
 * @param record - Issued credential fields needed for validity.
 * @param now - Instant used to treat unrevoked expired credentials as expired.
 * @returns Status fields that do not include voter identity.
 */
export function publicCredentialStatus(
  record: {
    credentialId: string;
    credentialVersion: number;
    status: 'ACTIVE' | 'REVOKED';
    expiresAt: Date;
    revokedAt: Date | null;
    replacedByCredentialId: string | null;
  },
  now: Date,
): {
  credentialId: string;
  status: PublicCredentialStatus;
  credentialVersion: number;
  expiresAt: string;
  revokedAt: string | null;
  replaced: boolean;
} {
  const expired = record.expiresAt <= now;
  const status: PublicCredentialStatus =
    record.status === 'REVOKED' ? 'REVOKED' : expired ? 'EXPIRED' : 'ACTIVE';
  return {
    credentialId: record.credentialId,
    status,
    credentialVersion: record.credentialVersion,
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    replaced: Boolean(record.replacedByCredentialId),
  };
}
