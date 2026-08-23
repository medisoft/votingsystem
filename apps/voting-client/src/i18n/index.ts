import { messages, type MessageKey } from './messages';

export type Locale = 'en' | 'es';
export type MessageValues = Record<string, string | number>;

export const LOCALE_STORAGE_KEY = 'voting-client-locale';

/**
 * Picks the first supported language from the browser preference list.
 *
 * @param languages - Ordered browser language tags.
 * @returns `en` or `es`, defaulting to Spanish to match the PWA manifest.
 */
export function detectLocale(
  languages: readonly string[] = navigator.languages,
): Locale {
  for (const language of languages) {
    const baseLanguage = language.toLowerCase().split('-')[0];
    if (baseLanguage === 'en' || baseLanguage === 'es') return baseLanguage;
  }
  return 'es';
}

/**
 * Reads a persisted locale override from web storage.
 *
 * @param storage - Storage used for the override. Defaults to localStorage.
 * @returns A supported locale, or null when none is stored.
 */
export function readStoredLocale(
  storage: Pick<Storage, 'getItem'> | null = defaultStorage(),
): Locale | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(LOCALE_STORAGE_KEY);
    return value === 'en' || value === 'es' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Persists a locale override.
 *
 * @param locale - Locale chosen in the client UI.
 * @param storage - Storage used for the override. Defaults to localStorage.
 */
export function storeLocale(
  locale: Locale,
  storage: Pick<Storage, 'setItem'> | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* Private mode or quota. Detection still works next visit. */
  }
}

/**
 * Resolves the UI locale from a stored override, then browser languages.
 *
 * @param languages - Ordered browser language preferences.
 * @param stored - Optional stored override, already parsed.
 */
export function resolveLocale(
  languages: readonly string[] = navigator.languages,
  stored: Locale | null = readStoredLocale(),
): Locale {
  return stored ?? detectLocale(languages);
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * Builds a translator for one locale.
 *
 * @param locale - Active UI locale.
 * @returns Function that resolves a message key, with `{name}` interpolation.
 */
export function createTranslator(locale: Locale) {
  return (key: MessageKey, values: MessageValues = {}): string => {
    let message: string = messages[key][locale] || messages[key].en;
    for (const [name, value] of Object.entries(values)) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
    return message;
  };
}
