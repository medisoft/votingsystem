/** First characters shown after a scan; matches the admin support prefix. */
export const ACTIVATION_TOKEN_PREFIX_LENGTH = 8;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;

export type ParseActivationQrResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: 'empty' | 'invalid-url' | 'missing-token' | 'invalid-token';
    };

/**
 * Reads an activation token from QR text.
 *
 * Accepts the opaque token encoded by the administrator app, or an activation
 * URL such as `https://vote.example.com/activate?token=XXXXXXXX`. The scanned
 * host is ignored: only the `token` query parameter is used, and the client
 * never fetches the scanned URL.
 *
 * @param raw - Decoded QR payload, pasted text, or a `token` query value.
 * @returns The opaque token, or a reason the payload was rejected.
 */
export function parseActivationQr(raw: string): ParseActivationQrResult {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };

  if (looksLikeAbsoluteUrl(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, reason: 'invalid-url' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { ok: false, reason: 'invalid-url' };
    }
    const token = url.searchParams.get('token');
    if (!token) return { ok: false, reason: 'missing-token' };
    return parseToken(token);
  }

  return parseToken(text);
}

/**
 * Short, non-secret prefix suitable to show after a successful scan.
 *
 * @param token - Full opaque activation token.
 */
export function activationTokenPrefix(token: string): string {
  return token.slice(0, ACTIVATION_TOKEN_PREFIX_LENGTH);
}

function looksLikeAbsoluteUrl(text: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(text);
}

function parseToken(token: string): ParseActivationQrResult {
  if (!TOKEN_PATTERN.test(token)) return { ok: false, reason: 'invalid-token' };
  return { ok: true, token };
}
