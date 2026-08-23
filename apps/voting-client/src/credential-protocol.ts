import { bytesToBase64url } from './base64url';

export const CREDENTIAL_SCHEMA_VERSION = 2;
export const CREDENTIAL_PUBLIC_KEY_ALGORITHM = 'Ed25519' as const;
export const BLIND_CREDENTIAL_PROTOCOL = 'RSAPBSSA-SHA384-PSS-Randomized';
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const RSA_MODULUS_BYTES = 256;
export const CLIENT_NONCE_BYTES = 16;
export const PSS_SALT_LENGTH = 48;

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
 * Creates a 128-bit client nonce used only for request uniqueness.
 *
 * @returns Canonical base64url nonce.
 */
export function generateClientNonce(): string {
  return bytesToBase64url(
    crypto.getRandomValues(new Uint8Array(CLIENT_NONCE_BYTES)),
  );
}
