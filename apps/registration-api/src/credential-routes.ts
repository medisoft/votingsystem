import {
  ActivationTokenStatus,
  ActorType,
  Prisma,
  RegistrationStatus,
  VotingScopeStatus,
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appendAudit } from './audit.js';
import { hashActivationToken } from './activation-tokens.js';
import {
  RSA_MODULUS_BYTES,
  blindSignCommitment,
  bytesToBase64url,
  hashBlindedMessage,
  parseFixedBytes,
} from './blind-rsa.js';
import {
  linkReplacementCredential,
  nextCredentialVersion,
  publicIssuedCredential,
  reissueCredential,
  revokeCredential,
} from './credential-admin.js';
import {
  BLIND_CREDENTIAL_PROTOCOL,
  CREDENTIAL_SCHEMA_VERSION,
  canonicalizePublicMetadata,
  canonicalizeRevocationList,
  formatVotingWeight,
  isValidClientNonce,
  publicCredentialStatus,
  type PublicMetadata,
  type RevocationListPayload,
} from './credentials.js';
import { ISSUER_ALGORITHM, signCanonical, type Issuer } from './issuer-keys.js';

const tokenBody = z.object({
  activationToken: z.string().min(1).max(128),
});
const activateBody = tokenBody.extend({
  protocol: z.literal(BLIND_CREDENTIAL_PROTOCOL),
  blindedMessage: z.string().min(1).max(512),
  publicMetadata: z.object({
    schemaVersion: z.literal(CREDENTIAL_SCHEMA_VERSION),
    protocol: z.literal(BLIND_CREDENTIAL_PROTOCOL),
    scopeId: z.string().uuid(),
    weight: z.string().regex(/^\d+\.\d{4}$/),
    credentialVersion: z.number().int().positive(),
    expiresAt: z.string().datetime({ offset: true }),
    issuer: z.string().min(1).max(200),
    keyVersion: z.string().min(1).max(100),
  }),
  clientNonce: z.string().min(1).max(64),
});
const uuid = z.string().uuid();
const credentialParams = z.object({ id: uuid });
const revokeBody = z.object({ reason: z.string().trim().min(3).max(500) });
const reissueBody = revokeBody.extend({
  expiresAt: z.string().datetime({ offset: true }).optional(),
  deliveryMethod: z.string().trim().min(1).max(64).optional(),
});
const issuanceStatusParams = z.object({ issuanceId: uuid });
const scopeParams = z.object({ scopeId: uuid });

const ACTIVATION_TRANSACTION_TIMEOUT_MS = 60_000;

interface ActivationError {
  error: string;
  status: number;
}

interface ActivationContext {
  token: {
    id: string;
    status: ActivationTokenStatus;
    expiresAt: Date;
    tokenPrefixForSupport: string;
  };
  registration: {
    id: string;
    status: RegistrationStatus;
    eligible: boolean;
    deletedAt: Date | null;
    votingWeight: Prisma.Decimal;
  };
  scope: {
    id: string;
    status: VotingScopeStatus;
    activationStartsAt: Date;
    activationEndsAt: Date;
    credentialExpiresAt: Date;
    issuerKeyVersion: string;
  };
}

/**
 * Public issuance envelope returned after blind signing. It does not include
 * the voter public key or the unblinded credential.
 *
 * @param record - Persisted issuance row.
 * @returns Blinded signature and the public metadata used as `info`.
 */
function issuanceEnvelope(record: {
  publicMetadata: string;
  blindedSignature: string;
  issuerKeyVersion: string;
  protocol: string;
}) {
  return {
    protocol: record.protocol,
    publicMetadata: JSON.parse(record.publicMetadata) as PublicMetadata,
    blindedSignature: record.blindedSignature,
    keyVersion: record.issuerKeyVersion,
  };
}

/**
 * Locks the token, registration, and scope used for credential issuance.
 *
 * @param tx - Prisma transaction that owns the issuance update.
 * @param tokenHash - SHA-256 hash of the submitted activation token.
 * @returns Locked rows, or an HTTP status and stable API error code.
 */
