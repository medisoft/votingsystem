import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { pkcs8DerToPem } from '../src/issuer-keys.js';
import { testIssuerPrivateKey } from './test-config.js';

const required = {
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  ISSUER_PRIVATE_KEY: testIssuerPrivateKey,
  ISSUER_KEY_VERSION: 'test-2026-01',
};

it('validates environment', () => {
  expect(() => loadConfig({})).toThrow();
  expect(() => loadConfig({ DATABASE_URL: required.DATABASE_URL })).toThrow();
  expect(loadConfig(required).PORT).toBe(3001);
  expect(
    loadConfig({
      ...required,
      PORT: '4000',
    }).PORT,
  ).toBe(4000);
  expect(loadConfig(required).ISSUER_ID).toBe(
    'condominium-registration-service',
  );
  expect(loadConfig(required).AUDIT_RETENTION_DAYS).toBe(2555);
  expect(loadConfig(required).APPLICATION_LOG_RETENTION_DAYS).toBe(30);
  expect(loadConfig(required).SOURCE_IP_MODE).toBe('truncated');
  expect(loadConfig(required).CSRF_ORIGIN_CHECK).toBe(true);
  expect(loadConfig({ ...required, NODE_ENV: 'test' }).CSRF_ORIGIN_CHECK).toBe(
    false,
  );
  expect(
    loadConfig({ ...required, CSRF_ORIGIN_CHECK: 'true', NODE_ENV: 'test' })
      .CSRF_ORIGIN_CHECK,
  ).toBe(true);
});

it('refuses ballot-service database credentials', () => {
  expect(() =>
    loadConfig({
      ...required,
      BALLOT_DATABASE_URL: 'postgresql://ballot:ballot@localhost:5432/ballot',
    }),
  ).toThrow(/ballot-service database credentials/);
});

it('loads an issuer private key from a mounted secret file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'issuer-key-'));
  const file = join(directory, 'issuer.pem');
  writeFileSync(file, pkcs8DerToPem(testIssuerPrivateKey));
  const loaded = loadConfig({
    DATABASE_URL: required.DATABASE_URL,
    ISSUER_PRIVATE_KEY_FILE: file,
    ISSUER_KEY_VERSION: 'file-2026-01',
  });
  expect(loaded.ISSUER_KEY_VERSION).toBe('file-2026-01');
  expect(loaded.ISSUER_PRIVATE_KEY).toContain('BEGIN PRIVATE KEY');
});

it('rejects an Ed25519 issuer key leftover from the direct-signature prototype', () => {
  expect(() =>
    loadConfig({
      ...required,
      ISSUER_PRIVATE_KEY:
        'MC4CAQAwBQYDK2VwBCIEIDCy4kdw2B5wJxNs_n1-IOsJfn7KkG0u9UUM4Y_XFM31',
    }),
  ).toThrow(/must be RSA/);
});
