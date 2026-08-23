import { Navigate, useNavigate } from 'react-router';
import { ClientShell } from './ClientShell';
import { useI18n } from './i18n/I18nProvider';
import { clientRoutes } from './routes';
import { useHydratedCredential } from './useHydratedCredential';
import { useInstallPrompt } from './useInstallPrompt';

/**
 * First owner-facing screen: product name, short explanation, and activation.
 */
export function Welcome() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { credential } = useHydratedCredential();
  const { canInstall, install, showIosHint } = useInstallPrompt();
  if (credential) {
    return <Navigate to={clientRoutes.home} replace />;
  }
  return (
    <ClientShell title={t('projectName')}>
      <p>{t('welcomeExplanation')}</p>
      <div className="actions">
        <button type="button" onClick={() => navigate(clientRoutes.activate)}>
          {t('activateCredential')}
        </button>
        {canInstall && (
          <button
            className="secondary"
            type="button"
            onClick={() => void install()}
          >
            {t('installApp')}
          </button>
        )}
      </div>
      {showIosHint && <p>{t('iosInstallHint')}</p>}
    </ClientShell>
  );
}
