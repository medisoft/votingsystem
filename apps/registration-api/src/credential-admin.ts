import {
  ActivationTokenStatus,
  ActorType,
  IssuedCredentialStatus,
  Prisma,
  RegistrationStatus,
  VotingScopeStatus,
  type PrismaClient,
} from '@prisma/client';
import {
  generateActivationToken,
  publicActivationToken,
} from './activation-tokens.js';
import { appendAudit } from './audit.js';

const TRANSACTION_TIMEOUT_MS = 60_000;

interface AdminActor {
  id: string;
  sourceIp: string;
}

interface LifecycleError {
  ok: false;
  error: string;
  status: number;
}

function fail(error: string, status: number): LifecycleError {
  return { ok: false, error, status };
}

export const publicIssuedCredential = (credential: {
  id: string;
  credentialId: string;
  votingScopeId: string;
  status: IssuedCredentialStatus;
  credentialVersion: number;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  publicKeyFingerprint: string;
  replacedByCredentialId: string | null;
}) => ({
  id: credential.id,
  credentialId: credential.credentialId,
  votingScopeId: credential.votingScopeId,
  status: credential.status,
  credentialVersion: credential.credentialVersion,
  issuedAt: credential.issuedAt,
  expiresAt: credential.expiresAt,
  revokedAt: credential.revokedAt,
  revocationReason: credential.revocationReason,
  publicKeyFingerprint: credential.publicKeyFingerprint,
  replacedByCredentialId: credential.replacedByCredentialId,
});

/**
 * Next credential version for a registration in a voting scope.
 *
 * @param tx - Transaction that already locked the registration and scope.
 * @param registrationRecordId - Registration receiving the credential.
 * @param votingScopeId - Voting scope of the credential.
 * @returns One greater than the highest stored version, or 1 when none exist.
 */
export async function nextCredentialVersion(
  tx: Prisma.TransactionClient,
  registrationRecordId: string,
  votingScopeId: string,
) {
  const latest = await tx.issuedCredential.findFirst({
    where: { registrationRecordId, votingScopeId },
    orderBy: { credentialVersion: 'desc' },
    select: { credentialVersion: true },
  });
  return (latest?.credentialVersion ?? 0) + 1;
}

/**
 * Points the latest unreplaced revoked credential at its successor.
 *
 * @param tx - Transaction that created the replacement credential.
 * @param previous - Latest prior credential for the same registration and scope.
 * @param replacementId - Internal identifier of the newly issued credential.
 */
export async function linkReplacementCredential(
  tx: Prisma.TransactionClient,
  previous: {
    id: string;
    status: IssuedCredentialStatus;
    replacedByCredentialId: string | null;
  } | null,
  replacementId: string,
) {
  if (
    !previous ||
    previous.status !== IssuedCredentialStatus.REVOKED ||
    previous.replacedByCredentialId
  )
    return;
  await tx.issuedCredential.update({
    where: { id: previous.id },
    data: { replacedByCredentialId: replacementId },
  });
}

/**
 * Revokes ACTIVE activation tokens for one registration and voting scope.
 *
 * @param tx - Prisma transaction containing the credential mutation.
 * @param registrationRecordId - Registration whose tokens are invalidated.
 * @param votingScopeId - Scope whose tokens are invalidated.
 * @param now - Revocation timestamp.
 * @param reason - Nonblank reason stored on revoked tokens.
 * @param actor - Administrator recorded on token audit events.
 * @returns Identifiers of tokens that transitioned to REVOKED.
 */
export async function revokeActiveTokensForScope(
  tx: Prisma.TransactionClient,
  registrationRecordId: string,
  votingScopeId: string,
  now: Date,
  reason: string,
  actor: AdminActor,
) {
  const expired = await tx.activationToken.updateManyAndReturn({
    where: {
      registrationRecordId,
      votingScopeId,
      status: ActivationTokenStatus.ACTIVE,
      expiresAt: { lte: now },
    },
    data: { status: ActivationTokenStatus.EXPIRED },
    select: { id: true },
  });
  const revoked = await tx.activationToken.updateManyAndReturn({
    where: {
      registrationRecordId,
      votingScopeId,
      status: ActivationTokenStatus.ACTIVE,
      expiresAt: { gt: now },
    },
    data: {
      status: ActivationTokenStatus.REVOKED,
      revokedAt: now,
      revocationReason: reason,
    },
    select: { id: true },
  });
  for (const token of expired)
    await appendAudit(tx, {
      actorType: ActorType.ADMIN,
      actorId: actor.id,
      eventType: 'ACTIVATION_TOKEN_EXPIRED',
      targetType: 'ActivationToken',
      targetId: token.id,
      sourceIp: actor.sourceIp,
      metadata: { reason, trigger: 'CREDENTIAL_RECOVERY' },
    });
  for (const token of revoked)
    await appendAudit(tx, {
      actorType: ActorType.ADMIN,
      actorId: actor.id,
      eventType: 'ACTIVATION_TOKEN_REVOKED',
      targetType: 'ActivationToken',
      targetId: token.id,
      sourceIp: actor.sourceIp,
      metadata: { reason, trigger: 'CREDENTIAL_RECOVERY' },
    });
  return revoked.map((token) => token.id);
}

