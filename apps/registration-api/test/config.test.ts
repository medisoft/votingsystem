import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { generateIssuerKeyMaterial } from '../src/issuer-keys.js';

const issuer = generateIssuerKeyMaterial();
const required = {
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  ISSUER_PRIVATE_KEY: issuer.privateKeyPkcs8DerBase64url,
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
});

it('loads an issuer private key from a mounted secret file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'issuer-key-'));
  const file = join(directory, 'issuer.pem');
  writeFileSync(
    file,
    `-----BEGIN PRIVATE KEY-----\n${Buffer.from(issuer.privateKeyPkcs8DerBase64url, 'base64url').toString('base64')}\n-----END PRIVATE KEY-----\n`,
  );
  const loaded = loadConfig({
    DATABASE_URL: required.DATABASE_URL,
    ISSUER_PRIVATE_KEY_FILE: file,
    ISSUER_KEY_VERSION: 'file-2026-01',
  });
  expect(loaded.ISSUER_KEY_VERSION).toBe('file-2026-01');
  expect(loaded.ISSUER_PRIVATE_KEY).toContain('BEGIN PRIVATE KEY');
});
