import { createHash, generatePrimeSync } from 'node:crypto';
import { RSAPBSSA } from '@cloudflare/blindrsa-ts';
import type { PartiallyBlindRSA } from '@cloudflare/blindrsa-ts';
import {
  type CredentialCommitment,
  type PublicMetadata,
  canonicalizeCredentialCommitment,
  canonicalizePublicMetadata,
} from './credentials.js';

export const RSA_MODULUS_BITS = 2048;
export const RSA_MODULUS_BYTES = RSA_MODULUS_BITS / 8;
const RSA_PUBLIC_EXPONENT = Uint8Array.from([1, 0, 1]);

/**
 * Returns the RSAPBSSA-SHA384-PSS-Randomized suite used for issuance.
 *
 * @returns Cloudflare partially-blind RSA suite instance.
 */
export function blindSuite(): PartiallyBlindRSA {
  return RSAPBSSA.SHA384.PSS.Randomized();
}

/**
 * Encodes binary protocol fields as canonical base64url.
 *
 * @param bytes - Blinded message, inverse, or signature bytes.
 * @returns Base64url without padding.
 */
export function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Decodes a canonical base64url string of an expected byte length.
 *
 * @param encoded - Base64url text.
 * @param expectedLength - Required decoded size, typically 256 for RSA-2048.
 * @returns The bytes, or null when the encoding is invalid.
 */
export function parseFixedBytes(
  encoded: string,
  expectedLength: number,
): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.length !== expectedLength) return null;
  if (bytes.toString('base64url') !== encoded) return null;
  return bytes;
}

/**
 * SHA-256 of a blinded message for replay detection. The hash is of the
 * issuer-visible blinded value, not of the final unblinded credential.
 *
 * @param blindedMessage - RSA-sized blinded representative.
 * @returns Lowercase 64-character hexadecimal digest.
 */
export function hashBlindedMessage(blindedMessage: Uint8Array): string {
  return createHash('sha256').update(blindedMessage).digest('hex');
}

/**
 * UTF-8 public-metadata bytes bound into the partially-blind signature.
 *
 * @param metadata - Issuer-chosen attributes.
 * @returns Canonical JSON as UTF-8.
 */
export function publicMetadataBytes(metadata: PublicMetadata): Uint8Array {
  return Buffer.from(canonicalizePublicMetadata(metadata), 'utf8');
}

/**
 * UTF-8 commitment bytes that remain hidden from the issuer.
 *
 * @param commitment - Client-chosen credential identifier and voter public key.
 * @returns Canonical JSON as UTF-8.
 */
export function commitmentBytes(commitment: CredentialCommitment): Uint8Array {
  return Buffer.from(canonicalizeCredentialCommitment(commitment), 'utf8');
}

export interface BlindedRequest {
  preparedMsg: Uint8Array;
  blindedMsg: Uint8Array;
  inv: Uint8Array;
}

/**
 * Client-side prepare and blind step. The issuer must never receive
 * `preparedMsg` or `inv`.
 *
 * @param publicKey - Issuer RSA-PSS public key.
 * @param commitment - Hidden credential identifier and voter public key.
 * @param metadata - Public attributes the issuer will also use in BlindSign.
 * @returns Blinded representative plus secrets needed to unblind.
 */
export async function blindCommitment(
  publicKey: CryptoKey,
  commitment: CredentialCommitment,
  metadata: PublicMetadata,
): Promise<BlindedRequest> {
  const suite = blindSuite();
  const preparedMsg = suite.prepare(commitmentBytes(commitment));
  const { blindedMsg, inv } = await suite.blind(
    publicKey,
    preparedMsg,
    publicMetadataBytes(metadata),
  );
  return { preparedMsg, blindedMsg, inv };
}

/**
 * Issuer-side signing of a blinded representative with public metadata.
 *
 * @param privateKey - Issuer RSA-PSS private key (extractable).
 * @param blindedMessage - Client blinded representative, kLen bytes.
 * @param metadata - Same public metadata the client used to blind.
 * @returns Blinded signature bytes.
 */
export async function blindSignCommitment(
  privateKey: CryptoKey,
  blindedMessage: Uint8Array,
  metadata: PublicMetadata,
): Promise<Uint8Array> {
  return blindSuite().blindSign(
    privateKey,
    blindedMessage,
    publicMetadataBytes(metadata),
  );
}

/**
 * Client-side unblind. Verifies the result against the issuer public key.
 *
 * @param publicKey - Issuer RSA-PSS public key.
 * @param preparedMsg - Prepared message retained from `blindCommitment`.
 * @param metadata - Public metadata used during blinding.
 * @param blindedSignature - Issuer response.
 * @param inv - Blinding inverse retained from `blindCommitment`.
 * @returns Unblinded signature bytes.
 */
export async function unblindSignature(
  publicKey: CryptoKey,
  preparedMsg: Uint8Array,
  metadata: PublicMetadata,
  blindedSignature: Uint8Array,
  inv: Uint8Array,
): Promise<Uint8Array> {
  return blindSuite().finalize(
    publicKey,
    preparedMsg,
    publicMetadataBytes(metadata),
    blindedSignature,
    inv,
  );
}

/**
 * Independent verification of an unblinded credential signature.
 *
 * @param publicKey - Issuer RSA-PSS public key.
 * @param signature - Unblinded signature.
 * @param preparedMsg - Prepared commitment message.
 * @param metadata - Public metadata bound into the signature.
 * @returns Whether the signature is valid.
 */
export async function verifyBlindCredential(
  publicKey: CryptoKey,
  signature: Uint8Array,
  preparedMsg: Uint8Array,
  metadata: PublicMetadata,
): Promise<boolean> {
  return blindSuite().verify(
    publicKey,
    signature,
    preparedMsg,
    publicMetadataBytes(metadata),
  );
}

/**
 * Generates an RSA-2048 key pair with safe primes, as required by
 * partially-blind RSA. This is slow; do not call it per request.
 *
 * @returns Extractable RSA-PSS CryptoKey pair for {@link BLIND_CREDENTIAL_PROTOCOL}.
 */
export async function generateBlindRsaKeyPair(): Promise<CryptoKeyPair> {
  return blindSuite().generateKey(
    {
      publicExponent: RSA_PUBLIC_EXPONENT,
      modulusLength: RSA_MODULUS_BITS,
    },
    (length) => generatePrimeSync(length, { safe: true, bigint: true }),
  );
}
