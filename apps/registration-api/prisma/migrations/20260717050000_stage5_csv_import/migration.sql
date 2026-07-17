CREATE TABLE "RegistrationImport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fileHash" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL,
  "importedRows" INTEGER NOT NULL,
  "rejectedRows" INTEGER NOT NULL,
  "errors" JSONB NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationImport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationImport_fileHash_key" ON "RegistrationImport"("fileHash");
CREATE INDEX "RegistrationImport_createdAt_idx" ON "RegistrationImport"("createdAt");
CREATE INDEX "RegistrationImport_createdBy_idx" ON "RegistrationImport"("createdBy");