/**
 * Marks an issued credential revoked and writes its audit event.
 *
 * @param tx - Prisma transaction that already locked the credential row.
 * @param credential - Active credential being revoked.
 * @param now - Revocation timestamp.
 * @param reason - Nonblank administrator reason.
 * @param actor - Administrator recorded on the audit event.
 * @returns The updated credential, or an error when it is no longer active.
 */
export async function markCredentialRevoked(
  tx: Prisma.TransactionClient,
  credential: { id: string },
  now: Date,
  reason: string,
  actor: AdminActor,
) {
  const updated = await tx.issuedCredential.updateMany({
    where: { id: credential.id, status: IssuedCredentialStatus.ACTIVE },
    data: {
      status: IssuedCredentialStatus.REVOKED,
      revokedAt: now,
      revocationReason: reason,
    },
  });
  if (!updated.count) return fail('CREDENTIAL_NOT_ACTIVE', 409);
  const revoked = await tx.issuedCredential.findUniqueOrThrow({
    where: { id: credential.id },
  });
  await appendAudit(tx, {
    actorType: ActorType.ADMIN,
    actorId: actor.id,
    eventType: 'CREDENTIAL_REVOKED',
    targetType: 'IssuedCredential',
    targetId: revoked.id,
    sourceIp: actor.sourceIp,
    metadata: {
      credentialId: revoked.credentialId,
      votingScopeId: revoked.votingScopeId,
      publicKeyFingerprint: revoked.publicKeyFingerprint,
      reason,
    },
  });
  return { credential: revoked };
}

async function lockCredentialContext(
  tx: Prisma.TransactionClient,
  credentialId: string,
) {
  const seed = await tx.issuedCredential.findUnique({
    where: { id: credentialId },
    select: { id: true, registrationRecordId: true, votingScopeId: true },
  });
  if (!seed) return fail('CREDENTIAL_NOT_FOUND', 404);
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    seed.registrationRecordId + ':' + seed.votingScopeId,
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
    WHERE "id" = ${seed.registrationRecordId}::uuid
    FOR UPDATE
  `);
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
    WHERE "id" = ${seed.votingScopeId}::uuid
    FOR UPDATE
  `);
  const [credential] = await tx.$queryRaw<
    Array<{
      id: string;
      credentialId: string;
      registrationRecordId: string;
      votingScopeId: string;
      status: IssuedCredentialStatus;
      credentialVersion: number;
      issuedAt: Date;
      expiresAt: Date;
      revokedAt: Date | null;
      revocationReason: string | null;
      publicKeyFingerprint: string;
      replacedByCredentialId: string | null;
    }>
  >(Prisma.sql`
    SELECT "id", "credentialId", "registrationRecordId", "votingScopeId",
           "status", "credentialVersion", "issuedAt", "expiresAt", "revokedAt",
           "revocationReason", "publicKeyFingerprint", "replacedByCredentialId"
    FROM "IssuedCredential"
    WHERE "id" = ${seed.id}::uuid
    FOR UPDATE
  `);
  if (!credential || !registration || !scope)
    return fail('CREDENTIAL_NOT_FOUND', 404);
  return { ok: true as const, credential, registration, scope };
}

function reissueWindowError(
  registration: {
    status: RegistrationStatus;
    eligible: boolean;
    deletedAt: Date | null;
  },
  scope: {
    status: VotingScopeStatus;
    activationStartsAt: Date;
    activationEndsAt: Date;
  },
  now: Date,
  expiresAt: Date,
): LifecycleError | undefined {
  if (
    registration.deletedAt ||
    registration.status !== RegistrationStatus.ACTIVE ||
    !registration.eligible
  )
    return fail('REGISTRATION_NOT_ELIGIBLE', 409);
  if (scope.status !== VotingScopeStatus.ACTIVATION_OPEN)
    return fail('ACTIVATION_SCOPE_NOT_OPEN', 409);
  if (now < scope.activationStartsAt)
    return fail('ACTIVATION_WINDOW_NOT_STARTED', 409);
  if (now >= scope.activationEndsAt)
    return fail('ACTIVATION_WINDOW_ENDED', 409);
  if (
    expiresAt <= now ||
    expiresAt <= scope.activationStartsAt ||
    expiresAt > scope.activationEndsAt
  )
    return fail('INVALID_TOKEN_EXPIRATION', 400);
  return undefined;
}

