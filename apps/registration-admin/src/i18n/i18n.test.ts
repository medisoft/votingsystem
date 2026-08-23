import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  detectLocale,
  readStoredLocale,
  resolveLocale,
  storeLocale,
} from '.';

describe('internationalization', () => {
  it('selects the first supported browser language', () => {
    expect(detectLocale(['fr-FR', 'es-MX', 'en-US'])).toBe('es');
    expect(detectLocale(['en-US', 'es-MX'])).toBe('en');
  });

  it('falls back to English when no supported language is detected', () => {
    expect(detectLocale(['fr-FR', 'de-DE'])).toBe('en');
    expect(createTranslator('en')('loginTitle')).toBe('Sign in');
    expect(createTranslator('en')('pageTitle')).toBe(
      'Voting system — Registration',
    );
    expect(createTranslator('en')('csvImport')).toBe('Import CSV');
  });

  it('returns Spanish messages when Spanish is selected', () => {
    expect(createTranslator('es')('loginTitle')).toBe('Iniciar sesión');
    expect(createTranslator('es')('pageTitle')).toBe(
      'Sistema de votación — Registro',
    );
  });

  it('interpolates values in localized messages', () => {
    expect(createTranslator('en')('deactivateConfirm', { unit: 'A-101' })).toBe(
      'Deactivate A-101? Its history will be preserved.',
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
    storeLocale('es', fake);
    expect(readStoredLocale(fake)).toBe('es');
    expect(resolveLocale(['en-US'], readStoredLocale(fake))).toBe('es');
  });
});
