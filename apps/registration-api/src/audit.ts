import { createHash, randomUUID } from 'node:crypto';
import { ActorType, Prisma, type PrismaClient } from '@prisma/client';

interface AuditInput {
  actorType: ActorType;
  actorId?: string;
  eventType: string;
  targetType: string;
  targetId?: string;
  sourceIp?: string;
  metadata?: Prisma.InputJsonObject;
}

export async function appendAudit(prisma: PrismaClient, input: AuditInput) {
  const previous = await prisma.auditEvent.findFirst({
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });
  const id = randomUUID();
  const occurredAt = new Date();
  const metadata = input.metadata ?? {};
  const eventHash = createHash('sha256')
    .update(
      JSON.stringify({
        id,
        occurredAt: occurredAt.toISOString(),
        ...input,
        metadata,
        previousHash: previous?.eventHash ?? null,
      }),
    )
    .digest('hex');
  return prisma.auditEvent.create({
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
      previousHash: previous?.eventHash ?? null,
      eventHash,
    },
  });
}
