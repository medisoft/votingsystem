import { messages, type MessageKey } from './messages';

export type Locale = 'en' | 'es';
export type MessageValues = Record<string, string | number>;

export function detectLocale(
  languages: readonly string[] = navigator.languages,
): Locale {
  for (const language of languages) {
    const baseLanguage = language.toLowerCase().split('-')[0];
    if (baseLanguage === 'en' || baseLanguage === 'es') return baseLanguage;
  }
  return 'en';
}

export function createTranslator(locale: Locale) {
  return (key: MessageKey, values: MessageValues = {}): string => {
    let message: string = messages[key][locale] || messages[key].en;
    for (const [name, value] of Object.entries(values)) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
    return message;
  };
}
