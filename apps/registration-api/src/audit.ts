import { createHash, randomUUID } from 'node:crypto';
import { ActorType, Prisma, type PrismaClient } from '@prisma/client';

export const AUDIT_CHAIN_LOCK = 2026082209;

export interface AuditInput {
  actorType: ActorType;
  actorId?: string | null;
  eventType: string;
  targetType: string;
  targetId?: string | null;
  sourceIp?: string | null;
  metadata?: Prisma.InputJsonObject;
}

export interface AuditChainFields {
  id: string;
  chainIndex: number;
  occurredAt: Date;
  actorType: ActorType;
  actorId: string | null;
  eventType: string;
  targetType: string;
  targetId: string | null;
  sourceIp: string | null;
  metadata: Prisma.JsonValue;
  previousHash: string | null;
  eventHash: string;
}

export interface AuditChainVerification {
  valid: boolean;
  eventCount: number;
  tipHash: string | null;
  reason?: string;
}

type AuditDb = PrismaClient | Prisma.TransactionClient;

/**
 * Recursively sorts object keys so audit metadata hashes are stable.
 *
 * @param value - JSON-compatible audit metadata or nested value.
 * @returns A value whose object keys are lexicographically ordered.
 */
export function sortJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortJson((value as Record<string, unknown>)[key])]),
  );
}

/**
 * Builds the canonical JSON hashed for one audit-chain entry.
 *
 * @param event - Stored or about-to-store audit fields except eventHash.
 * @returns UTF-8 JSON with a fixed field order.
 */
export function canonicalizeAuditEvent(event: {
  id: string;
  occurredAt: Date | string;
  actorType: ActorType | string;
  actorId?: string | null;
  eventType: string;
  targetType: string;
  targetId?: string | null;
  sourceIp?: string | null;
  metadata?: unknown;
  previousHash?: string | null;
}): string {
  const occurredAt =
    event.occurredAt instanceof Date
      ? event.occurredAt.toISOString()
      : event.occurredAt;
  return JSON.stringify({
    id: event.id,
    occurredAt,
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    eventType: event.eventType,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    sourceIp: event.sourceIp ?? null,
    metadata: sortJson(event.metadata ?? {}),
    previousHash: event.previousHash ?? null,
  });
}

/**
 * SHA-256 digest of the canonical audit-event payload.
 *
 * @param event - Fields included in the hash chain.
 * @returns Lowercase hexadecimal digest stored as eventHash.
 */
export function hashAuditEvent(
  event: Parameters<typeof canonicalizeAuditEvent>[0],
): string {
  return createHash('sha256')
    .update(canonicalizeAuditEvent(event))
    .digest('hex');
}

/**
 * Verifies hash links and stored digests for an ordered audit chain.
 *
 * @param events - Events sorted by chainIndex ascending.
 * @returns Whether the chain is intact and the first broken entry, if any.
 */
export function verifyAuditChain(
  events: AuditChainFields[],
): AuditChainVerification {
  if (events.length === 0) return { valid: true, eventCount: 0, tipHash: null };
  let previousHash: string | null = null;
  let previousIndex: number | null = null;
  for (const event of events) {
    if (previousIndex !== null && event.chainIndex !== previousIndex + 1)
      return {
        valid: false,
        eventCount: events.length,
        tipHash: events.at(-1)?.eventHash ?? null,
        reason: `chainIndex gap before ${event.id}`,
      };
    if (event.previousHash !== previousHash)
      return {
        valid: false,
        eventCount: events.length,
        tipHash: events.at(-1)?.eventHash ?? null,
        reason: `previousHash mismatch at ${event.id}`,
      };
    const expected = hashAuditEvent(event);
    if (expected !== event.eventHash)
      return {
        valid: false,
        eventCount: events.length,
        tipHash: events.at(-1)?.eventHash ?? null,
        reason: `eventHash mismatch at ${event.id}`,
      };
    previousHash = event.eventHash;
    previousIndex = event.chainIndex;
  }
  return {
    valid: true,
    eventCount: events.length,
    tipHash: events.at(-1)?.eventHash ?? null,
  };
}

/**
 * Loads persisted audit events in chain order and verifies the hash chain.
 *
 * @param prisma - Prisma client or open transaction.
 * @returns Verification result for the current table contents.
 */
export async function verifyStoredAuditChain(
  prisma: AuditDb,
): Promise<AuditChainVerification> {
  const events = await prisma.auditEvent.findMany({
    orderBy: { chainIndex: 'asc' },
  });
  return verifyAuditChain(events);
}

function isClient(db: AuditDb): db is PrismaClient {
  return '$transaction' in db;
}

/**
 * Appends one hash-linked audit event under an exclusive chain lock.
 *
 * @param prisma - Prisma client or the transaction already writing related rows.
 * @param input - Actor, target, and non-secret metadata for the event.
 * @returns The persisted audit row, including chainIndex and hashes.
 */
export async function appendAudit(prisma: AuditDb, input: AuditInput) {
  const write = async (tx: AuditDb) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`,
    );
    const previous = await tx.auditEvent.findFirst({
      orderBy: { chainIndex: 'desc' },
      select: { eventHash: true },
    });
    const id = randomUUID();
    const occurredAt = new Date();
    const metadata = (input.metadata ?? {}) as Prisma.InputJsonObject;
    const previousHash = previous?.eventHash ?? null;
    const eventHash = hashAuditEvent({
      id,
      occurredAt,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      sourceIp: input.sourceIp ?? null,
      metadata,
      previousHash,
    });
    return tx.auditEvent.create({
      data: {
        id,
        occurredAt,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        eventType: input.eventType,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        sourceIp: input.sourceIp ?? null,
        metadata,
        previousHash,
        eventHash,
      },
    });
  };
  if (isClient(prisma)) return prisma.$transaction((tx) => write(tx));
  return write(prisma);
}
