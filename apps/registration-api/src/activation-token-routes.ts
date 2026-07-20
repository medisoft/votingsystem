import {
  ActivationTokenStatus,
  ActorType,
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
      const now = new Date();
      const [registration, scope, scopeEligibility] = await Promise.all([
        app.prisma.registrationRecord.findFirst({
          where: { id: params.data.id, deletedAt: null },
        }),
        app.prisma.votingScope.findUnique({
          where: { id: params.data.scopeId },
        }),
        app.prisma.scopeEligibility.findUnique({
          where: {
            registrationRecordId_votingScopeId: {
              registrationRecordId: params.data.id,
              votingScopeId: params.data.scopeId,
            },
          },
        }),
      ]);
      if (!registration)
        return reply.code(404).send({ code: 'REGISTRATION_NOT_FOUND' });
      if (!scope) return reply.code(404).send({ code: 'SCOPE_NOT_FOUND' });
      if (
        registration.status !== RegistrationStatus.ACTIVE ||
        !registration.eligible ||
        scopeEligibility?.eligible === false
      )
        return reply.code(409).send({ code: 'REGISTRATION_NOT_ELIGIBLE' });
      if (scope.activationEndsAt <= now)
        return reply.code(409).send({ code: 'ACTIVATION_WINDOW_ENDED' });
      const expiresAt = body.data.expiresAt
        ? new Date(body.data.expiresAt)
        : scope.activationEndsAt;
      if (expiresAt <= now || expiresAt > scope.activationEndsAt)
        return reply.code(400).send({ code: 'INVALID_TOKEN_EXPIRATION' });

      const generated = generateActivationToken();
      const result = await app.prisma.$transaction(
        async (tx) => {
          const lockKey = params.data.id + ':' + params.data.scopeId;
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            lockKey,
          );
          const active = await tx.activationToken.findFirst({
            where: {
              registrationRecordId: params.data.id,
              votingScopeId: params.data.scopeId,
              status: ActivationTokenStatus.ACTIVE,
            },
          });
          if (active)
            await tx.activationToken.update({
              where: { id: active.id },
              data: {
                status: ActivationTokenStatus.REVOKED,
                revokedAt: now,
                revocationReason: 'Replacement generated',
              },
            });
          const token = await tx.activationToken.create({
            data: {
              registrationRecordId: params.data.id,
              votingScopeId: params.data.scopeId,
              tokenHash: generated.tokenHash,
              tokenPrefixForSupport: generated.tokenPrefixForSupport,
              expiresAt,
              generatedBy: request.admin!.id,
              deliveryMethod: body.data.deliveryMethod ?? null,
            },
          });
          return { token, replacedTokenId: active?.id ?? null };
        },
        { timeout: ACTIVATION_TOKEN_TRANSACTION_TIMEOUT_MS },
      );
      await appendAudit(app.prisma, {
        actorType: ActorType.ADMIN,
        actorId: request.admin!.id,
        eventType: result.replacedTokenId
          ? 'ACTIVATION_TOKEN_REPLACED'
          : 'ACTIVATION_TOKEN_GENERATED',
        targetType: 'ActivationToken',
        targetId: result.token.id,
        sourceIp: request.ip,
        metadata: {
          registrationRecordId: params.data.id,
          votingScopeId: params.data.scopeId,
          expiresAt: expiresAt.toISOString(),
          replacedTokenId: result.replacedTokenId,
        },
      });
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
        where: { id: params.data.id, status: ActivationTokenStatus.ACTIVE },
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
        return existing
          ? reply.code(409).send({ code: 'ACTIVATION_TOKEN_NOT_ACTIVE' })
          : reply.code(404).send({ code: 'ACTIVATION_TOKEN_NOT_FOUND' });
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
