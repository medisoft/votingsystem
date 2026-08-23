import { bytesToBase64url } from './base64url';
import {
  CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  ED25519_PUBLIC_KEY_BYTES,
} from './credential-protocol';
import { getSubtleCrypto } from './web-crypto';

export interface VoterKeyPair {
  privateKey: CryptoKey;
  publicKey: string;
  publicKeyAlgorithm: typeof CREDENTIAL_PUBLIC_KEY_ALGORITHM;
}

/**
 * Generates an Ed25519 key pair on this device.
 *
 * The private key is non-extractable and never leaves the Web Crypto module
 * except as a CryptoKey stored in IndexedDB.
 *
 * @returns Local key pair with a canonical base64url public key.
 */
export async function generateVoterKeyPair(): Promise<VoterKeyPair> {
  const subtle = getSubtleCrypto();
  const pair = await subtle.generateKey({ name: 'Ed25519' }, false, [
    'sign',
    'verify',
  ]);
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  if (raw.length !== ED25519_PUBLIC_KEY_BYTES) {
    throw new Error('Ed25519 public key must be 32 bytes');
  }
  return {
    privateKey: pair.privateKey,
    publicKey: bytesToBase64url(raw),
    publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  };
}
