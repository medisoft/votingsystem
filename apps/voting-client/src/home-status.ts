import type { ScopeStatusResponse } from './registration-public-api';
import { getScopeStatus } from './registration-public-api';

export type ConnectionStatus = 'online' | 'offline' | 'unreachable';

export type VotingStatusKind =
  | 'open'
  | 'notStarted'
  | 'closed'
  | 'activationOpen'
  | 'notOpen'
  | 'archived'
  | 'credentialExpired'
  | 'unknown';

export interface HomeSnapshot {
  connection: ConnectionStatus;
  lastSyncedAt: string | null;
  votingStatus: VotingStatusKind;
  activeProposalCount: number | null;
}

export interface HomeSnapshotPorts {
  online: boolean;
  now: Date;
  scopeId: string;
  credentialExpiresAt: string;
  getScopeStatus: (scopeId: string) => Promise<ScopeStatusResponse>;
  getActiveProposalCount: () => Promise<number>;
}

/**
 * Maps a public scope payload to the owner-facing voting status.
 *
 * @param scope - Windows and status from the registration service.
 * @param now - Instant used for window comparison.
 * @param credentialExpiresAt - Expiry from the stored credential metadata.
 * @returns Status kind shown on the home screen.
 */
export function deriveVotingStatus(
  scope: Pick<ScopeStatusResponse, 'status' | 'startsAt' | 'endsAt'>,
  now: Date,
  credentialExpiresAt: string,
): VotingStatusKind {
  if (now >= new Date(credentialExpiresAt)) return 'credentialExpired';
  if (scope.status === 'ARCHIVED') return 'archived';
  if (scope.status === 'DRAFT' || scope.status === 'REGISTRATION_OPEN') {
    return 'notOpen';
  }
  const startsAt = new Date(scope.startsAt);
  const endsAt = new Date(scope.endsAt);
  if (now < startsAt) {
    return scope.status === 'ACTIVATION_OPEN' ? 'activationOpen' : 'notStarted';
  }
  if (now >= endsAt || scope.status === 'CLOSED') return 'closed';
  return 'open';
}

/**
 * Builds the home-screen snapshot from connection, scope status, and proposal count.
 *
 * The voting service is not available yet, so `getActiveProposalCount` is a
 * local port (currently zero). Last sync is the last successful scope fetch.
 *
 * @param ports - Clock, connectivity, and fetch functions.
 * @returns Display fields for the home screen.
 */
export async function loadHomeSnapshot(
  ports: HomeSnapshotPorts,
): Promise<HomeSnapshot> {
  if (!ports.online) {
    return {
      connection: 'offline',
      lastSyncedAt: null,
      votingStatus: 'unknown',
      activeProposalCount: null,
    };
  }
  try {
    const [scope, count] = await Promise.all([
      ports.getScopeStatus(ports.scopeId),
      ports.getActiveProposalCount(),
    ]);
    return {
      connection: 'online',
      lastSyncedAt: ports.now.toISOString(),
      votingStatus: deriveVotingStatus(
        scope,
        ports.now,
        ports.credentialExpiresAt,
      ),
      activeProposalCount: count,
    };
  } catch {
    return {
      connection: 'unreachable',
      lastSyncedAt: null,
      votingStatus: 'unknown',
      activeProposalCount: null,
    };
  }
}

/**
 * Local proposal count until the voting service and Stage 5 exist.
 *
 * @returns Zero active proposals.
 */
export async function getActiveProposalCount(): Promise<number> {
  return 0;
}

/**
 * Loads the live home snapshot using the browser connection flag.
 *
 * @param scopeId - Scope from the stored credential.
 * @param credentialExpiresAt - Credential expiry used for status.
 * @param now - Optional clock override for tests.
 * @returns Snapshot shown on the home screen.
 */
export async function fetchHomeSnapshot(
  scopeId: string,
  credentialExpiresAt: string,
  now: Date = new Date(),
): Promise<HomeSnapshot> {
  return loadHomeSnapshot({
    online: navigator.onLine,
    now,
    scopeId,
    credentialExpiresAt,
    getScopeStatus,
    getActiveProposalCount,
  });
}
