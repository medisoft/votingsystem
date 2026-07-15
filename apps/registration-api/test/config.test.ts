import { expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
it('validates environment', () => {
  expect(() => loadConfig({})).toThrow();
  expect(
    loadConfig({
      DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
      PORT: '4000',
    }).PORT,
  ).toBe(4000);
});
