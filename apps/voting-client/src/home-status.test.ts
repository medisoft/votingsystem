import { describe, expect, it } from 'vitest';
import {
  deriveVotingStatus,
  loadHomeSnapshot,
  type HomeSnapshotPorts,
} from './home-status';
import type { ScopeStatusResponse } from './registration-public-api';

const now = new Date('2026-08-23T12:00:00.000Z');

const scope = (
  overrides: Partial<ScopeStatusResponse> = {},
): ScopeStatusResponse => ({
  scopeId: '22222222-2222-4222-8222-222222222222',
  status: 'VOTING_ACTIVE',
  activationStartsAt: '2026-08-01T00:00:00.000Z',
  activationEndsAt: '2026-08-20T00:00:00.000Z',
  startsAt: '2026-08-10T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  credentialExpiresAt: '2026-12-31T00:00:00.000Z',
  acceptsActivation: false,
  issuerKeyVersion: 'v1',
  ...overrides,
});

function ports(overrides: Partial<HomeSnapshotPorts> = {}): HomeSnapshotPorts {
  return {
    online: true,
    now,
    scopeId: scope().scopeId,
    credentialExpiresAt: '2026-12-31T00:00:00.000Z',
    getScopeStatus: async () => scope(),
    getActiveProposalCount: async () => 3,
    ...overrides,
  };
}

describe('deriveVotingStatus', () => {
  it('reports open when the voting window includes now', () => {
    expect(deriveVotingStatus(scope(), now, '2026-12-31T00:00:00.000Z')).toBe(
      'open',
    );
  });

  it('reports activation open before voting starts', () => {
    expect(
      deriveVotingStatus(
        scope({
          status: 'ACTIVATION_OPEN',
          startsAt: '2026-09-01T00:00:00.000Z',
        }),
        now,
        '2026-12-31T00:00:00.000Z',
      ),
    ).toBe('activationOpen');
  });

  it('reports closed after the voting window', () => {
    expect(
      deriveVotingStatus(
        scope({ endsAt: '2026-08-01T00:00:00.000Z' }),
        now,
        '2026-12-31T00:00:00.000Z',
      ),
    ).toBe('closed');
  });

  it('reports credential expired even if voting is open', () => {
    expect(deriveVotingStatus(scope(), now, '2026-08-01T00:00:00.000Z')).toBe(
      'credentialExpired',
    );
  });
});

describe('loadHomeSnapshot', () => {
  it('returns online status, last sync, and proposal count', async () => {
    await expect(loadHomeSnapshot(ports())).resolves.toEqual({
      connection: 'online',
      lastSyncedAt: now.toISOString(),
      votingStatus: 'open',
      activeProposalCount: 3,
    });
  });

  it('skips the network when the browser is offline', async () => {
    const getScopeStatus = async () => {
      throw new Error('should not fetch');
    };
    await expect(
      loadHomeSnapshot(ports({ online: false, getScopeStatus })),
    ).resolves.toEqual({
      connection: 'offline',
      lastSyncedAt: null,
      votingStatus: 'unknown',
      activeProposalCount: null,
    });
  });

  it('marks the service unreachable when the scope fetch fails', async () => {
    await expect(
      loadHomeSnapshot(
        ports({
          getScopeStatus: async () => {
            throw new Error('network');
          },
        }),
      ),
    ).resolves.toEqual({
      connection: 'unreachable',
      lastSyncedAt: null,
      votingStatus: 'unknown',
      activeProposalCount: null,
    });
  });
});
