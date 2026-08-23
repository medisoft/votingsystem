import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCALE_STORAGE_KEY,
  createTranslator,
  detectLocale,
  readStoredLocale,
  resolveLocale,
  storeLocale,
} from '.';

afterEach(() => {
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
});

describe('internationalization', () => {
  it('selects the first supported browser language', () => {
    expect(detectLocale(['fr-FR', 'es-MX', 'en-US'])).toBe('es');
    expect(detectLocale(['en-US', 'es-MX'])).toBe('en');
  });

  it('falls back to Spanish when no supported language is detected', () => {
    expect(detectLocale(['fr-FR', 'de-DE'])).toBe('es');
  });

  it('returns localized welcome messages', () => {
    expect(createTranslator('en')('activateCredential')).toBe(
      'Activate credential',
    );
    expect(createTranslator('es')('activateCredential')).toBe(
      'Activar credencial',
    );
    expect(createTranslator('en')('projectName')).toBe('Voting system');
    expect(createTranslator('en')('scanSuccess', { prefix: 'Aa1_-Aa1' })).toBe(
      'Activation code received (Aa1_-Aa1…).',
    );
  });

  it('prefers a stored locale over browser languages', () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    expect(readStoredLocale(fake)).toBeNull();
    storeLocale('en', fake);
    expect(readStoredLocale(fake)).toBe('en');
    expect(resolveLocale(['es-MX'], readStoredLocale(fake))).toBe('en');
  });
});
