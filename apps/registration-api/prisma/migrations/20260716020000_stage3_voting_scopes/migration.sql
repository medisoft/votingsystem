CREATE TYPE "VotingScopeStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'ACTIVATION_OPEN', 'VOTING_ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TABLE "VotingScope" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "VotingScopeStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "activationStartsAt" TIMESTAMP(3) NOT NULL,
  "activationEndsAt" TIMESTAMP(3) NOT NULL,
  "credentialExpiresAt" TIMESTAMP(3) NOT NULL,
  "votingWeightsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "issuerKeyVersion" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VotingScope_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VotingScope_status_idx" ON "VotingScope"("status");
CREATE INDEX "VotingScope_startsAt_endsAt_idx" ON "VotingScope"("startsAt", "endsAt");
