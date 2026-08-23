import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const CREDENTIAL_SCHEMA_VERSION = 2;
export const CREDENTIAL_PUBLIC_KEY_ALGORITHM = 'Ed25519';
export const BLIND_CREDENTIAL_PROTOCOL = 'RSAPBSSA-SHA384-PSS-Randomized';
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const CLIENT_NONCE_MIN_BYTES = 16;

export interface PublicMetadata {
  schemaVersion: number;
  protocol: string;
  scopeId: string;
  weight: string;
  credentialVersion: number;
  expiresAt: string;
  issuer: string;
  keyVersion: string;
}

export interface CredentialCommitment {
  credentialId: string;
  publicKey: string;
  publicKeyAlgorithm: string;
}

/**
 * Serializes issuer-chosen public metadata with a fixed field order.
 *
 * @param metadata - Attributes bound into the partially-blind signature.
 * @returns Canonical JSON used as the `info` parameter.
 */
export function canonicalizePublicMetadata(metadata: PublicMetadata): string {
  return JSON.stringify({
    schemaVersion: metadata.schemaVersion,
    protocol: metadata.protocol,
    scopeId: metadata.scopeId,
    weight: metadata.weight,
    credentialVersion: metadata.credentialVersion,
    expiresAt: metadata.expiresAt,
    issuer: metadata.issuer,
    keyVersion: metadata.keyVersion,
  });
}

/**
 * Serializes the client commitment that the issuer never sees.
 *
 * @param commitment - Credential identifier and voter public key.
 * @returns Canonical JSON prepared and blinded by the client.
 */
export function canonicalizeCredentialCommitment(
  commitment: CredentialCommitment,
): string {
  return JSON.stringify({
    credentialId: commitment.credentialId,
    publicKey: commitment.publicKey,
    publicKeyAlgorithm: commitment.publicKeyAlgorithm,
  });
}

/**
 * Decodes a raw 32-byte Ed25519 public key from canonical base64url.
 *
 * @param encoded - Base64url public key from the client commitment.
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

export interface RevokedIssuanceEntry {
  issuanceId: string;
  credentialVersion: number;
  revokedAt: string;
}

export interface RevocationListPayload {
  schemaVersion: number;
  scopeId: string;
  generatedAt: string;
  issuer: string;
  protocol: string;
  revoked: RevokedIssuanceEntry[];
}

/**
 * Serializes a revocation list with a fixed field order for RSA-PSS signing.
 *
 * Entries identify issuance records, not the unlinkable credential. A later
 * ballot service cannot match a presented credential to these identifiers.
 *
 * @param payload - Public revoked-issuance identifiers for one voting scope.
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
    protocol: payload.protocol,
    revoked: payload.revoked.map((entry) => ({
      issuanceId: entry.issuanceId,
      credentialVersion: entry.credentialVersion,
      revokedAt: entry.revokedAt,
    })),
  });
}

/**
 * Public issuance validity for operators, with no voter public key.
 */
export type PublicCredentialStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

/**
 * Maps a stored issuance record to a public status response.
 *
 * @param record - Issued credential fields needed for validity.
 * @param now - Instant used to treat unrevoked expired credentials as expired.
 * @returns Status fields that do not include voter identity or the final credential.
 */
export function publicCredentialStatus(
  record: {
    id: string;
    credentialVersion: number;
    status: 'ACTIVE' | 'REVOKED';
    expiresAt: Date;
    revokedAt: Date | null;
    replacedByCredentialId: string | null;
  },
  now: Date,
): {
  issuanceId: string;
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
    issuanceId: record.id,
    status,
    credentialVersion: record.credentialVersion,
    expiresAt: record.expiresAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    replaced: Boolean(record.replacedByCredentialId),
  };
}
