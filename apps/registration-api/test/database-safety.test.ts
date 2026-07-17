import { describe, expect, it } from 'vitest';
import { assertSafeTestDatabase } from './database-safety.js';

describe('integration database safety', () => {
  it('accepts only the dedicated test database', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://voting:voting@localhost:15433/registration_test?schema=public',
      ),
    ).not.toThrow();
  });

  it('rejects the development database even when reset is requested', () => {
    expect(() =>
      assertSafeTestDatabase(
        'postgresql://voting:voting@localhost:15432/registration?schema=public',
      ),
    ).toThrow('Refusing to reset database "registration"');
  });

  it('rejects malformed and unnamed database URLs', () => {
    expect(() => assertSafeTestDatabase('not-a-url')).toThrow(
      'valid DATABASE_URL',
    );
    expect(() =>
      assertSafeTestDatabase('postgresql://voting:voting@localhost:15433'),
    ).toThrow('Refusing to reset database "(missing)"');
  });
});