async function lockActivationContext(
  tx: Prisma.TransactionClient,
  tokenHash: string,
): Promise<ActivationContext | ActivationError> {
  const seed = await tx.activationToken.findUnique({
    where: { tokenHash },
    select: { id: true, registrationRecordId: true, votingScopeId: true },
  });
  if (!seed)
    return { error: 'ACTIVATION_TOKEN_NOT_FOUND' as const, status: 404 };

  const [registration] = await tx.$queryRaw<
    Array<{
      id: string;
      status: RegistrationStatus;
      eligible: boolean;
      deletedAt: Date | null;
      votingWeight: Prisma.Decimal;
    }>
  >(Prisma.sql`
    SELECT "id", "status", "eligible", "deletedAt", "votingWeight"
    FROM "RegistrationRecord"
    WHERE "id" = ${seed.registrationRecordId}::uuid
    FOR UPDATE
  `);
  const [scope] = await tx.$queryRaw<
    Array<{
      id: string;
      status: VotingScopeStatus;
      activationStartsAt: Date;
      activationEndsAt: Date;
      credentialExpiresAt: Date;
      issuerKeyVersion: string;
    }>
  >(Prisma.sql`
    SELECT "id", "status", "activationStartsAt", "activationEndsAt",
           "credentialExpiresAt", "issuerKeyVersion"
    FROM "VotingScope"
    WHERE "id" = ${seed.votingScopeId}::uuid
    FOR UPDATE
  `);
  const [token] = await tx.$queryRaw<
    Array<{
      id: string;
      status: ActivationTokenStatus;
      expiresAt: Date;
      tokenPrefixForSupport: string;
    }>
  >(Prisma.sql`
    SELECT "id", "status", "expiresAt", "tokenPrefixForSupport"
    FROM "ActivationToken"
    WHERE "id" = ${seed.id}::uuid
    FOR UPDATE
  `);
  if (!token || !registration || !scope)
    return { error: 'ACTIVATION_TOKEN_NOT_FOUND' as const, status: 404 };
  return { token, registration, scope };
}

/**
 * Checks eligibility, scope window, token status, and issuer key version.
 *
 * @param context - Locked token, registration, and scope.
 * @param issuerKeyVersion - Currently configured issuer key version.
 * @param now - Issuance timestamp.
 * @returns An error when activation is not allowed.
 */
function validateActivation(
  context: ActivationContext,
  issuerKeyVersion: string,
  now: Date,
): ActivationError | undefined {
  const { token, registration, scope } = context;
  if (token.status === ActivationTokenStatus.REVOKED)
    return { error: 'ACTIVATION_TOKEN_REVOKED', status: 409 };
  if (token.status === ActivationTokenStatus.EXPIRED || token.expiresAt <= now)
    return { error: 'ACTIVATION_TOKEN_EXPIRED', status: 409 };
  if (
    registration.deletedAt ||
    registration.status !== RegistrationStatus.ACTIVE ||
    !registration.eligible
  )
    return { error: 'REGISTRATION_NOT_ELIGIBLE', status: 409 };
  if (scope.status !== VotingScopeStatus.ACTIVATION_OPEN)
    return { error: 'ACTIVATION_SCOPE_NOT_OPEN', status: 409 };
  if (now < scope.activationStartsAt)
    return { error: 'ACTIVATION_WINDOW_NOT_STARTED', status: 409 };
  if (now >= scope.activationEndsAt)
    return { error: 'ACTIVATION_WINDOW_ENDED', status: 409 };
  if (scope.issuerKeyVersion !== issuerKeyVersion)
    return { error: 'ISSUER_KEY_MISMATCH', status: 409 };
  if (scope.credentialExpiresAt <= now)
    return { error: 'CREDENTIAL_ALREADY_EXPIRED', status: 409 };
  return undefined;
}

/**
 * Resolves voting weight for a locked registration and scope.
 *
 * @param tx - Prisma transaction.
 * @param context - Locked registration and scope.
 * @returns Weight and eligibility, or an error when the record is ineligible.
 */
