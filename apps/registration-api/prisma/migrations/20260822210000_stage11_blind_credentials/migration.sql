DELETE FROM "IssuedCredential";

ALTER TABLE "IssuedCredential"
  DROP CONSTRAINT IF EXISTS "IssuedCredential_fingerprint_format_check",
  DROP CONSTRAINT IF EXISTS "IssuedCredential_public_key_format_check",
  DROP CONSTRAINT IF EXISTS "IssuedCredential_algorithm_check",
  DROP CONSTRAINT IF EXISTS "IssuedCredential_schema_check",
  DROP CONSTRAINT IF EXISTS "IssuedCredential_signature_format_check";

DROP INDEX IF EXISTS "IssuedCredential_credentialId_key";
DROP INDEX IF EXISTS "IssuedCredential_publicKeyFingerprint_idx";

ALTER TABLE "IssuedCredential"
  DROP COLUMN "credentialId",
  DROP COLUMN "publicKey",
  DROP COLUMN "publicKeyFingerprint",
  DROP COLUMN "publicKeyAlgorithm",
  DROP COLUMN "canonicalPayload",
  DROP COLUMN "signature";

ALTER TABLE "IssuedCredential"
  ADD COLUMN "protocol" TEXT NOT NULL,
  ADD COLUMN "publicMetadata" TEXT NOT NULL,
  ADD COLUMN "blindedMessageHash" CHAR(64) NOT NULL,
  ADD COLUMN "blindedSignature" TEXT NOT NULL;

ALTER TABLE "IssuedCredential"
  ALTER COLUMN "schemaVersion" SET DEFAULT 2;

ALTER TABLE "IssuedCredential"
  ADD CONSTRAINT "IssuedCredential_schema_check" CHECK ("schemaVersion" = 2),
  ADD CONSTRAINT "IssuedCredential_protocol_check"
    CHECK ("protocol" = 'RSAPBSSA-SHA384-PSS-Randomized'),
  ADD CONSTRAINT "IssuedCredential_blinded_hash_format_check"
    CHECK ("blindedMessageHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "IssuedCredential_blinded_signature_format_check"
    CHECK (
      char_length("blindedSignature") = 342
      AND "blindedSignature" ~ '^[A-Za-z0-9_-]+$'
    );

CREATE UNIQUE INDEX "IssuedCredential_blindedMessageHash_key"
  ON "IssuedCredential"("blindedMessageHash");
