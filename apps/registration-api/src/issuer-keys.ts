import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { RSA_MODULUS_BITS, generateBlindRsaKeyPair } from './blind-rsa.js';

export const ISSUER_ALGORITHM = 'RSAPBSSA-SHA384-PSS-Randomized';
export const ISSUER_PROTOCOL_SPEC = 'draft-amjad-cfrg-partially-blind-rsa-02';

export interface IssuerKeyMaterial {
  privateKeyPkcs8DerBase64url: string;
  publicKeyJwk: JsonWebKey;
}

export interface Issuer {
  keyVersion: string;
  issuer: string;
  algorithm: typeof ISSUER_ALGORITHM;
  protocol: typeof ISSUER_PROTOCOL_SPEC;
  modulusLength: number;
  publicKeyJwk: JsonWebKey;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/**
 * Converts PKCS8 DER base64url into PEM for secret files.
 *
 * @param derBase64url - PKCS8 DER encoded as base64url.
 * @returns PEM text with a PRIVATE KEY header.
 */
export function pkcs8DerToPem(derBase64url: string): string {
  const body = Buffer.from(derBase64url, 'base64url')
    .toString('base64')
    .match(/.{1,64}/g)
    ?.join('\n');
  if (!body) throw new Error('Issuer private key is empty');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

/**
 * Loads an RSA private key from PKCS8 PEM or base64url-encoded PKCS8 DER.
 *
 * @param material - PEM text or base64url PKCS8 DER bytes.
 * @returns A Node.js RSA private KeyObject with modulus length at least 2048.
 */
export function parseRsaPrivateKey(material: string): KeyObject {
  const trimmed = material.trim();
  const key = trimmed.includes('BEGIN PRIVATE KEY')
    ? createPrivateKey(trimmed)
    : createPrivateKey({
        key: Buffer.from(trimmed, 'base64url'),
        format: 'der',
        type: 'pkcs8',
      });
  if (key.asymmetricKeyType !== 'rsa')
    throw new Error('Issuer private key must be RSA');
  const modulusLength = key.asymmetricKeyDetails?.modulusLength;
  if (!modulusLength || modulusLength < RSA_MODULUS_BITS)
    throw new Error(`Issuer RSA modulus must be at least ${RSA_MODULUS_BITS}`);
  return key;
}

/**
 * Creates a new RSA-2048 issuer key pair with safe primes.
 *
 * @returns PKCS8 DER private key (base64url) and the matching public JWK.
 */
export async function generateIssuerKeyMaterial(): Promise<IssuerKeyMaterial> {
  const { privateKey, publicKey } = await generateBlindRsaKeyPair();
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey));
  return {
    privateKeyPkcs8DerBase64url: pkcs8.toString('base64url'),
    publicKeyJwk: await crypto.subtle.exportKey('jwk', publicKey),
  };
}

/**
 * Imports extractable WebCrypto RSA-PSS keys used by the blind-signature suite.
 *
 * @param privateKey - Node RSA private KeyObject.
 * @returns Extractable private and public CryptoKeys.
 */
async function importPssKeyPair(privateKey: KeyObject): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}> {
  const pkcs8 = new Uint8Array(
    privateKey.export({ type: 'pkcs8', format: 'der' }),
  );
  const spki = new Uint8Array(
    createPublicKey(privateKey).export({
      type: 'spki',
      format: 'der',
    }),
  );
  const algorithm = { name: 'RSA-PSS', hash: 'SHA-384' } as const;
  return {
    privateKey: await crypto.subtle.importKey('pkcs8', pkcs8, algorithm, true, [
      'sign',
    ]),
    publicKey: await crypto.subtle.importKey('spki', spki, algorithm, true, [
      'verify',
    ]),
  };
}

/**
 * Imports a published issuer public JWK for client unblinding and verification.
 *
 * @param jwk - RSA public JWK from GET /api/v1/public/issuer-keys.
 * @returns Extractable RSA-PSS public CryptoKey.
 */
export async function importIssuerPublicJwk(
  jwk: JsonWebKey,
): Promise<CryptoKey> {
  if (!jwk.n || !jwk.e) throw new Error('Issuer public JWK is missing n or e');
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, ext: true, alg: 'PS384' },
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify'],
  );
}

/**
 * Builds the in-process issuer used to blind-sign credentials.
 *
 * @param input - Key version, issuer identifier, and private-key material.
 * @returns Signer plus the published public JWK and protocol metadata.
 */
export async function createIssuer(input: {
  ISSUER_PRIVATE_KEY: string;
  ISSUER_KEY_VERSION: string;
  ISSUER_ID: string;
}): Promise<Issuer> {
  const nodeKey = parseRsaPrivateKey(input.ISSUER_PRIVATE_KEY);
  const keys = await importPssKeyPair(nodeKey);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  return {
    keyVersion: input.ISSUER_KEY_VERSION,
    issuer: input.ISSUER_ID,
    algorithm: ISSUER_ALGORITHM,
    protocol: ISSUER_PROTOCOL_SPEC,
    modulusLength:
      nodeKey.asymmetricKeyDetails?.modulusLength ?? RSA_MODULUS_BITS,
    publicKeyJwk: {
      kty: 'RSA',
      alg: 'PS384',
      ...(publicKeyJwk.n ? { n: publicKeyJwk.n } : {}),
      ...(publicKeyJwk.e ? { e: publicKeyJwk.e } : {}),
    },
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
}

/**
 * Signs canonical UTF-8 bytes with RSA-PSS SHA-384 (non-blind, for lists).
 *
 * @param canonical - Canonical JSON.
 * @param privateKey - Issuer RSA-PSS private key.
 * @returns Base64url signature.
 */
export async function signCanonical(
  canonical: string,
  privateKey: CryptoKey,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'RSA-PSS', saltLength: 48 },
    privateKey,
    Buffer.from(canonical, 'utf8'),
  );
  return Buffer.from(signature).toString('base64url');
}

/**
 * Verifies an RSA-PSS SHA-384 signature over canonical UTF-8 bytes.
 *
 * @param canonical - Canonical JSON that was signed.
 * @param signature - Base64url signature.
 * @param publicKey - Issuer RSA-PSS public key.
 * @returns Whether the signature is valid.
 */
export async function verifyCanonical(
  canonical: string,
  signature: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      { name: 'RSA-PSS', saltLength: 48 },
      publicKey,
      Buffer.from(signature, 'base64url'),
      Buffer.from(canonical, 'utf8'),
    );
  } catch {
    return false;
  }
}
