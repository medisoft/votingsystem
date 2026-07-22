ALTER TABLE "ActivationToken"
  DROP CONSTRAINT "ActivationToken_lifecycle_check",
  ADD CONSTRAINT "ActivationToken_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "redeemedAt" IS NULL AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR
    ("status" = 'REDEEMED' AND "redeemedAt" IS NOT NULL AND "redeemedAt" >= "generatedAt" AND "redeemedAt" <= "expiresAt" AND
      "revokedAt" IS NULL AND "revocationReason" IS NULL) OR
    ("status" = 'EXPIRED' AND "redeemedAt" IS NULL AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR
    ("status" = 'REVOKED' AND "redeemedAt" IS NULL AND "revokedAt" IS NOT NULL AND
      "revokedAt" >= "generatedAt" AND "revokedAt" <= "expiresAt" AND
      NULLIF(BTRIM("revocationReason"), '') IS NOT NULL)
  );
