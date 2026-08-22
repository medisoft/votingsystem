import { randomUUID } from 'node:crypto';
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
  CREDENTIAL_PUBLIC_KEY_ALGORITHM,
  CREDENTIAL_SCHEMA_VERSION,
  canonicalizeCredentialPayload,
  fingerprintPublicKey,
  formatVotingWeight,
  isValidClientNonce,
  parseEd25519PublicKey,
  type CredentialPayload,
} from './credentials.js';
import { signCanonical, type Issuer } from './issuer-keys.js';

const activateBody = z.object({
  activationToken: z.string().min(1).max(128),
  publicKey: z.string().min(1).max(128),
  publicKeyAlgorithm: z.literal(CREDENTIAL_PUBLIC_KEY_ALGORITHM),
  clientNonce: z.string().min(1).max(64),
});

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
 * Turns a stored credential into the public activation response envelope.
 *
 * @param record - Persisted issued credential including the signed payload.
 * @returns Payload, signature, and issuer key version.
 */
function credentialEnvelope(record: {
  canonicalPayload: string;
  signature: string;
  issuerKeyVersion: string;
}) {
  return {
    payload: JSON.parse(record.canonicalPayload) as CredentialPayload,
    signature: record.signature,
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

export function registerCredentialRoutes(app: FastifyInstance, issuer: Issuer) {
  app.get(
    '/api/v1/public/issuer-keys',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async () => ({
      keys: [
        {
          keyVersion: issuer.keyVersion,
          algorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
          publicKey: issuer.publicKeyRawBase64url,
          issuer: issuer.issuer,
        },
      ],
    }),
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
      const publicKeyRaw = parseEd25519PublicKey(body.data.publicKey);
      if (!publicKeyRaw)
        return reply.code(400).send({ code: 'INVALID_PUBLIC_KEY' });
      const publicKey = publicKeyRaw.toString('base64url');
      const tokenHash = hashActivationToken(body.data.activationToken);
      const result = await app.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            tokenHash,
          );
          const context = await lockActivationContext(tx, tokenHash);
          if ('error' in context) return context;
          const now = new Date();
          if (context.token.status === ActivationTokenStatus.REDEEMED) {
            const existing = await tx.issuedCredential.findUnique({
              where: { activationTokenId: context.token.id },
            });
            if (existing?.publicKey === publicKey)
              return { replay: true as const, credential: existing };
            return {
              error: 'ACTIVATION_TOKEN_ALREADY_REDEEMED' as const,
              status: 409,
            };
          }
          const invalid = validateActivation(context, issuer.keyVersion, now);
          if (invalid) return invalid;
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
            return { error: 'REGISTRATION_NOT_ELIGIBLE' as const, status: 409 };
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
          const weight = new Prisma.Decimal(
            eligibility?.votingWeight ?? context.registration.votingWeight,
          );
          const payload: CredentialPayload = {
            schemaVersion: CREDENTIAL_SCHEMA_VERSION,
            credentialId: randomUUID(),
            scopeId: context.scope.id,
            publicKey,
            publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
            weight: formatVotingWeight(weight),
            credentialVersion: 1,
            issuedAt: now.toISOString(),
            expiresAt: context.scope.credentialExpiresAt.toISOString(),
            issuer: issuer.issuer,
          };
          const canonicalPayload = canonicalizeCredentialPayload(payload);
          const signature = signCanonical(canonicalPayload, issuer.privateKey);
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
              credentialId: payload.credentialId,
              publicKey,
              publicKeyFingerprint: fingerprintPublicKey(publicKeyRaw),
              publicKeyAlgorithm: CREDENTIAL_PUBLIC_KEY_ALGORITHM,
              weight,
              credentialVersion: payload.credentialVersion,
              schemaVersion: payload.schemaVersion,
              issuedAt: now,
              expiresAt: context.scope.credentialExpiresAt,
              canonicalPayload,
              signature,
              issuerKeyVersion: issuer.keyVersion,
            },
          });
          await appendAudit(tx, {
            actorType: ActorType.ANONYMOUS,
            eventType: 'CREDENTIAL_ISSUED',
            targetType: 'IssuedCredential',
            targetId: credential.id,
            sourceIp: request.ip,
            metadata: {
              credentialId: credential.credentialId,
              votingScopeId: context.scope.id,
              activationTokenId: context.token.id,
              tokenPrefixForSupport: context.token.tokenPrefixForSupport,
              publicKeyFingerprint: credential.publicKeyFingerprint,
              issuerKeyVersion: issuer.keyVersion,
            },
          });
          await appendAudit(tx, {
            actorType: ActorType.ANONYMOUS,
            eventType: 'ACTIVATION_TOKEN_REDEEMED',
            targetType: 'ActivationToken',
            targetId: context.token.id,
            sourceIp: request.ip,
            metadata: {
              credentialId: credential.credentialId,
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
        credential: credentialEnvelope(result.credential),
      });
    },
  );
}