async function resolveEligibility(
  tx: Prisma.TransactionClient,
  context: ActivationContext,
): Promise<{ weight: Prisma.Decimal } | ActivationError> {
  const eligibility = await tx.scopeEligibility.findUnique({
    where: {
      registrationRecordId_votingScopeId: {
        registrationRecordId: context.registration.id,
        votingScopeId: context.scope.id,
      },
    },
    select: { eligible: true, votingWeight: true },
  });
  if (eligibility?.eligible === false)
    return { error: 'REGISTRATION_NOT_ELIGIBLE', status: 409 };
  return {
    weight: new Prisma.Decimal(
      eligibility?.votingWeight ?? context.registration.votingWeight,
    ),
  };
}

/**
 * Builds the public metadata the client must use when blinding.
 *
 * @param context - Locked registration and scope.
 * @param issuer - Configured issuer.
 * @param weight - Canonical voting weight.
 * @param credentialVersion - Version that will be issued.
 */
function buildPublicMetadata(
  context: ActivationContext,
  issuer: Issuer,
  weight: Prisma.Decimal,
  credentialVersion: number,
): PublicMetadata {
  return {
    schemaVersion: CREDENTIAL_SCHEMA_VERSION,
    protocol: BLIND_CREDENTIAL_PROTOCOL,
    scopeId: context.scope.id,
    weight: formatVotingWeight(weight),
    credentialVersion,
    expiresAt: context.scope.credentialExpiresAt.toISOString(),
    issuer: issuer.issuer,
    keyVersion: issuer.keyVersion,
  };
}

