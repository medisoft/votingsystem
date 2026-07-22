CREATE TYPE "ActivationTokenStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED', 'REVOKED');

CREATE TABLE "ActivationToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "registrationRecordId" UUID NOT NULL,
  "votingScopeId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "tokenPrefixForSupport" VARCHAR(8) NOT NULL,
  "status" "ActivationTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "generatedBy" UUID NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveryMethod" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  CONSTRAINT "ActivationToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivationToken_expiration_check" CHECK ("expiresAt" > "generatedAt"),
  CONSTRAINT "ActivationToken_hash_format_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ActivationToken_prefix_format_check" CHECK ("tokenPrefixForSupport" ~ '^[A-Za-z0-9_-]{8}$'),
  CONSTRAINT "ActivationToken_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "redeemedAt" IS NULL AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR
    ("status" = 'REDEEMED' AND "redeemedAt" IS NOT NULL AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR
    ("status" = 'EXPIRED' AND "redeemedAt" IS NULL AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR
    ("status" = 'REVOKED' AND "redeemedAt" IS NULL AND "revokedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ActivationToken_tokenHash_key" ON "ActivationToken"("tokenHash");
CREATE UNIQUE INDEX "ActivationToken_one_active_per_record_scope_key"
  ON "ActivationToken"("registrationRecordId", "votingScopeId")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "ActivationToken_registrationRecordId_votingScopeId_status_idx" ON "ActivationToken"("registrationRecordId", "votingScopeId", "status");
CREATE INDEX "ActivationToken_votingScopeId_status_idx" ON "ActivationToken"("votingScopeId", "status");
CREATE INDEX "ActivationToken_expiresAt_status_idx" ON "ActivationToken"("expiresAt", "status");
CREATE INDEX "ActivationToken_generatedBy_generatedAt_idx" ON "ActivationToken"("generatedBy", "generatedAt");

ALTER TABLE "ActivationToken" ADD CONSTRAINT "ActivationToken_registrationRecordId_fkey" FOREIGN KEY ("registrationRecordId") REFERENCES "RegistrationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivationToken" ADD CONSTRAINT "ActivationToken_votingScopeId_fkey" FOREIGN KEY ("votingScopeId") REFERENCES "VotingScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivationToken" ADD CONSTRAINT "ActivationToken_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
