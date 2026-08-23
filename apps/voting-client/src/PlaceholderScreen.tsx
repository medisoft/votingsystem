import { Link } from 'react-router';
import { ClientShell } from './ClientShell';
import { useI18n } from './i18n/I18nProvider';
import type { MessageKey } from './i18n/messages';
import { RequireCredential } from './RequireCredential';
import { clientRoutes } from './routes';

/**
 * Temporary destination for Home buttons whose screens are later stages.
 *
 * @param titleKey - Heading message.
 * @param bodyKey - Short explanation until that stage is implemented.
 */
export function PlaceholderScreen({
  titleKey,
  bodyKey,
}: {
  titleKey: MessageKey;
  bodyKey: MessageKey;
}) {
  const { t } = useI18n();
  return (
    <RequireCredential>
      <ClientShell title={t(titleKey)}>
        <p>{t(bodyKey)}</p>
        <p>
          <Link to={clientRoutes.home}>{t('backToHome')}</Link>
        </p>
      </ClientShell>
    </RequireCredential>
  );
}
