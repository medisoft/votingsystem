import {
  ActivationTokenStatus,
  ActorType,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateActivationToken } from './activation-tokens.js';
import { appendAudit } from './audit.js';

const uuid = z.string().uuid();
const generateParams = z.object({ id: uuid, scopeId: uuid });
const revokeParams = z.object({ id: uuid });
const generateBody = z.object({
  expiresAt: z.string().datetime({ offset: true }).optional(),
  deliveryMethod: z.string().trim().min(1).max(64).optional(),
});
const revokeBody = z.object({ reason: z.string().trim().min(3).max(500) });
const deliveryBody = z.object({
  deliveryMethod: z.string().trim().min(1).max(64),
});
const ACTIVATION_TOKEN_TRANSACTION_TIMEOUT_MS = 60_000;

const publicToken = (token: {
  id: string;
  registrationRecordId: string;
  votingScopeId: string;
  tokenPrefixForSupport: string;
  status: ActivationTokenStatus;
  expiresAt: Date;
  generatedAt: Date;
  deliveryMethod: string | null;
  deliveredAt: Date | null;
  redeemedAt: Date | null;
  revokedAt: Date | null;
  revocationReason: string | null;
}) => ({
  id: token.id,
  registrationRecordId: token.registrationRecordId,
  votingScopeId: token.votingScopeId,
  tokenPrefixForSupport: token.tokenPrefixForSupport,
  status: token.status,
  expiresAt: token.expiresAt,
  generatedAt: token.generatedAt,
  deliveryMethod: token.deliveryMethod,
  deliveredAt: token.deliveredAt,
  redeemedAt: token.redeemedAt,
  revokedAt: token.revokedAt,
  revocationReason: token.revocationReason,
});