export function registerCredentialRoutes(app: FastifyInstance, issuer: Issuer) {
  app.get(
    '/api/v1/public/issuer-keys',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async () => ({
      keys: [
        {
          keyVersion: issuer.keyVersion,
          algorithm: ISSUER_ALGORITHM,
          protocol: issuer.protocol,
          modulusLength: issuer.modulusLength,
          publicKey: issuer.publicKeyJwk,
          issuer: issuer.issuer,
        },
      ],
    }),
  );

  app.post(
    '/api/v1/public/activation-context',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = tokenBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ code: 'INVALID_ACTIVATION_REQUEST' });
      const tokenHash = hashActivationToken(body.data.activationToken);
      const result = await app.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            tokenHash,
          );
          const context = await lockActivationContext(tx, tokenHash);
          if ('error' in context) return context;
          if (context.token.status === ActivationTokenStatus.REDEEMED) {
            const existing = await tx.issuedCredential.findUnique({
              where: { activationTokenId: context.token.id },
            });
            if (!existing)
              return {
                error: 'ACTIVATION_TOKEN_ALREADY_REDEEMED' as const,
                status: 409,
              };
            return {
              replay: true as const,
              publicMetadata: JSON.parse(
                existing.publicMetadata,
              ) as PublicMetadata,
            };
          }
          const now = new Date();
          const invalid = validateActivation(context, issuer.keyVersion, now);
          if (invalid) return invalid;
          const eligibility = await resolveEligibility(tx, context);
          if ('error' in eligibility) return eligibility;
          const publicMetadata = buildPublicMetadata(
            context,
            issuer,
            eligibility.weight,
            await nextCredentialVersion(
              tx,
              context.registration.id,
              context.scope.id,
            ),
          );
          return { replay: false as const, publicMetadata };
        },
        { timeout: ACTIVATION_TRANSACTION_TIMEOUT_MS },
      );
      if ('error' in result)
        return reply.code(result.status).send({ code: result.error });
      return {
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        publicMetadata: result.publicMetadata,
        keyVersion: issuer.keyVersion,
        blindedMessageBytes: RSA_MODULUS_BYTES,
      };
    },
  );

  app.post(
    '/api/v1/public/activate',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = activateBody.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ code: 'INVALID_ACTIVATION_REQUEST' });
      if (!isValidClientNonce(body.data.clientNonce))
        return reply.code(400).send({ code: 'INVALID_CLIENT_NONCE' });
      const blindedMessage = parseFixedBytes(
        body.data.blindedMessage,
        RSA_MODULUS_BYTES,
      );
      if (!blindedMessage)
        return reply.code(400).send({ code: 'INVALID_BLINDED_MESSAGE' });
      const blindedMessageHash = hashBlindedMessage(blindedMessage);
      const echoedMetadata = canonicalizePublicMetadata(
        body.data.publicMetadata,
      );
      const tokenHash = hashActivationToken(body.data.activationToken);
      const result = await app.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            tokenHash,
          );
          const context = await lockActivationContext(tx, tokenHash);
          if ('error' in context) return context;
          if (context.token.status === ActivationTokenStatus.REDEEMED) {
            const existing = await tx.issuedCredential.findUnique({
              where: { activationTokenId: context.token.id },
            });
            if (existing?.blindedMessageHash === blindedMessageHash)
              return { replay: true as const, credential: existing };
            return {
              error: 'ACTIVATION_TOKEN_ALREADY_REDEEMED' as const,
              status: 409,
            };
          }
          const now = new Date();
          const invalid = validateActivation(context, issuer.keyVersion, now);
          if (invalid) return invalid;
          const eligibility = await resolveEligibility(tx, context);
          if ('error' in eligibility) return eligibility;
          const alreadyIssued = await tx.issuedCredential.findFirst({
            where: {
              registrationRecordId: context.registration.id,
              votingScopeId: context.scope.id,
              status: 'ACTIVE',
            },
            select: { id: true },
          });
          if (alreadyIssued)
            return {
              error: 'CREDENTIAL_ALREADY_ISSUED' as const,
              status: 409,
            };
          const previous = await tx.issuedCredential.findFirst({
            where: {
              registrationRecordId: context.registration.id,
              votingScopeId: context.scope.id,
            },
            orderBy: { credentialVersion: 'desc' },
            select: {
              id: true,
              status: true,
              replacedByCredentialId: true,
            },
          });
          const credentialVersion = await nextCredentialVersion(
            tx,
            context.registration.id,
            context.scope.id,
          );
          const publicMetadata = buildPublicMetadata(
            context,
            issuer,
            eligibility.weight,
            credentialVersion,
          );
          if (canonicalizePublicMetadata(publicMetadata) !== echoedMetadata)
            return { error: 'PUBLIC_METADATA_MISMATCH' as const, status: 409 };
          let blindedSignature: string;
          try {
            blindedSignature = bytesToBase64url(
              await blindSignCommitment(
                issuer.privateKey,
                blindedMessage,
                publicMetadata,
              ),
            );
          } catch {
            return { error: 'INVALID_BLINDED_MESSAGE' as const, status: 400 };
          }
          const redeemed = await tx.activationToken.updateMany({
            where: {
              id: context.token.id,
              status: ActivationTokenStatus.ACTIVE,
            },
            data: {
              status: ActivationTokenStatus.REDEEMED,
              redeemedAt: now,
            },
          });
          if (!redeemed.count)
            return {
              error: 'ACTIVATION_TOKEN_ALREADY_REDEEMED' as const,
              status: 409,
            };
          const credential = await tx.issuedCredential.create({
            data: {
              registrationRecordId: context.registration.id,
              votingScopeId: context.scope.id,
              activationTokenId: context.token.id,
              protocol: BLIND_CREDENTIAL_PROTOCOL,
              publicMetadata: canonicalizePublicMetadata(publicMetadata),
              blindedMessageHash,
              blindedSignature,
              weight: eligibility.weight,
              credentialVersion,
              schemaVersion: CREDENTIAL_SCHEMA_VERSION,
              issuedAt: now,
              expiresAt: context.scope.credentialExpiresAt,
              issuerKeyVersion: issuer.keyVersion,
            },
          });
          await linkReplacementCredential(tx, previous, credential.id);
          await appendAudit(tx, {
            actorType: ActorType.ANONYMOUS,
            eventType: 'CREDENTIAL_ISSUED',
            targetType: 'IssuedCredential',
            targetId: credential.id,
            sourceIp: request.ip,
            metadata: {
              votingScopeId: context.scope.id,
              activationTokenId: context.token.id,
              tokenPrefixForSupport: context.token.tokenPrefixForSupport,
              credentialVersion: credential.credentialVersion,
              issuerKeyVersion: issuer.keyVersion,
              protocol: BLIND_CREDENTIAL_PROTOCOL,
            },
          });
          await appendAudit(tx, {
            actorType: ActorType.ANONYMOUS,
            eventType: 'ACTIVATION_TOKEN_REDEEMED',
            targetType: 'ActivationToken',
            targetId: context.token.id,
            sourceIp: request.ip,
            metadata: {
              tokenPrefixForSupport: context.token.tokenPrefixForSupport,
            },
          });
          return { replay: false as const, credential };
        },
        { timeout: ACTIVATION_TRANSACTION_TIMEOUT_MS },
      );
      if ('error' in result)
        return reply.code(result.status).send({ code: result.error });
      return reply.code(result.replay ? 200 : 201).send({
        credential: issuanceEnvelope(result.credential),
      });
    },
  );

  app.get(
    '/api/v1/public/issuance-status/:issuanceId',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const params = issuanceStatusParams.safeParse(request.params);
      if (!params.success)
        return reply
          .code(400)
          .send({ code: 'INVALID_CREDENTIAL_STATUS_REQUEST' });
      const record = await app.prisma.issuedCredential.findUnique({
        where: { id: params.data.issuanceId },
        select: {
          id: true,
          credentialVersion: true,
          status: true,
          expiresAt: true,
          revokedAt: true,
          replacedByCredentialId: true,
        },
      });
      if (!record)
        return reply.code(404).send({ code: 'CREDENTIAL_NOT_FOUND' });
      return publicCredentialStatus(record, new Date());
    },
  );

  app.get(
    '/api/v1/public/scopes/:scopeId/revocations',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const params = scopeParams.safeParse(request.params);
      if (!params.success)
        return reply.code(400).send({ code: 'INVALID_SCOPE_ID' });
      const scope = await app.prisma.votingScope.findUnique({
        where: { id: params.data.scopeId },
        select: { id: true },
      });
      if (!scope) return reply.code(404).send({ code: 'SCOPE_NOT_FOUND' });
      const revoked = await app.prisma.issuedCredential.findMany({
        where: { votingScopeId: scope.id, status: 'REVOKED' },
        select: {
          id: true,
          credentialVersion: true,
          revokedAt: true,
        },
        orderBy: { id: 'asc' },
      });
      const payload: RevocationListPayload = {
        schemaVersion: CREDENTIAL_SCHEMA_VERSION,
        scopeId: scope.id,
        generatedAt: new Date().toISOString(),
        issuer: issuer.issuer,
        protocol: BLIND_CREDENTIAL_PROTOCOL,
        revoked: revoked.map((entry) => ({
          issuanceId: entry.id,
          credentialVersion: entry.credentialVersion,
          revokedAt: entry.revokedAt!.toISOString(),
        })),
      };
      const canonical = canonicalizeRevocationList(payload);
      return {
        payload: JSON.parse(canonical) as RevocationListPayload,
        signature: await signCanonical(canonical, issuer.privateKey),
        keyVersion: issuer.keyVersion,
      };
    },
  );

  app.post(
    '/api/v1/admin/credentials/:id/revoke',
    {
      preHandler: app.requireRegistrationWrite,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const params = credentialParams.safeParse(request.params);
      const body = revokeBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({ code: 'INVALID_REVOCATION_REQUEST' });
      const result = await revokeCredential(
        app.prisma,
        params.data.id,
        body.data.reason,
        { id: request.admin!.id, sourceIp: request.ip },
      );
      if (!result.ok)
        return reply.code(result.status).send({ code: result.error });
      return { credential: publicIssuedCredential(result.credential) };
    },
  );

  app.post(
    '/api/v1/admin/credentials/:id/reissue',
    {
      preHandler: app.requireRegistrationWrite,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const params = credentialParams.safeParse(request.params);
      const body = reissueBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.code(400).send({ code: 'INVALID_REISSUE_REQUEST' });
      const result = await reissueCredential(
        app.prisma,
        {
          credentialId: params.data.id,
          reason: body.data.reason,
          ...(body.data.expiresAt ? { expiresAt: body.data.expiresAt } : {}),
          ...(body.data.deliveryMethod
            ? { deliveryMethod: body.data.deliveryMethod }
            : {}),
        },
        { id: request.admin!.id, sourceIp: request.ip },
      );
      if (!result.ok)
        return reply.code(result.status).send({ code: result.error });
      return reply.code(201).send({
        credential: publicIssuedCredential(result.credential),
        activationToken: result.activationToken,
      });
    },
  );
}
