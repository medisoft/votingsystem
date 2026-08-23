import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ClientShell } from './ClientShell';
import { RequireCredential } from './RequireCredential';
import {
  fetchHomeSnapshot,
  type ConnectionStatus,
  type HomeSnapshot,
  type VotingStatusKind,
} from './home-status';
import { useI18n } from './i18n/I18nProvider';
import type { MessageKey } from './i18n/messages';
import { clientRoutes } from './routes';
import { useClientStore } from './store';

const votingStatusMessages: Record<VotingStatusKind, MessageKey> = {
  open: 'votingStatusOpen',
  notStarted: 'votingStatusNotStarted',
  closed: 'votingStatusClosed',
  activationOpen: 'votingStatusActivationOpen',
  notOpen: 'votingStatusNotOpen',
  archived: 'votingStatusArchived',
  credentialExpired: 'votingStatusCredentialExpired',
  unknown: 'votingStatusUnknown',
};

const connectionMessages: Record<ConnectionStatus, MessageKey> = {
  online: 'connectionOnline',
  offline: 'connectionOffline',
  unreachable: 'connectionUnreachable',
};

/**
 * Formats an ISO timestamp with the active locale.
 *
 * @param value - ISO-8601 instant.
 * @param locale - UI locale.
 * @returns Long date and short time, or empty when missing.
 */
function formatSyncTime(value: string | null, locale: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'es', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

/**
 * Home body: voting status, proposal count, last sync, connection, and actions.
 */
function HomeBody() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const credential = useClientStore((state) => state.credential)!;
  const snapshotQuery = useQuery({
    queryKey: ['home-snapshot', credential.scopeId, credential.expiresAt],
    queryFn: () => fetchHomeSnapshot(credential.scopeId, credential.expiresAt),
    retry: false,
  });
  const refetchSnapshot = snapshotQuery.refetch;

  useEffect(() => {
    const refresh = () => {
      void refetchSnapshot();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, [refetchSnapshot]);

  const snapshot: HomeSnapshot | undefined = snapshotQuery.data;
  const lastSyncLabel = snapshot?.lastSyncedAt
    ? t('lastSyncAt', { date: formatSyncTime(snapshot.lastSyncedAt, locale) })
    : t('lastSyncNever');
  const proposalLabel =
    snapshot?.activeProposalCount == null
      ? t('activeProposalsUnknown')
      : t('activeProposalCount', { count: snapshot.activeProposalCount });

  return (
    <ClientShell title={t('homeTitle')}>
      {snapshotQuery.isPending && <p role="status">{t('homeLoading')}</p>}
      <dl className="status-list">
        <div>
          <dt>{t('homeVotingStatus')}</dt>
          <dd>
            {snapshot
              ? t(votingStatusMessages[snapshot.votingStatus])
              : t('votingStatusUnknown')}
          </dd>
        </div>
        <div>
          <dt>{t('homeActiveProposals')}</dt>
          <dd>{proposalLabel}</dd>
        </div>
        <div>
          <dt>{t('homeLastSync')}</dt>
          <dd>{lastSyncLabel}</dd>
        </div>
        <div>
          <dt>{t('homeConnection')}</dt>
          <dd>
            {snapshot
              ? t(connectionMessages[snapshot.connection])
              : t('connectionUnreachable')}
          </dd>
        </div>
      </dl>
      <div className="actions">
        <button type="button" onClick={() => navigate(clientRoutes.proposals)}>
          {t('viewProposals')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => navigate(clientRoutes.votes)}
        >
          {t('myVotes')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => navigate(clientRoutes.settings)}
        >
          {t('settings')}
        </button>
      </div>
    </ClientShell>
  );
}

/**
 * Owner home screen after a credential is stored on this device.
 */
export function Home() {
  return (
    <RequireCredential>
      <HomeBody />
    </RequireCredential>
  );
}
