import { PSS_SALT_LENGTH } from './credential-protocol';

/**
 * Interprets bytes as an unsigned big-endian integer.
 *
 * @param bytes - Octet string.
 * @returns Integer value.
 */
export function bytesToBigint(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/**
 * Encodes an integer as a fixed-length big-endian octet string.
 *
 * @param value - Non-negative integer.
 * @param length - Required output length in bytes.
 * @returns Octet string, or null when the integer does not fit.
 */
export function bigintToBytes(
  value: bigint,
  length: number,
): Uint8Array | null {
  if (value < 0n) return null;
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) return null;
  return bytes;
}

/**
 * Modular exponentiation `base ** exp mod modulus`.
 *
 * @param base - Base integer.
 * @param exp - Public exponent.
 * @param modulus - RSA modulus.
 * @returns `base ** exp mod modulus`.
 */
export function modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
  if (modulus <= 0n) throw new Error('modulus must be positive');
  let result = 1n;
  let b = ((base % modulus) + modulus) % modulus;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function digestSha384(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-384', data.slice()));
}

async function mgf1Sha384(
  seed: Uint8Array,
  maskLen: number,
): Promise<Uint8Array> {
  const hLen = 48;
  const n = Math.ceil(maskLen / hLen);
  const chunks: Uint8Array[] = [];
  const counter = new Uint8Array(4);
  for (let i = 0; i < n; i += 1) {
    counter[0] = (i >>> 24) & 0xff;
    counter[1] = (i >>> 16) & 0xff;
    counter[2] = (i >>> 8) & 0xff;
    counter[3] = i & 0xff;
    chunks.push(await digestSha384(concatBytes([seed, counter])));
  }
  return concatBytes(chunks).subarray(0, maskLen);
}

/**
 * EMSA-PSS-VERIFY for SHA-384 with the given salt length (RFC 8017 §9.1.2).
 *
 * @param message - Message that was encoded.
 * @param encoded - Encoded message recovered by RSAVP1.
 * @param emBits - Maximal bit length of OS2IP(EM).
 * @param saltLength - PSS salt length in bytes.
 * @returns Whether the encoding is valid for `message`.
 */
export async function emsaPssVerify(
  message: Uint8Array,
  encoded: Uint8Array,
  emBits: number,
  saltLength: number = PSS_SALT_LENGTH,
): Promise<boolean> {
  const hLen = 48;
  const emLen = encoded.length;
  if (emLen !== Math.ceil(emBits / 8)) return false;
  if (emLen < hLen + saltLength + 2) return false;
  if (encoded[emLen - 1] !== 0xbc) return false;
  const maskedDb = encoded.subarray(0, emLen - hLen - 1);
  const hash = encoded.subarray(emLen - hLen - 1, emLen - 1);
  const unusedBits = 8 * emLen - emBits;
  const mask = 0xff >> unusedBits;
  const first = maskedDb[0];
  if (first === undefined || (first & ~mask) !== 0) return false;
  const dbMask = await mgf1Sha384(hash, maskedDb.length);
  const db = new Uint8Array(maskedDb.length);
  for (let i = 0; i < db.length; i += 1) {
    db[i] = (maskedDb[i] ?? 0) ^ (dbMask[i] ?? 0);
  }
  const db0 = db[0];
  if (db0 !== undefined) db[0] = db0 & mask;
  const psEnd = emLen - hLen - saltLength - 2;
  for (let i = 0; i < psEnd; i += 1) {
    if (db[i] !== 0) return false;
  }
  if (db[psEnd] !== 0x01) return false;
  const salt = db.subarray(psEnd + 1);
  const mHash = await digestSha384(message);
  const mPrime = concatBytes([new Uint8Array(8), mHash, salt]);
  const actual = await digestSha384(mPrime);
  if (actual.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1)
    diff |= (actual[i] ?? 0) ^ (hash[i] ?? 0);
  return diff === 0;
}

