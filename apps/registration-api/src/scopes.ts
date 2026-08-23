import { ActorType, Prisma, VotingScopeStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';

const idParams = z.object({ id: z.string().uuid() });
const scopeShape = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  votingWeightsEnabled: z.boolean().default(false),
  issuerKeyVersion: z.string().trim().min(1).max(100),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  activationStartsAt: z.coerce.date(),
  activationEndsAt: z.coerce.date(),
  credentialExpiresAt: z.coerce.date(),
});
const fields = scopeShape.superRefine((v, ctx) => {
  if (v.activationStartsAt > v.activationEndsAt)
    ctx.addIssue({
      code: 'custom',
      message: 'Activation start must precede activation end',
    });
  if (v.startsAt >= v.endsAt)
    ctx.addIssue({
      code: 'custom',
      message: 'Voting start must precede voting end',
    });
  if (v.credentialExpiresAt < v.endsAt)
    ctx.addIssue({
      code: 'custom',
      message: 'Credentials must remain valid through voting end',
    });
  if (v.credentialExpiresAt < v.activationEndsAt)
    ctx.addIssue({
      code: 'custom',
      message: 'Credentials must remain valid through activation end',
    });
});
const patchSchema = scopeShape
  .partial()
  .extend({ version: z.number().int().positive() });
const transitionSchema = z.object({
  status: z.nativeEnum(VotingScopeStatus),
  version: z.number().int().positive(),
});
const rollbackSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
const next: Record<VotingScopeStatus, VotingScopeStatus[]> = {
  DRAFT: [VotingScopeStatus.REGISTRATION_OPEN],
  REGISTRATION_OPEN: [VotingScopeStatus.ACTIVATION_OPEN],
  ACTIVATION_OPEN: [VotingScopeStatus.VOTING_ACTIVE],
  VOTING_ACTIVE: [VotingScopeStatus.CLOSED],
  CLOSED: [VotingScopeStatus.ARCHIVED],
  ARCHIVED: [],
};
const privilegedRollback: Partial<
  Record<VotingScopeStatus, VotingScopeStatus>
> = {
  [VotingScopeStatus.CLOSED]: VotingScopeStatus.VOTING_ACTIVE,
};
const publicScopeParams = z.object({ scopeId: z.string().uuid() });

/**
 * Whether the scope currently accepts public credential activation.
 *
 * Matches the window checks in activation (status, activation interval,
 * credential expiry). Issuer-key matching is a client/config concern and
 * is not part of this public flag.
 *
 * @param scope - Stored voting-scope status and timestamps.
 * @param now - Instant used for window comparison.
 */
export function scopeAcceptsActivation(
  scope: {
    status: VotingScopeStatus;
    activationStartsAt: Date;
    activationEndsAt: Date;
    credentialExpiresAt: Date;
  },
  now: Date,
): boolean {
  return (
    scope.status === VotingScopeStatus.ACTIVATION_OPEN &&
    now >= scope.activationStartsAt &&
    now < scope.activationEndsAt &&
    scope.credentialExpiresAt > now
  );
}

