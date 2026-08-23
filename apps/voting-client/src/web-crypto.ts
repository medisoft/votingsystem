/**
 * Returns the Web Crypto SubtleCrypto implementation used for local key work.
 *
 * @returns The browser (or Node) SubtleCrypto interface.
 */
export function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto API is not available');
  return subtle;
}