/**
 * Unblinds a partially-blind RSA signature: `s = z * inv mod n`.
 *
 * @param modulus - RSA modulus bytes.
 * @param blindedSignature - Issuer blinded signature, kLen bytes.
 * @param inverse - Blinding inverse retained from `Blind`.
 * @returns Unblinded signature bytes, or null when sizes are wrong.
 */
export function unblindRsaSignature(
  modulus: Uint8Array,
  blindedSignature: Uint8Array,
  inverse: Uint8Array,
): Uint8Array | null {
  const kLen = modulus.length;
  if (blindedSignature.length !== kLen || inverse.length !== kLen) return null;
  const n = bytesToBigint(modulus);
  const z = bytesToBigint(blindedSignature);
  const inv = bytesToBigint(inverse);
  if (z >= n) return null;
  return bigintToBytes((z * inv) % n, kLen);
}

/**
 * Derives the partially-blind public exponent from `n` and public metadata.
 *
 * Matches draft-amjad-cfrg-partially-blind-rsa-02 DerivePublicKey.
 *
 * @param modulus - RSA modulus bytes from the issuer JWK.
 * @param info - Canonical public-metadata bytes.
 * @returns Derived public exponent `e'`.
 */
export async function derivePartialBlindExponent(
  modulus: Uint8Array,
  info: Uint8Array,
): Promise<bigint> {
  const n = bytesToBigint(modulus);
  const bitLength = n.toString(2).length;
  const modulusLen = bitLength >> 3;
  const lambdaLen = bitLength >> 4;
  const hkdfLen = lambdaLen + 16;
  const hkdfInput = concatBytes([
    new TextEncoder().encode('key'),
    info,
    new Uint8Array([0]),
  ]);
  const salt = bigintToBytes(n, modulusLen);
  if (!salt) throw new Error('modulus encoding failed');
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    hkdfInput.slice(),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const expanded = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-384',
        info: new TextEncoder().encode('PBRSA'),
        salt: salt.slice(),
      },
      hkdfKey,
      hkdfLen * 8,
    ),
  );
  expanded[0] = (expanded[0] ?? 0) & 0x3f;
  expanded[lambdaLen - 1] = (expanded[lambdaLen - 1] ?? 0) | 0x01;
  return bytesToBigint(expanded.subarray(0, lambdaLen));
}

function lengthPrefix4(length: number): Uint8Array {
  return Uint8Array.of(
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
  );
}

/**
 * Builds the partially-blind message `msg || info` construction used in Finalize.
 *
 * @param preparedMsg - Prepared commitment retained from Blind.
 * @param info - Canonical public-metadata bytes.
 * @returns `concat("msg", I2OSP(len(info), 4), info, preparedMsg)`.
 */
export function partiallyBlindMessage(
  preparedMsg: Uint8Array,
  info: Uint8Array,
): Uint8Array {
  return concatBytes([
    new TextEncoder().encode('msg'),
    lengthPrefix4(info.length),
    info,
    preparedMsg,
  ]);
}

/**
 * Verifies an unblinded partially-blind RSA-PSS signature in software.
 *
 * Browser WebCrypto cannot import the large derived public exponent, so
 * verification uses BigInt RSAVP1 plus EMSA-PSS-VERIFY.
 *
 * @param modulus - Issuer RSA modulus.
 * @param signature - Unblinded signature.
 * @param preparedMsg - Prepared commitment.
 * @param info - Canonical public-metadata bytes.
 * @returns Whether the signature is valid.
 */
export async function verifyPartialBlindSignature(
  modulus: Uint8Array,
  signature: Uint8Array,
  preparedMsg: Uint8Array,
  info: Uint8Array,
): Promise<boolean> {
  if (signature.length !== modulus.length) return false;
  const n = bytesToBigint(modulus);
  const s = bytesToBigint(signature);
  if (s >= n) return false;
  const ePrime = await derivePartialBlindExponent(modulus, info);
  const encoded = bigintToBytes(modPow(s, ePrime, n), modulus.length);
  if (!encoded) return false;
  const emBits = n.toString(2).length - 1;
  return emsaPssVerify(
    partiallyBlindMessage(preparedMsg, info),
    encoded,
    emBits,
    PSS_SALT_LENGTH,
  );
}