export function registerScopeRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/public/scopes/:scopeId/status',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const params = publicScopeParams.safeParse(request.params);
      if (!params.success)
        return reply.code(400).send({ code: 'INVALID_SCOPE_ID' });
      const scope = await app.prisma.votingScope.findUnique({
        where: { id: params.data.scopeId },
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          activationStartsAt: true,
          activationEndsAt: true,
          credentialExpiresAt: true,
          issuerKeyVersion: true,
        },
      });
      if (!scope) return reply.code(404).send({ code: 'SCOPE_NOT_FOUND' });
      const now = new Date();
      return {
        scopeId: scope.id,
        status: scope.status,
        activationStartsAt: scope.activationStartsAt.toISOString(),
        activationEndsAt: scope.activationEndsAt.toISOString(),
        startsAt: scope.startsAt.toISOString(),
        endsAt: scope.endsAt.toISOString(),
        credentialExpiresAt: scope.credentialExpiresAt.toISOString(),
        acceptsActivation: scopeAcceptsActivation(scope, now),
        issuerKeyVersion: scope.issuerKeyVersion,
      };
    },
  );
  app.get(
    '/api/v1/admin/scopes',
    { preHandler: app.authenticateAdmin },
    async () => ({
      scopes: await app.prisma.votingScope.findMany({
        orderBy: { startsAt: 'desc' },
      }),
    }),
  );
  app.get(
    '/api/v1/admin/scopes/:id',
    { preHandler: app.authenticateAdmin },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ code: 'INVALID_ID' });
      const scope = await app.prisma.votingScope.findUnique({
        where: { id: params.data.id },
      });
      return scope
        ? { scope }
        : reply.code(404).send({ code: 'SCOPE_NOT_FOUND' });
    },
  );
  app.post(
    '/api/v1/admin/scopes',
    { preHandler: app.requireSystemAdmin },
    async (request, reply) => {
      const parsed = fields.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ code: 'INVALID_SCOPE', issues: parsed.error.issues });
      const scope = await app.prisma.votingScope.create({
        data: { ...parsed.data, description: parsed.data.description ?? null },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'VOTING_SCOPE_CREATED',
        targetType: 'VotingScope',
        targetId: scope.id,
        sourceIp: request.ip,
        metadata: { name: scope.name },
      });
      return reply.code(201).send({ scope });
    },
  );
  app.patch(
    '/api/v1/admin/scopes/:id',
    { preHandler: app.requireSystemAdmin },
    async (request, reply) => {
      const params = idParams.safeParse(request.params),
        parsed = patchSchema.safeParse(request.body);
      if (!params.success || !parsed.success)
        return reply.code(400).send({
          code: 'INVALID_SCOPE',
          issues: parsed.success ? [] : parsed.error.issues,
        });
      const current = await app.prisma.votingScope.findUnique({
        where: { id: params.data.id },
      });
      if (!current) return reply.code(404).send({ code: 'SCOPE_NOT_FOUND' });
      if (
        current.status !== VotingScopeStatus.DRAFT &&
        current.status !== VotingScopeStatus.REGISTRATION_OPEN
      )
        return reply.code(409).send({ code: 'SCOPE_NOT_EDITABLE' });
      const { version, ...changes } = parsed.data;
      const combined = fields.safeParse({ ...current, ...changes });
      if (!combined.success)
        return reply
          .code(400)
          .send({ code: 'INVALID_SCOPE', issues: combined.error.issues });
      const updateData = {
        ...changes,
        version: { increment: 1 },
      } as Prisma.VotingScopeUpdateManyMutationInput;
      const updated = await app.prisma.votingScope.updateMany({
        where: { id: current.id, version },
        data: updateData,
      });
      if (!updated.count)
        return reply.code(409).send({ code: 'VERSION_CONFLICT' });
      const scope = await app.prisma.votingScope.findUniqueOrThrow({
        where: { id: current.id },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'VOTING_SCOPE_UPDATED',
        targetType: 'VotingScope',
        targetId: scope.id,
        sourceIp: request.ip,
        metadata: { version: scope.version },
      });
      return { scope };
    },
  );
  app.post(
    '/api/v1/admin/scopes/:id/transition',
    { preHandler: app.requireSystemAdmin },
    async (request, reply) => {
      const params = idParams.safeParse(request.params),
        parsed = transitionSchema.safeParse(request.body);
      if (!params.success || !parsed.success)
        return reply.code(400).send({ code: 'INVALID_TRANSITION' });
      const current = await app.prisma.votingScope.findUnique({
        where: { id: params.data.id },
      });
      if (!current) return reply.code(404).send({ code: 'SCOPE_NOT_FOUND' });
      if (!next[current.status].includes(parsed.data.status))
        return reply.code(409).send({ code: 'INVALID_STATUS_TRANSITION' });
      const result = await app.prisma.votingScope.updateMany({
        where: {
          id: current.id,
          version: parsed.data.version,
          status: current.status,
        },
        data: { status: parsed.data.status, version: { increment: 1 } },
      });
      if (!result.count)
        return reply.code(409).send({ code: 'VERSION_CONFLICT' });
      const scope = await app.prisma.votingScope.findUniqueOrThrow({
        where: { id: current.id },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'VOTING_SCOPE_STATUS_CHANGED',
        targetType: 'VotingScope',
        targetId: scope.id,
        sourceIp: request.ip,
        metadata: {
          from: current.status,
          to: scope.status,
          version: scope.version,
        },
      });
      return { scope };
    },
  );
  app.post(
    '/api/v1/admin/scopes/:id/rollback',
    { preHandler: app.requireSystemAdmin },
    async (request, reply) => {
      const params = idParams.safeParse(request.params),
        parsed = rollbackSchema.safeParse(request.body);
      if (!params.success || !parsed.success)
        return reply.code(400).send({ code: 'INVALID_ROLLBACK' });
      const current = await app.prisma.votingScope.findUnique({
        where: { id: params.data.id },
      });
      if (!current) return reply.code(404).send({ code: 'SCOPE_NOT_FOUND' });
      const status = privilegedRollback[current.status];
      if (!status)
        return reply.code(409).send({ code: 'INVALID_STATUS_TRANSITION' });
      const result = await app.prisma.votingScope.updateMany({
        where: {
          id: current.id,
          version: parsed.data.version,
          status: current.status,
        },
        data: { status, version: { increment: 1 } },
      });
      if (!result.count)
        return reply.code(409).send({ code: 'VERSION_CONFLICT' });
      const scope = await app.prisma.votingScope.findUniqueOrThrow({
        where: { id: current.id },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'VOTING_SCOPE_ROLLED_BACK',
        targetType: 'VotingScope',
        targetId: scope.id,
        sourceIp: request.ip,
        metadata: {
          from: current.status,
          to: scope.status,
          reason: parsed.data.reason,
          version: scope.version,
        },
      });
      return { scope };
    },
  );
}