export function registerActivationTokenRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/admin/registrations/:id/scopes/:scopeId/activation-token',
    {
      preHandler: app.requireRegistrationWrite,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const params = generateParams.safeParse(request.params);
      const body = generateBody.safeParse(request.body ?? {});
      if (!params.success || !body.success)
        return reply
          .code(400)
          .send({ code: 'INVALID_ACTIVATION_TOKEN_REQUEST' });
      const generated = generateActivationToken();
      const result = await app.prisma.$transaction(
        async (tx) => {
          const lockKey = params.data.id + ':' + params.data.scopeId;
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            lockKey,
          );
          const [registration] = await tx.$queryRaw<
            Array<{
              id: string;
              status: RegistrationStatus;
              eligible: boolean;
              deletedAt: Date | null;
            }>
          >(Prisma.sql`
            SELECT "id", "status", "eligible", "deletedAt"
            FROM "RegistrationRecord"
            WHERE "id" = ${params.data.id}::uuid
            FOR UPDATE
          `);
          if (!registration || registration.deletedAt)
            return { error: 'REGISTRATION_NOT_FOUND' as const, status: 404 };
          const [scope] = await tx.$queryRaw<
            Array<{ id: string; activationEndsAt: Date }>
          >(Prisma.sql`
            SELECT "id", "activationEndsAt"
            FROM "VotingScope"
            WHERE "id" = ${params.data.scopeId}::uuid
            FOR UPDATE
          `);
          if (!scope) return { error: 'SCOPE_NOT_FOUND' as const, status: 404 };
          const scopeEligibility = await tx.scopeEligibility.findUnique({
            where: {
              registrationRecordId_votingScopeId: {
                registrationRecordId: params.data.id,
                votingScopeId: params.data.scopeId,
              },
            },
          });
          if (
            registration.status !== RegistrationStatus.ACTIVE ||
            !registration.eligible ||
            scopeEligibility?.eligible === false
          )
            return {
              error: 'REGISTRATION_NOT_ELIGIBLE' as const,
              status: 409,
            };
          const generatedAt = new Date();
          if (scope.activationEndsAt <= generatedAt)
            return { error: 'ACTIVATION_WINDOW_ENDED' as const, status: 409 };
          const expiresAt = body.data.expiresAt
            ? new Date(body.data.expiresAt)
            : scope.activationEndsAt;
          if (expiresAt <= generatedAt || expiresAt > scope.activationEndsAt)
            return { error: 'INVALID_TOKEN_EXPIRATION' as const, status: 400 };
          const active = await tx.activationToken.findFirst({
            where: {
              registrationRecordId: params.data.id,
              votingScopeId: params.data.scopeId,
              status: ActivationTokenStatus.ACTIVE,
            },
          });
          let replacedTokenId: string | null = null;
          if (active) {
            const replaced = await tx.activationToken.updateMany({
              where: {
                id: active.id,
                status: ActivationTokenStatus.ACTIVE,
              },
              data: {
                status: ActivationTokenStatus.REVOKED,
                revokedAt: generatedAt,
                revocationReason: 'Replacement generated',
              },
            });
            if (replaced.count) replacedTokenId = active.id;
          }
          const token = await tx.activationToken.create({
            data: {
              registrationRecordId: params.data.id,
              votingScopeId: params.data.scopeId,
              tokenHash: generated.tokenHash,
              tokenPrefixForSupport: generated.tokenPrefixForSupport,
              expiresAt,
              generatedAt,
              generatedBy: request.admin!.id,
              deliveryMethod: body.data.deliveryMethod ?? null,
            },
          });
          await appendAudit(tx, {
            actorType: ActorType.ADMIN,
            actorId: request.admin!.id,
            eventType: replacedTokenId
              ? 'ACTIVATION_TOKEN_REPLACED'
              : 'ACTIVATION_TOKEN_GENERATED',
            targetType: 'ActivationToken',
            targetId: token.id,
            sourceIp: request.ip,
            metadata: {
              registrationRecordId: params.data.id,
              votingScopeId: params.data.scopeId,
              expiresAt: expiresAt.toISOString(),
              replacedTokenId,
            },
          });
          return { token };
        },
        { timeout: ACTIVATION_TOKEN_TRANSACTION_TIMEOUT_MS },
      );
      if ('error' in result)
        return reply.code(result.status ?? 500).send({ code: result.error });
      return reply.code(201).send({
        activationToken: {
          ...publicToken(result.token),
          rawToken: generated.rawToken,
        },
      });
    },
  );

  app.post(
    '/api/v1/admin/activation-tokens/:id/delivered',
    {
      preHandler: app.requireRegistrationWrite,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const params = revokeParams.safeParse(request.params);
      const body = deliveryBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({ code: 'INVALID_DELIVERY_REQUEST' });
      const deliveredAt = new Date();
      const updated = await app.prisma.activationToken.updateMany({
        where: {
          id: params.data.id,
          status: ActivationTokenStatus.ACTIVE,
          deliveredAt: null,
          expiresAt: { gt: deliveredAt },
        },
        data: { deliveredAt, deliveryMethod: body.data.deliveryMethod },
      });
      if (!updated.count) {
        const existing = await app.prisma.activationToken.findUnique({
          where: { id: params.data.id },
        });
        if (!existing)
          return reply.code(404).send({ code: 'ACTIVATION_TOKEN_NOT_FOUND' });
        if (existing.status !== ActivationTokenStatus.ACTIVE)
          return reply.code(409).send({ code: 'ACTIVATION_TOKEN_NOT_ACTIVE' });
        if (existing.expiresAt <= deliveredAt)
          return reply.code(409).send({ code: 'ACTIVATION_TOKEN_EXPIRED' });
        return reply
          .code(409)
          .send({ code: 'ACTIVATION_TOKEN_ALREADY_DELIVERED' });
      }
      const token = await app.prisma.activationToken.findUniqueOrThrow({
        where: { id: params.data.id },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'ACTIVATION_TOKEN_DELIVERED',
        targetType: 'ActivationToken',
        targetId: token.id,
        sourceIp: request.ip,
        metadata: { deliveryMethod: body.data.deliveryMethod },
      });
      return { activationToken: publicToken(token) };
    },
  );

  app.post(
    '/api/v1/admin/activation-tokens/:id/revoke',
    {
      preHandler: app.requireRegistrationWrite,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const params = revokeParams.safeParse(request.params);
      const body = revokeBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({ code: 'INVALID_REVOCATION_REQUEST' });
      const now = new Date();
      const updated = await app.prisma.activationToken.updateMany({
        where: {
          id: params.data.id,
          status: ActivationTokenStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        data: {
          status: ActivationTokenStatus.REVOKED,
          revokedAt: now,
          revocationReason: body.data.reason,
        },
      });
      if (!updated.count) {
        const existing = await app.prisma.activationToken.findUnique({
          where: { id: params.data.id },
        });
        if (!existing)
          return reply.code(404).send({ code: 'ACTIVATION_TOKEN_NOT_FOUND' });
        if (
          existing.status === ActivationTokenStatus.ACTIVE &&
          existing.expiresAt <= now
        )
          return reply.code(409).send({ code: 'ACTIVATION_TOKEN_EXPIRED' });
        return reply.code(409).send({ code: 'ACTIVATION_TOKEN_NOT_ACTIVE' });
      }
      const token = await app.prisma.activationToken.findUniqueOrThrow({
        where: { id: params.data.id },
      });
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: 'ACTIVATION_TOKEN_REVOKED',
        targetType: 'ActivationToken',
        targetId: token.id,
        sourceIp: request.ip,
        metadata: { reason: body.data.reason },
      });
      return { activationToken: publicToken(token) };
    },
  );
}
