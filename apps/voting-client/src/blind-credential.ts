import { base64urlToBytes } from './base64url';
import {
  type CredentialCommitment,
  type PublicMetadata,
  RSA_MODULUS_BYTES,
  canonicalizeCredentialCommitment,
  canonicalizePublicMetadata,
} from './credential-protocol';
import { unblindRsaSignature, verifyPartialBlindSignature } from './rsa-pss';
import { getSubtleCrypto } from './web-crypto';

export interface BlindedRequest {
  preparedMsg: Uint8Array;
  blindedMsg: Uint8Array;
  inv: Uint8Array;
}

/**
 * Imports the published issuer RSA-PSS public JWK.
 *
 * @param jwk - RSA public JWK from GET /api/v1/public/issuer-keys.
 * @returns Extractable RSA-PSS public CryptoKey used by the blinding suite.
 */
export async function importIssuerPublicJwk(
  jwk: JsonWebKey,
): Promise<CryptoKey> {
  if (!jwk.n || !jwk.e) throw new Error('Issuer public JWK is missing n or e');
  return getSubtleCrypto().importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, ext: true, alg: 'PS384' },
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify'],
  );
}

async function loadSuite() {
  const { RSAPBSSA } = await import('@cloudflare/blindrsa-ts');
  return RSAPBSSA.SHA384.PSS.Randomized();
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Client-side prepare and blind. `preparedMsg` and `inv` stay on the device.
 *
 * @param publicKey - Issuer RSA-PSS public key.
 * @param commitment - Hidden credential identifier and voter public key.
 * @param metadata - Public attributes echoed from activation-context.
 * @returns Blinded representative plus secrets needed to unblind.
 */
export async function blindCommitment(
  publicKey: CryptoKey,
  commitment: CredentialCommitment,
  metadata: PublicMetadata,
): Promise<BlindedRequest> {
  const suite = await loadSuite();
  const preparedMsg = suite.prepare(
    utf8Bytes(canonicalizeCredentialCommitment(commitment)),
  );
  const { blindedMsg, inv } = await suite.blind(
    publicKey,
    preparedMsg,
    utf8Bytes(canonicalizePublicMetadata(metadata)),
  );
  if (blindedMsg.length !== RSA_MODULUS_BYTES) {
    throw new Error('Blinded message has unexpected length');
  }
  return { preparedMsg, blindedMsg, inv };
}

/**
 * Unblinds the issuer response and verifies it without WebCrypto import of
 * the derived public exponent (browsers reject that key).
 *
 * @param publicKey - Issuer RSA-PSS public key.
 * @param preparedMsg - Prepared message retained from `blindCommitment`.
 * @param metadata - Public metadata used during blinding.
 * @param blindedSignature - Issuer response.
 * @param inv - Blinding inverse retained from `blindCommitment`.
 * @returns Unblinded signature bytes.
 */
export async function unblindAndVerify(
  publicKey: CryptoKey,
  preparedMsg: Uint8Array,
  metadata: PublicMetadata,
  blindedSignature: Uint8Array,
  inv: Uint8Array,
): Promise<Uint8Array> {
  const jwk = await getSubtleCrypto().exportKey('jwk', publicKey);
  const modulus = jwk.n ? base64urlToBytes(jwk.n) : null;
  if (!modulus) throw new Error('Issuer public key modulus is invalid');
  const signature = unblindRsaSignature(modulus, blindedSignature, inv);
  if (!signature) throw new Error('Unblind produced an invalid signature');
  const info = utf8Bytes(canonicalizePublicMetadata(metadata));
  const ok = await verifyPartialBlindSignature(
    modulus,
    signature,
    preparedMsg,
    info,
  );
  if (!ok) throw new Error('Unblinded credential signature is invalid');
  return signature;
}
