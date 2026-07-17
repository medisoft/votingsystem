import {
  ActorType,
  Prisma,
  RegistrationStatus,
  VotingScopeStatus,
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';
import { canonicalUnitNumber } from './csv-import.js';
import { REGISTRATION_WRITE_LOCK } from './imports.js';

const uuid = z.string().uuid();
const weight = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((v) => /^\d{1,8}(\.\d{1,4})?$/.test(v) && Number(v) > 0);
const fields = z.object({
  unitNumber: z.string().trim().min(1).max(100),
  ownerName: z.string().trim().min(1).max(300),
  representativeName: z.string().trim().max(300).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  votingWeight: weight,
  eligible: z.boolean().default(true),
  status: z.nativeEnum(RegistrationStatus).default(RegistrationStatus.ACTIVE),
  notes: z.string().trim().max(5000).nullable().optional(),
});
const patch = fields.partial().extend({ version: z.number().int().positive() });
const clean = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
const include = {
  scopeEligibilities: {
    include: {
      votingScope: { select: { id: true, name: true, status: true } },
    },
  },
};
const auditorSelect = {
  id: true,
  eligible: true,
  status: true,
  votingWeight: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  scopeEligibilities: {
    select: {
      eligible: true,
      votingWeight: true,
      votingScope: { select: { id: true, name: true, status: true } },
    },
  },
} satisfies Prisma.RegistrationRecordSelect;

export function registerRegistrationRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/admin/registrations',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const parsed = z
        .object({
          search: z.string().optional(),
          eligible: z.enum(['true', 'false']).optional(),
          status: z.nativeEnum(RegistrationStatus).optional(),
        })
        .safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({ code: 'INVALID_QUERY' });
      const q = parsed.data;
      if (request.admin?.role === 'AUDITOR' && q.search)
        return reply.code(403).send({ code: 'AUDITOR_SEARCH_RESTRICTED' });
      const args = {
        where: {
          deletedAt: null,
          ...(q.eligible ? { eligible: q.eligible === 'true' } : {}),
          ...(q.status ? { status: q.status } : {}),
          ...(q.search
            ? {
                OR: [
                  { unitNumber: { contains: q.search, mode: 'insensitive' } },
                  { ownerName: { contains: q.search, mode: 'insensitive' } },
                  { email: { contains: q.search, mode: 'insensitive' } },
                  {
                    representativeName: {
                      contains: q.search,
                      mode: 'insensitive',
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: { unitNumber: 'asc' },
        take: 500,
      } satisfies Prisma.RegistrationRecordFindManyArgs;
      const records =
        request.admin?.role === 'AUDITOR'
          ? await app.prisma.registrationRecord.findMany({
              ...args,
              select: auditorSelect,
            })
          : await app.prisma.registrationRecord.findMany({
              ...args,
              include,
            });
      return { records };
    },
  );
  app.get(
    '/api/v1/admin/registrations/:id',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const p = z.object({ id: uuid }).safeParse(request.params);
      if (!p.success) return reply.code(400).send({ code: 'INVALID_ID' });
      const record =
        request.admin?.role === 'AUDITOR'
          ? await app.prisma.registrationRecord.findFirst({
              where: { id: p.data.id, deletedAt: null },
              select: auditorSelect,
            })
          : await app.prisma.registrationRecord.findFirst({
              where: { id: p.data.id, deletedAt: null },
              include,
            });
      return record
        ? { record }
        : reply.code(404).send({ code: 'REGISTRATION_NOT_FOUND' });
    },
  );
  app.post(
    '/api/v1/admin/registrations',
    { preHandler: app.requireRegistrationWrite },
    async (request, reply) => {
      const parsed = fields.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ code: 'INVALID_REGISTRATION', issues: parsed.error.issues });
      let record;
      try {
        record = await app.prisma.$transaction(async (tx) => {
          await tx.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
          );
          const existing = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT "id" FROM "RegistrationRecord" WHERE LOWER("unitNumber") = ${canonicalUnitNumber(parsed.data.unitNumber)} LIMIT 1`,
          );
          if (existing.length) return null;
          return tx.registrationRecord.create({
            data: {
              ...clean(parsed.data),
              votingWeight: new Prisma.Decimal(parsed.data.votingWeight),
            } as Prisma.RegistrationRecordCreateInput,
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          return reply.code(409).send({ code: 'UNIT_EXISTS' });
        throw error;
      }
      if (!record) return reply.code(409).send({ code: 'UNIT_EXISTS' });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'REGISTRATION_CREATED',
        targetType: 'RegistrationRecord',
        targetId: record.id,
        sourceIp: request.ip,
        metadata: { version: record.version },
      });
      return reply.code(201).send({ record });
    },
  );
  app.patch(
    '/api/v1/admin/registrations/:id',
    { preHandler: app.requireRegistrationWrite },
    async (request, reply) => {
      const p = z.object({ id: uuid }).safeParse(request.params),
        parsed = patch.safeParse(request.body);
      if (!p.success || !parsed.success)
        return reply.code(400).send({ code: 'INVALID_REGISTRATION' });
      const { version, ...raw } = parsed.data;
      const changes = clean(raw);
      if (raw.votingWeight)
        changes.votingWeight = new Prisma.Decimal(raw.votingWeight);
      let result;
      try {
        result = await app.prisma.$transaction(async (tx) => {
          if (raw.unitNumber)
            await tx.$executeRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_WRITE_LOCK})`,
            );
          return tx.registrationRecord.updateMany({
            where: { id: p.data.id, version, deletedAt: null },
            data: {
              ...changes,
              version: { increment: 1 },
            } as Prisma.RegistrationRecordUpdateManyMutationInput,
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          return reply.code(409).send({ code: 'UNIT_EXISTS' });
        throw error;
      }
      if (!result.count)
        return reply.code(409).send({ code: 'VERSION_CONFLICT_OR_NOT_FOUND' });
      const record = await app.prisma.registrationRecord.findUniqueOrThrow({
        where: { id: p.data.id },
        include,
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'REGISTRATION_UPDATED',
        targetType: 'RegistrationRecord',
        targetId: record.id,
        sourceIp: request.ip,
        metadata: { version: record.version },
      });
      return { record };
    },
  );
  app.delete(
    '/api/v1/admin/registrations/:id',
    { preHandler: app.requireSystemAdmin },
    async (request, reply) => {
      const p = z.object({ id: uuid }).safeParse(request.params),
        body = z
          .object({ version: z.number().int().positive() })
          .safeParse(request.body);
      if (!p.success || !body.success)
        return reply.code(400).send({ code: 'INVALID_REGISTRATION' });
      const result = await app.prisma.registrationRecord.updateMany({
        where: { id: p.data.id, version: body.data.version, deletedAt: null },
        data: {
          deletedAt: new Date(),
          status: 'INACTIVE',
          eligible: false,
          version: { increment: 1 },
        },
      });
      if (!result.count)
        return reply.code(409).send({ code: 'VERSION_CONFLICT_OR_NOT_FOUND' });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'REGISTRATION_SOFT_DELETED',
        targetType: 'RegistrationRecord',
        targetId: p.data.id,
        sourceIp: request.ip,
      });
      return reply.code(204).send();
    },
  );
  app.put(
    '/api/v1/admin/registrations/:id/scopes/:scopeId',
    { preHandler: app.requireRegistrationWrite },
    async (request, reply) => {
      const p = z.object({ id: uuid, scopeId: uuid }).safeParse(request.params),
        body = z
          .object({ eligible: z.boolean(), votingWeight: weight })
          .safeParse(request.body);
      if (!p.success || !body.success)
        return reply.code(400).send({ code: 'INVALID_ELIGIBILITY' });
      const data = {
        eligible: body.data.eligible,
        votingWeight: new Prisma.Decimal(body.data.votingWeight),
      };
      const eligibility = await app.prisma.$transaction(async (tx) => {
        const [scope] = await tx.$queryRaw<
          Array<{ id: string; status: VotingScopeStatus }>
        >(Prisma.sql`
          SELECT "id", "status"
          FROM "VotingScope"
          WHERE "id" = ${p.data.scopeId}::uuid
          FOR UPDATE
        `);
        const record = await tx.registrationRecord.findFirst({
          where: { id: p.data.id, deletedAt: null },
        });
        if (!record || !scope) return null;
        if (
          scope.status !== VotingScopeStatus.DRAFT &&
          scope.status !== VotingScopeStatus.REGISTRATION_OPEN
        )
          return 'SCOPE_REGISTRATION_CLOSED' as const;
        return tx.scopeEligibility.upsert({
          where: {
            registrationRecordId_votingScopeId: {
              registrationRecordId: record.id,
              votingScopeId: scope.id,
            },
          },
          update: data,
          create: {
            ...data,
            registrationRecordId: record.id,
            votingScopeId: scope.id,
          },
        });
      });
      if (!eligibility)
        return reply.code(404).send({ code: 'RECORD_OR_SCOPE_NOT_FOUND' });
      if (eligibility === 'SCOPE_REGISTRATION_CLOSED')
        return reply.code(409).send({ code: eligibility });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'SCOPE_ELIGIBILITY_SET',
        targetType: 'RegistrationRecord',
        targetId: p.data.id,
        sourceIp: request.ip,
        metadata: {
          scopeId: p.data.scopeId,
          eligible: eligibility.eligible,
          weight: eligibility.votingWeight.toFixed(4),
        },
      });
      return { eligibility };
    },
  );
}
