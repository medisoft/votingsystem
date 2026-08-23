CREATE UNIQUE INDEX "IssuedCredential_record_scope_version_key"
  ON "IssuedCredential"("registrationRecordId", "votingScopeId", "credentialVersion");
