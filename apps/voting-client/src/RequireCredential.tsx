import { Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { ClientShell } from './ClientShell';
import { useI18n } from './i18n/I18nProvider';
import { clientRoutes } from './routes';
import { useHydratedCredential } from './useHydratedCredential';

/**
 * Blocks owner screens until a credential is present on this device.
 *
 * @param children - Screen rendered after the vault has a credential.
 */
export function RequireCredential({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { ready, credential } = useHydratedCredential();
  if (!ready) {
    return (
      <ClientShell title={t('homeTitle')}>
        <p role="status">{t('homeLoading')}</p>
      </ClientShell>
    );
  }
  if (!credential) {
    return <Navigate to={clientRoutes.welcome} replace />;
  }
  return children;
}
