CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TABLE "RegistrationRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "unitNumber" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL, "representativeName" TEXT, "email" TEXT, "phone" TEXT,
  "votingWeight" DECIMAL(12,4) NOT NULL DEFAULT 1, "eligible" BOOLEAN NOT NULL DEFAULT true,
  "status" "RegistrationStatus" NOT NULL DEFAULT 'ACTIVE', "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3),
  CONSTRAINT "RegistrationRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ScopeEligibility" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "registrationRecordId" UUID NOT NULL,
  "votingScopeId" UUID NOT NULL, "eligible" BOOLEAN NOT NULL,
  "votingWeight" DECIMAL(12,4) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ScopeEligibility_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RegistrationRecord_unitNumber_key" ON "RegistrationRecord"("unitNumber");
CREATE INDEX "RegistrationRecord_ownerName_idx" ON "RegistrationRecord"("ownerName");
CREATE INDEX "RegistrationRecord_email_idx" ON "RegistrationRecord"("email");
CREATE INDEX "RegistrationRecord_eligible_status_idx" ON "RegistrationRecord"("eligible","status");
CREATE UNIQUE INDEX "ScopeEligibility_registrationRecordId_votingScopeId_key" ON "ScopeEligibility"("registrationRecordId","votingScopeId");
CREATE INDEX "ScopeEligibility_votingScopeId_eligible_idx" ON "ScopeEligibility"("votingScopeId","eligible");
ALTER TABLE "ScopeEligibility" ADD CONSTRAINT "ScopeEligibility_registrationRecordId_fkey" FOREIGN KEY ("registrationRecordId") REFERENCES "RegistrationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScopeEligibility" ADD CONSTRAINT "ScopeEligibility_votingScopeId_fkey" FOREIGN KEY ("votingScopeId") REFERENCES "VotingScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
