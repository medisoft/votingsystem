/**
 * Encodes bytes as canonical base64url without padding.
 *
 * @param bytes - Binary value to encode.
 * @returns Base64url text.
 */
export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/**
 * Decodes canonical base64url. Rejects padding and non-canonical encodings.
 *
 * @param encoded - Base64url text.
 * @returns Decoded bytes, or null when the encoding is invalid.
 */
export function base64urlToBytes(encoded: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const padLength = (4 - (encoded.length % 4)) % 4;
  const padded =
    encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(padLength);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (bytesToBase64url(bytes) !== encoded) return null;
    return bytes;
  } catch {
    return null;
  }
}
