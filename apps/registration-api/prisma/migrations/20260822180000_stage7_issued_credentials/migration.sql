CREATE TYPE "IssuedCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "IssuedCredential" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "registrationRecordId" UUID NOT NULL,
  "votingScopeId" UUID NOT NULL,
  "activationTokenId" UUID NOT NULL,
  "credentialId" UUID NOT NULL,
  "publicKey" TEXT NOT NULL,
  "publicKeyFingerprint" CHAR(64) NOT NULL,
  "publicKeyAlgorithm" TEXT NOT NULL,
  "weight" DECIMAL(12,4) NOT NULL,
  "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "status" "IssuedCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "replacedByCredentialId" UUID,
  "canonicalPayload" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "issuerKeyVersion" TEXT NOT NULL,
  CONSTRAINT "IssuedCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IssuedCredential_expiration_check" CHECK ("expiresAt" > "issuedAt"),
  CONSTRAINT "IssuedCredential_fingerprint_format_check" CHECK ("publicKeyFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "IssuedCredential_public_key_format_check" CHECK ("publicKey" ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT "IssuedCredential_algorithm_check" CHECK ("publicKeyAlgorithm" = 'Ed25519'),
  CONSTRAINT "IssuedCredential_schema_check" CHECK ("schemaVersion" = 1),
  CONSTRAINT "IssuedCredential_version_check" CHECK ("credentialVersion" >= 1),
  CONSTRAINT "IssuedCredential_signature_format_check" CHECK ("signature" ~ '^[A-Za-z0-9_-]{86}$'),
  CONSTRAINT "IssuedCredential_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedAt" >= "issuedAt" AND
      NULLIF(BTRIM("revocationReason"), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "IssuedCredential_activationTokenId_key" ON "IssuedCredential"("activationTokenId");
CREATE UNIQUE INDEX "IssuedCredential_credentialId_key" ON "IssuedCredential"("credentialId");
CREATE UNIQUE INDEX "IssuedCredential_one_active_per_record_scope_key"
  ON "IssuedCredential"("registrationRecordId", "votingScopeId")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "IssuedCredential_votingScopeId_status_idx" ON "IssuedCredential"("votingScopeId", "status");
CREATE INDEX "IssuedCredential_registrationRecordId_status_idx" ON "IssuedCredential"("registrationRecordId", "status");
CREATE INDEX "IssuedCredential_publicKeyFingerprint_idx" ON "IssuedCredential"("publicKeyFingerprint");

ALTER TABLE "IssuedCredential" ADD CONSTRAINT "IssuedCredential_registrationRecordId_fkey" FOREIGN KEY ("registrationRecordId") REFERENCES "RegistrationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssuedCredential" ADD CONSTRAINT "IssuedCredential_votingScopeId_fkey" FOREIGN KEY ("votingScopeId") REFERENCES "VotingScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssuedCredential" ADD CONSTRAINT "IssuedCredential_activationTokenId_fkey" FOREIGN KEY ("activationTokenId") REFERENCES "ActivationToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssuedCredential" ADD CONSTRAINT "IssuedCredential_replacedByCredentialId_fkey" FOREIGN KEY ("replacedByCredentialId") REFERENCES "IssuedCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
