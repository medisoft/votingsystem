import { describe, expect, it } from 'vitest';
import { createTranslator, detectLocale } from '.';

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
});
