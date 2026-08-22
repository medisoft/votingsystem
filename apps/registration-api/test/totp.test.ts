import { describe, expect, it } from 'vitest';
import {
  generateTotpCode,
  generateTotpSecret,
  totpAuthUrl,
  verifyTotp,
} from '../src/totp.js';

describe('TOTP helpers', () => {
  it('creates unique secrets and otpauth URLs that verify current codes', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(generateTotpSecret()).not.toBe(secret);
    const url = totpAuthUrl('admin@example.com', secret);
    expect(url).toContain('otpauth://totp/');
    expect(decodeURIComponent(url)).toContain('admin@example.com');
    expect(url).not.toContain('password');
    const code = generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });
});
