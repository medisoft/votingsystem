import type { PrismaClient } from '@prisma/client';

export interface RetentionPolicy {
  auditRetentionDays: number;
  applicationLogRetentionDays: number;
  sourceIpMode: 'truncated' | 'omitted';
}

/**
 * Instant before which hash-chained audit events are eligible to archive.
 *
 * Events are not deleted in place: rewriting or removing a hashed row would
 * break chain verification. Operators export and encrypt the archive, then
 * keep the live chain intact.
 *
 * @param now - Reference instant, normally `new Date()`.
 * @param auditRetentionDays - Inclusive live-window length.
 */
export function auditArchiveCutoff(
  now: Date,
  auditRetentionDays: number,
): Date {
  return new Date(now.getTime() - auditRetentionDays * 24 * 60 * 60_000);
}

/**
 * Counts audit events older than the configured live window.
 *
 * @param prisma - Prisma client for the registration database.
 * @param policy - Configured retention windows.
 * @param now - Reference instant.
 */
export async function countArchivableAuditEvents(
  prisma: PrismaClient,
  policy: RetentionPolicy,
  now = new Date(),
): Promise<{ cutoff: Date; eventCount: number }> {
  const cutoff = auditArchiveCutoff(now, policy.auditRetentionDays);
  const eventCount = await prisma.auditEvent.count({
    where: { occurredAt: { lt: cutoff } },
  });
  return { cutoff, eventCount };
}
