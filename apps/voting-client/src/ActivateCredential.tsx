import { Link } from 'react-router';
import { ClientShell } from './ClientShell';
import { useI18n } from './i18n/I18nProvider';
import { clientRoutes } from './routes';

/**
 * Placeholder destination for the welcome-screen activation button.
 * Camera QR scanning is Stage 2 and is not implemented here.
 */
export function ActivateCredential() {
  const { t } = useI18n();
  return (
    <ClientShell title={t('activateTitle')}>
      <p>{t('activatePlaceholder')}</p>
      <p>
        <Link to={clientRoutes.welcome}>{t('backToWelcome')}</Link>
      </p>
    </ClientShell>
  );
}
