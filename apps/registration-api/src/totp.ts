import * as OTPAuth from 'otpauth';

const ISSUER = 'Condominium Registration';
const TOTP_OPTIONS = {
  issuer: ISSUER,
  algorithm: 'SHA1' as const,
  digits: 6,
  period: 30,
};

/**
 * Builds a standard TOTP generator for an administrator secret.
 *
 * @param email - Account email used as the authenticator label.
 * @param secret - Base32 TOTP secret.
 * @returns A SHA-1, 6-digit, 30-second TOTP instance.
 */
function totpFor(email: string, secret: string) {
  return new OTPAuth.TOTP({
    ...TOTP_OPTIONS,
    label: email,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/**
 * Creates a new 160-bit Base32 TOTP secret.
 *
 * @returns A Base32-encoded secret suitable for authenticator apps.
 */
export function generateTotpSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/**
 * Builds an otpauth URL for authenticator enrollment.
 *
 * @param email - Administrator email shown as the authenticator label.
 * @param secret - Base32 TOTP secret to encode in the URL.
 * @returns An otpauth://totp URL.
 */
export function totpAuthUrl(email: string, secret: string) {
  return totpFor(email, secret).toString();
}

/**
 * Generates the current TOTP code for a secret.
 *
 * @param secret - Base32 TOTP secret.
 * @returns The current 6-digit code.
 */
export function generateTotpCode(secret: string) {
  return totpFor(ISSUER, secret).generate();
}

/**
 * Verifies a TOTP code with a one-period clock skew window.
 *
 * @param secret - Base32 TOTP secret stored for the administrator.
 * @param token - 6-digit code submitted by the administrator.
 * @returns True when the code is valid for the current or adjacent period.
 */
export function verifyTotp(secret: string, token: string) {
  return totpFor(ISSUER, secret).validate({ token, window: 1 }) !== null;
}