/**
 * Revokes an issued credential and any leftover active activation tokens.
 *
 * @param prisma - Prisma client used to open the recovery transaction.
 * @param credentialId - Internal issued-credential identifier.
 * @param reason - Nonblank administrator reason.
 * @param actor - Authenticated administrator performing the revocation.
 * @returns The revoked credential, or an HTTP status and stable API error code.
 */
export async function revokeCredential(
  prisma: PrismaClient,
  credentialId: string,
  reason: string,
  actor: AdminActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const context = await lockCredentialContext(tx, credentialId);
      if (!context.ok) return context;
      const now = new Date();
      if (context.credential.status !== IssuedCredentialStatus.ACTIVE)
        return fail('CREDENTIAL_NOT_ACTIVE', 409);
      const revoked = await markCredentialRevoked(
        tx,
        context.credential,
        now,
        reason,
        actor,
      );
      if (!('credential' in revoked)) return revoked;
      await revokeActiveTokensForScope(
        tx,
        context.credential.registrationRecordId,
        context.credential.votingScopeId,
        now,
        reason,
        actor,
      );
      return { ok: true as const, credential: revoked.credential };
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

/**
 * Revokes the current credential, invalidates tokens, and issues a replacement QR.
 *
 * @param prisma - Prisma client used to open the recovery transaction.
 * @param input - Credential identifier, reason, and optional token expiration.
 * @param actor - Authenticated administrator performing recovery.
 * @returns The revoked credential and one-time replacement token, or an error.
 */
export async function reissueCredential(
  prisma: PrismaClient,
  input: {
    credentialId: string;
    reason: string;
    expiresAt?: string;
    deliveryMethod?: string;
  },
  actor: AdminActor,
) {
  const generated = generateActivationToken();
  const result = await prisma.$transaction(
    async (tx) => {
      const context = await lockCredentialContext(tx, input.credentialId);
      if (!context.ok) return context;
      if (context.credential.replacedByCredentialId)
        return fail('CREDENTIAL_ALREADY_REPLACED', 409);
      const now = new Date();
      const expiresAt = input.expiresAt
        ? new Date(input.expiresAt)
        : context.scope.activationEndsAt;
      const invalid = reissueWindowError(
        context.registration,
        context.scope,
        now,
        expiresAt,
      );
      if (invalid) return invalid;
      const eligibility = await tx.scopeEligibility.findUnique({
        where: {
          registrationRecordId_votingScopeId: {
            registrationRecordId: context.credential.registrationRecordId,
            votingScopeId: context.credential.votingScopeId,
          },
        },
        select: { eligible: true },
      });
      if (eligibility?.eligible === false)
        return fail('REGISTRATION_NOT_ELIGIBLE', 409);
      let credential = context.credential;
      if (credential.status === IssuedCredentialStatus.ACTIVE) {
        const revoked = await markCredentialRevoked(
          tx,
          credential,
          now,
          input.reason,
          actor,
        );
        if (!('credential' in revoked)) return revoked;
        credential = revoked.credential;
      }
      await revokeActiveTokensForScope(
        tx,
        credential.registrationRecordId,
        credential.votingScopeId,
        now,
        input.reason,
        actor,
      );
      const token = await tx.activationToken.create({
        data: {
          registrationRecordId: credential.registrationRecordId,
          votingScopeId: credential.votingScopeId,
          tokenHash: generated.tokenHash,
          tokenPrefixForSupport: generated.tokenPrefixForSupport,
          expiresAt,
          generatedAt: now,
          generatedBy: actor.id,
          deliveryMethod: input.deliveryMethod ?? null,
        },
      });
      await appendAudit(tx, {
        actorType: ActorType.ADMIN,
        actorId: actor.id,
        eventType: 'CREDENTIAL_REISSUED',
        targetType: 'IssuedCredential',
        targetId: credential.id,
        sourceIp: actor.sourceIp,
        metadata: {
          credentialId: credential.credentialId,
          votingScopeId: credential.votingScopeId,
          publicKeyFingerprint: credential.publicKeyFingerprint,
          replacementActivationTokenId: token.id,
          nextCredentialVersion: credential.credentialVersion + 1,
          reason: input.reason,
        },
      });
      await appendAudit(tx, {
        actorType: ActorType.ADMIN,
        actorId: actor.id,
        eventType: 'ACTIVATION_TOKEN_GENERATED',
        targetType: 'ActivationToken',
        targetId: token.id,
        sourceIp: actor.sourceIp,
        metadata: {
          registrationRecordId: credential.registrationRecordId,
          votingScopeId: credential.votingScopeId,
          expiresAt: expiresAt.toISOString(),
          trigger: 'CREDENTIAL_REISSUED',
        },
      });
      return { ok: true as const, credential, token };
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
  if (!result.ok) return result;
  return {
    ok: true as const,
    credential: result.credential,
    activationToken: {
      ...publicActivationToken(result.token),
      rawToken: generated.rawToken,
    },
  };
}
