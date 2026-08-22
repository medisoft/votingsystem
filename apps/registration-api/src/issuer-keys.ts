import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface IssuerKeyMaterial {
  privateKeyPkcs8DerBase64url: string;
  publicKeyRawBase64url: string;
}

export interface Issuer {
  keyVersion: string;
  issuer: string;
  publicKeyRawBase64url: string;
  privateKey: KeyObject;
}

/**
 * Creates a new Ed25519 issuer key pair for tests and local key generation.
 *
 * @returns PKCS8 DER private key and 32-byte public key, both base64url-encoded.
 */
export function generateIssuerKeyMaterial(): IssuerKeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return {
    privateKeyPkcs8DerBase64url: privateKey
      .export({ type: 'pkcs8', format: 'der' })
      .toString('base64url'),
    publicKeyRawBase64url: spki.subarray(-32).toString('base64url'),
  };
}

/**
 * Loads an Ed25519 private key from PKCS8 PEM or base64url-encoded PKCS8 DER.
 *
 * @param material - PEM text or base64url PKCS8 DER bytes.
 * @returns A Node.js Ed25519 private KeyObject.
 */
export function parseEd25519PrivateKey(material: string): KeyObject {
  const trimmed = material.trim();
  const key = trimmed.includes('BEGIN PRIVATE KEY')
    ? createPrivateKey(trimmed)
    : createPrivateKey({
        key: Buffer.from(trimmed, 'base64url'),
        format: 'der',
        type: 'pkcs8',
      });
  if (key.asymmetricKeyType !== 'ed25519')
    throw new Error('Issuer private key must be Ed25519');
  return key;
}

/**
 * Extracts the raw 32-byte Ed25519 public key from a private key.
 *
 * @param privateKey - Ed25519 private KeyObject.
 * @returns The 32-byte public key.
 */
export function ed25519PublicKeyRaw(privateKey: KeyObject): Buffer {
  const spki = Buffer.from(
    createPublicKey(privateKey).export({
      type: 'spki',
      format: 'der',
    }),
  );
  return spki.subarray(-32);
}

/**
 * Builds the in-process issuer used to sign credentials.
 *
 * @param input - Key version, issuer identifier, and private-key material.
 * @returns Signer plus the published public key and version metadata.
 */
export function createIssuer(input: {
  ISSUER_PRIVATE_KEY: string;
  ISSUER_KEY_VERSION: string;
  ISSUER_ID: string;
}): Issuer {
  const privateKey = parseEd25519PrivateKey(input.ISSUER_PRIVATE_KEY);
  return {
    keyVersion: input.ISSUER_KEY_VERSION,
    issuer: input.ISSUER_ID,
    publicKeyRawBase64url:
      ed25519PublicKeyRaw(privateKey).toString('base64url'),
    privateKey,
  };
}

/**
 * Signs canonical UTF-8 bytes with Ed25519.
 *
 * @param canonical - Canonical credential JSON.
 * @param privateKey - Issuer Ed25519 private key.
 * @returns Base64url signature (64 bytes, 86 characters).
 */
export function signCanonical(
  canonical: string,
  privateKey: KeyObject,
): string {
  return sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString(
    'base64url',
  );
}

/**
 * Verifies an Ed25519 signature over canonical UTF-8 bytes.
 *
 * @param canonical - Canonical credential JSON that was signed.
 * @param signature - Base64url signature.
 * @param publicKeyRaw - Raw 32-byte Ed25519 public key.
 * @returns Whether the signature is valid for the payload and key.
 */
export function verifyCanonical(
  canonical: string,
  signature: string,
  publicKeyRaw: Buffer,
): boolean {
  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyRaw]),
    format: 'der',
    type: 'spki',
  });
  try {
    return verify(
      null,
      Buffer.from(canonical, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}
