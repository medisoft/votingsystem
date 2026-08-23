import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router';
import { api } from './api';
import { useI18n } from './i18n/I18nProvider';
import type { Locale } from './i18n';
import type { User } from './types';

const roleMessage = {
  SYSTEM_ADMIN: 'roleSystemAdmin',
  REGISTRATION_OPERATOR: 'roleRegistrationOperator',
  AUDITOR: 'roleAuditor',
} as const;

/**
 * Authenticated chrome: primary navigation, language, and sign-out.
 *
 * @param user - Signed-in administrator.
 */
export function AdminLayout({ user }: { user: User }) {
  const { locale, t, setLocale } = useI18n();
  const client = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api('/api/v1/admin/auth/logout', { method: 'POST' }),
    onSuccess: () => client.setQueryData(['me'], null),
  });
  return (
    <main>
      <section className="wide">
        <header>
          <div>
            <p className="eyebrow">{t('admin')}</p>
            <p>
              {user.email} · {t(roleMessage[user.role])}
            </p>
          </div>
          <div className="header-actions">
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
            <button
              className="secondary"
              type="button"
              onClick={() => logout.mutate()}
            >
              {t('signOut')}
            </button>
          </div>
        </header>
        <nav aria-label={t('mainNavigation')} className="app-nav">
          <NavLink to="/" end>
            {t('navHome')}
          </NavLink>
          <NavLink to="/registrations">{t('voterRecords')}</NavLink>
          {user.role !== 'AUDITOR' && (
            <NavLink to="/import">{t('csvImport')}</NavLink>
          )}
          <NavLink to="/scopes">{t('votingScopes')}</NavLink>
          <NavLink to="/audit">{t('auditEvents')}</NavLink>
          <NavLink to="/account">{t('accountSecurity')}</NavLink>
          {user.role === 'SYSTEM_ADMIN' && (
            <NavLink to="/administrators">{t('administrators')}</NavLink>
          )}
        </nav>
        <Outlet />
      </section>
    </main>
  );
}
