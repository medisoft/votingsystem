import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyProductionClientCsp,
  DEV_CLIENT_CSP,
  PROD_CLIENT_CSP,
} from './csp';

const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../index.html'),
  'utf8',
);

describe('voting client CSP', () => {
  it('keeps eval only in the development index.html', () => {
    expect(DEV_CLIENT_CSP).toContain("'unsafe-eval'");
    expect(indexHtml).toContain(DEV_CLIENT_CSP);
  });

  it('strips eval from the production policy used at build time', () => {
    expect(PROD_CLIENT_CSP).not.toContain('unsafe-eval');
    expect(PROD_CLIENT_CSP).toContain("worker-src 'self'");
    const produced = applyProductionClientCsp(indexHtml);
    expect(produced).toContain(PROD_CLIENT_CSP);
    expect(produced).not.toContain('unsafe-eval');
  });
});
