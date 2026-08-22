import { ActorType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeAuditEvent,
  hashAuditEvent,
  verifyAuditChain,
  type AuditChainFields,
} from '../src/audit.js';
import {
  activationSummaryCsv,
  credentialStatusCsv,
  registrationSummaryCsv,
  rowsToCsv,
} from '../src/reports.js';

const occurredAt = new Date('2026-08-22T18:00:00.000Z');

function event(overrides: Partial<AuditChainFields> = {}): AuditChainFields {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    chainIndex: 1,
    occurredAt,
    actorType: ActorType.ADMIN,
    actorId: '22222222-2222-4222-8222-222222222222',
    eventType: 'ADMIN_LOGIN_SUCCEEDED',
    targetType: 'AdminUser',
    targetId: '22222222-2222-4222-8222-222222222222',
    sourceIp: '127.0.0.1',
    metadata: { email: 'admin@example.com' },
    previousHash: null,
    eventHash: '',
  };
  const merged = { ...base, ...overrides };
  return { ...merged, eventHash: hashAuditEvent(merged) };
}

describe('audit hash chain', () => {
  it('canonicalizes metadata key order', () => {
    const left = canonicalizeAuditEvent({
      id: 'id',
      occurredAt,
      actorType: ActorType.SYSTEM,
      eventType: 'TEST',
      targetType: 'X',
      metadata: { b: 1, a: { d: 2, c: 3 } },
      previousHash: null,
    });
    const right = canonicalizeAuditEvent({
      id: 'id',
      occurredAt,
      actorType: ActorType.SYSTEM,
      eventType: 'TEST',
      targetType: 'X',
      metadata: { a: { c: 3, d: 2 }, b: 1 },
      previousHash: null,
    });
    expect(left).toBe(right);
    expect(left).toContain('"metadata":{"a":{"c":3,"d":2},"b":1}');
  });

  it('detects a modified historical event', () => {
    const first = event();
    const second = event({
      id: '33333333-3333-4333-8333-333333333333',
      chainIndex: 2,
      eventType: 'ADMIN_LOGOUT',
      previousHash: first.eventHash,
    });
    expect(verifyAuditChain([first, second])).toMatchObject({
      valid: true,
      eventCount: 2,
      tipHash: second.eventHash,
    });
    const tampered = { ...first, metadata: { email: 'other@example.com' } };
    expect(verifyAuditChain([tampered, second]).valid).toBe(false);
    expect(verifyAuditChain([tampered, second]).reason).toMatch(
      /eventHash mismatch/,
    );
  });

  it('detects a broken previousHash link and chainIndex gap', () => {
    const first = event();
    const second = event({
      id: '33333333-3333-4333-8333-333333333333',
      chainIndex: 2,
      previousHash: '0'.repeat(64),
    });
    expect(verifyAuditChain([first, second]).reason).toMatch(
      /previousHash mismatch/,
    );
    const skipped = event({
      id: '44444444-4444-4444-8444-444444444444',
      chainIndex: 3,
      previousHash: first.eventHash,
    });
    expect(verifyAuditChain([first, skipped]).reason).toMatch(/chainIndex gap/);
  });
});

describe('report CSV', () => {
  it('quotes commas and does not emit activation secrets', () => {
    const csv = rowsToCsv(['name'], [['opaque,token']]);
    expect(csv).toBe('"name"\n"opaque,token"');
    const registration = registrationSummaryCsv({
      generatedAt: occurredAt.toISOString(),
      totalRecords: 2,
      eligibleRecords: 1,
      ineligibleRecords: 1,
      activeRecords: 2,
      inactiveRecords: 0,
      notYetActivated: 1,
      byScope: [
        {
          scopeId: 'scope-1',
          scopeName: 'Assembly, 2026',
          eligible: 1,
          ineligible: 0,
          notYetActivated: 1,
        },
      ],
    });
    expect(registration).toContain('"GLOBAL"');
    expect(registration).toContain('"Assembly, 2026"');
    expect(registration).not.toMatch(/activationToken|rawToken|publicKey/i);
    expect(
      activationSummaryCsv({
        generatedAt: occurredAt.toISOString(),
        generated: 1,
        active: 1,
        redeemed: 0,
        expired: 0,
        revoked: 0,
        byScope: [],
      }),
    ).toContain('"generated"');
    expect(
      credentialStatusCsv({
        generatedAt: occurredAt.toISOString(),
        issued: 0,
        active: 0,
        revoked: 0,
        expired: 0,
        replaced: 0,
        byScope: [],
      }).split('\n')[0],
    ).toContain('replaced');
  });
});
