import { describe, expect, it } from 'vitest';
import { activationTokenPrefix, parseActivationQr } from './parseActivationQr';

const TOKEN = 'Aa1_-'.repeat(8) + 'xyz';

describe('parseActivationQr', () => {
  it('accepts the opaque token encoded by the administrator QR', () => {
    expect(parseActivationQr(`  ${TOKEN}  `)).toEqual({
      ok: true,
      token: TOKEN,
    });
  });

  it('extracts the token query parameter from an activation URL', () => {
    expect(
      parseActivationQr(`https://vote.example.com/activate?token=${TOKEN}&x=1`),
    ).toEqual({ ok: true, token: TOKEN });
  });

  it('accepts http URLs used in local development', () => {
    expect(
      parseActivationQr(`http://localhost:5174/activate?token=${TOKEN}`),
    ).toEqual({ ok: true, token: TOKEN });
  });

  it('rejects empty input', () => {
    expect(parseActivationQr('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects non-http(s) URLs instead of treating them as tokens', () => {
    expect(parseActivationQr('javascript:alert(1)')).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });

  it('rejects activation URLs that omit the token', () => {
    expect(parseActivationQr('https://vote.example.com/activate')).toEqual({
      ok: false,
      reason: 'missing-token',
    });
  });

  it('rejects tokens outside the URL-safe opaque charset', () => {
    expect(parseActivationQr('not a token')).toEqual({
      ok: false,
      reason: 'invalid-token',
    });
  });

  it('returns the support prefix without the full token', () => {
    expect(activationTokenPrefix(TOKEN)).toBe(TOKEN.slice(0, 8));
  });
});
