import { VotingScopeStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { scopeAcceptsActivation } from '../src/scopes.js';

function sampleScope(
  overrides: Partial<Parameters<typeof scopeAcceptsActivation>[0]> = {},
) {
  const now = Date.parse('2026-08-22T12:00:00.000Z');
  return {
    status: VotingScopeStatus.ACTIVATION_OPEN,
    activationStartsAt: new Date(now - 3_600_000),
    activationEndsAt: new Date(now + 3_600_000),
    credentialExpiresAt: new Date(now + 86_400_000),
    ...overrides,
  };
}

describe('scopeAcceptsActivation', () => {
  const now = new Date('2026-08-22T12:00:00.000Z');

  it('accepts an open activation window', () => {
    expect(scopeAcceptsActivation(sampleScope(), now)).toBe(true);
  });

  it('rejects draft and other non-activation statuses', () => {
    expect(
      scopeAcceptsActivation(
        sampleScope({ status: VotingScopeStatus.DRAFT }),
        now,
      ),
    ).toBe(false);
    expect(
      scopeAcceptsActivation(
        sampleScope({ status: VotingScopeStatus.VOTING_ACTIVE }),
        now,
      ),
    ).toBe(false);
  });

  it('rejects before the activation start and at the activation end', () => {
    expect(
      scopeAcceptsActivation(
        sampleScope({
          activationStartsAt: new Date('2026-08-22T13:00:00.000Z'),
        }),
        now,
      ),
    ).toBe(false);
    expect(
      scopeAcceptsActivation(
        sampleScope({
          activationEndsAt: now,
        }),
        now,
      ),
    ).toBe(false);
  });

  it('rejects when credentials have already expired', () => {
    expect(
      scopeAcceptsActivation(
        sampleScope({
          credentialExpiresAt: now,
        }),
        now,
      ),
    ).toBe(false);
  });
});
