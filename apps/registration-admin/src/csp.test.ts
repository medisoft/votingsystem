import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyProductionAdminCsp, DEV_ADMIN_CSP, PROD_ADMIN_CSP } from './csp';

const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../index.html'),
  'utf8',
);

describe('administrative CSP', () => {
  it('keeps eval only in the development index.html', () => {
    expect(DEV_ADMIN_CSP).toContain("'unsafe-eval'");
    expect(indexHtml).toContain(DEV_ADMIN_CSP);
  });

  it('strips eval from the production policy used at build time', () => {
    expect(PROD_ADMIN_CSP).not.toContain('unsafe-eval');
    const produced = applyProductionAdminCsp(indexHtml);
    expect(produced).toContain(PROD_ADMIN_CSP);
    expect(produced).not.toContain('unsafe-eval');
  });
});
