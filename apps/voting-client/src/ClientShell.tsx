import type { ReactNode } from 'react';
import { useI18n } from './i18n/I18nProvider';
import type { Locale } from './i18n';

/**
 * Shared chrome: owner eyebrow, screen heading, and language selector.
 *
 * @param title - Visible page heading.
 * @param children - Screen body under the header.
 */
export function ClientShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { locale, t, setLocale } = useI18n();
  return (
    <main>
      <section>
        <header>
          <div>
            <p className="eyebrow">{t('eyebrow')}</p>
            <h1>{title}</h1>
          </div>
          <label className="language-select">
            {t('language')}
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              <option value="en">{t('languageEnglish')}</option>
              <option value="es">{t('languageSpanish')}</option>
            </select>
          </label>
        </header>
        {children}
      </section>
    </main>
  );
}
