import {
  ActivationTokenStatus,
  ActorType,
  Prisma,
  RegistrationStatus,
  VotingScopeStatus,
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

/**
 * Locks and validates the registration, scope, and token used for delivery.
 *
 * @param tx - Prisma transaction that owns the lifecycle update.
 * @param tokenId - Activation token identifier from the delivery request.
 * @returns The locked token, or an HTTP status and stable API error code.
 */
async function lockDeliveryContext(
  tx: Prisma.TransactionClient,
  tokenId: string,
) {
  const seed = await tx.activationToken.findUnique({
    where: { id: tokenId },
    select: { registrationRecordId: true, votingScopeId: true },
  });
  if (!seed)
    return { error: 'ACTIVATION_TOKEN_NOT_FOUND' as const, status: 404 };

  const [registration] = await tx.$queryRaw<
    Array<{
      status: RegistrationStatus;
      eligible: boolean;
      deletedAt: Date | null;
    }>
  >(Prisma.sql`
    SELECT "status", "eligible", "deletedAt"
    FROM "RegistrationRecord"
    WHERE "id" = ${seed.registrationRecordId}::uuid
    FOR UPDATE
  `);
  const [scope] = await tx.$queryRaw<
    Array<{ status: VotingScopeStatus }>
  >(Prisma.sql`
    SELECT "status"
    FROM "VotingScope"
    WHERE "id" = ${seed.votingScopeId}::uuid
    FOR UPDATE
  `);
  const [lockedToken] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ActivationToken"
    WHERE "id" = ${tokenId}::uuid
    FOR UPDATE
  `);
  if (!lockedToken)
    return { error: 'ACTIVATION_TOKEN_NOT_FOUND' as const, status: 404 };
  if (
    !registration ||
    registration.deletedAt ||
    registration.status !== RegistrationStatus.ACTIVE ||
    !registration.eligible
  )
    return { error: 'REGISTRATION_NOT_ELIGIBLE' as const, status: 409 };
  if (!scope || scope.status !== VotingScopeStatus.ACTIVATION_OPEN)
    return { error: 'ACTIVATION_SCOPE_NOT_OPEN' as const, status: 409 };

  const eligibility = await tx.scopeEligibility.findUnique({
    where: {
      registrationRecordId_votingScopeId: {
        registrationRecordId: seed.registrationRecordId,
        votingScopeId: seed.votingScopeId,
      },
    },
    select: { eligible: true },
  });
  if (eligibility?.eligible === false)
    return { error: 'REGISTRATION_NOT_ELIGIBLE' as const, status: 409 };
  return { tokenId };
}

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
            Array<{
              id: string;
              status: VotingScopeStatus;
              activationStartsAt: Date;
              activationEndsAt: Date;
            }>
          >(Prisma.sql`
            SELECT "id", "status", "activationStartsAt", "activationEndsAt"
            FROM "VotingScope"
            WHERE "id" = ${params.data.scopeId}::uuid
            FOR UPDATE
          `);
          if (!scope) return { error: 'SCOPE_NOT_FOUND' as const, status: 404 };
          if (scope.status !== VotingScopeStatus.ACTIVATION_OPEN)
            return { error: 'ACTIVATION_SCOPE_NOT_OPEN' as const, status: 409 };
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
          if (
            expiresAt <= generatedAt ||
            expiresAt <= scope.activationStartsAt ||
            expiresAt > scope.activationEndsAt
          )
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
            const expired = active.expiresAt <= generatedAt;
            const where = {
              id: active.id,
              status: ActivationTokenStatus.ACTIVE,
            };
            const replaced = expired
              ? await tx.activationToken.updateMany({
                  where,
                  data: { status: ActivationTokenStatus.EXPIRED },
                })
              : await tx.activationToken.updateMany({
                  where,
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
      const result = await app.prisma.$transaction(
        async (tx) => {
          const context = await lockDeliveryContext(tx, params.data.id);
          if (!('tokenId' in context)) return context;
          const deliveredAt = new Date();
          const updated = await tx.activationToken.updateMany({
            where: {
              id: context.tokenId,
              status: ActivationTokenStatus.ACTIVE,
              deliveredAt: null,
              expiresAt: { gt: deliveredAt },
            },
            data: { deliveredAt, deliveryMethod: body.data.deliveryMethod },
          });
          if (!updated.count) {
            const existing = await tx.activationToken.findUniqueOrThrow({
              where: { id: context.tokenId },
            });
            if (existing.status !== ActivationTokenStatus.ACTIVE)
              return {
                error: 'ACTIVATION_TOKEN_NOT_ACTIVE' as const,
                status: 409,
              };
            if (existing.expiresAt <= deliveredAt)
              return {
                error: 'ACTIVATION_TOKEN_EXPIRED' as const,
                status: 409,
              };
            return {
              error: 'ACTIVATION_TOKEN_ALREADY_DELIVERED' as const,
              status: 409,
            };
          }
          const token = await tx.activationToken.findUniqueOrThrow({
            where: { id: context.tokenId },
          });
          await appendAudit(tx, {
            actorType: ActorType.ADMIN,
            actorId: request.admin!.id,
            eventType: 'ACTIVATION_TOKEN_DELIVERED',
            targetType: 'ActivationToken',
            targetId: token.id,
            sourceIp: request.ip,
            metadata: { deliveryMethod: body.data.deliveryMethod },
          });
          return { token };
        },
        { timeout: ACTIVATION_TOKEN_TRANSACTION_TIMEOUT_MS },
      );
      if (!('token' in result))
        return reply.code(result.status).send({ code: result.error });
      return { activationToken: publicToken(result.token) };
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
      const result = await app.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const updated = await tx.activationToken.updateMany({
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
            const existing = await tx.activationToken.findUnique({
              where: { id: params.data.id },
            });
            if (!existing)
              return {
                error: 'ACTIVATION_TOKEN_NOT_FOUND' as const,
                status: 404,
              };
            if (
              existing.status === ActivationTokenStatus.ACTIVE &&
              existing.expiresAt <= now
            )
              return {
                error: 'ACTIVATION_TOKEN_EXPIRED' as const,
                status: 409,
              };
            return {
              error: 'ACTIVATION_TOKEN_NOT_ACTIVE' as const,
              status: 409,
            };
          }
          const token = await tx.activationToken.findUniqueOrThrow({
            where: { id: params.data.id },
          });
          await appendAudit(tx, {
            actorType: ActorType.ADMIN,
            actorId: request.admin!.id,
            eventType: 'ACTIVATION_TOKEN_REVOKED',
            targetType: 'ActivationToken',
            targetId: token.id,
            sourceIp: request.ip,
            metadata: { reason: body.data.reason },
          });
          return { token };
        },
        { timeout: ACTIVATION_TOKEN_TRANSACTION_TIMEOUT_MS },
      );
      if (!('token' in result))
        return reply.code(result.status).send({ code: result.error });
      return { activationToken: publicToken(result.token) };
    },
  );
}
