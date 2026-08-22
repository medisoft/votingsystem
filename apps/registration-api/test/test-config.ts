import type { AppConfig } from '../src/config.js';
import { generateIssuerKeyMaterial } from '../src/issuer-keys.js';

export const testIssuer = generateIssuerKeyMaterial();

/**
 * Builds an AppConfig for unit and integration tests.
 *
 * @param overrides - Optional replacements for individual config fields.
 * @returns A complete test configuration including an ephemeral Ed25519 issuer key.
 */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3001,
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://x:x@localhost:5432/x',
    ADMIN_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    ISSUER_PRIVATE_KEY: testIssuer.privateKeyPkcs8DerBase64url,
    ISSUER_KEY_VERSION: 'test-2026-01',
    ISSUER_ID: 'condominium-registration-service',
    ...overrides,
  };
}
