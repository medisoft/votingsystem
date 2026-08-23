import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createTranslator,
  resolveLocale,
  storeLocale,
  type Locale,
} from './index';

type Translator = ReturnType<typeof createTranslator>;

interface I18nValue {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Provides locale, translator, and a persistent language override.
 *
 * @param children - Administrative UI tree.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveLocale());
  const t = useMemo(() => createTranslator(locale), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('pageTitle');
  }, [locale, t]);
  const setLocale = (next: Locale) => {
    storeLocale(next);
    setLocaleState(next);
  };
  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Reads the active locale and translator.
 *
 * @returns Locale helpers from the nearest I18nProvider.
 */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n requires I18nProvider');
  return value;
}
