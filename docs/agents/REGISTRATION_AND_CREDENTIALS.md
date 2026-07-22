# Condominium Anonymous Voting System

## Application 1 — Registration and Credential Issuance Service

## 1. Purpose

Build the registration component of a condominium voting system.

This application must:

* Maintain the official list of eligible voting units or owners.
* Generate one-time activation credentials represented as QR codes.
* Allow an authorized voter to activate a voting credential.
* Authorize an anonymous voting public key without learning the corresponding private key.
* Prevent the same registration record from activating more than one active voting credential.
* Support credential revocation and replacement.
* Never receive, store, process, or infer any vote selection.
* Remain operationally and logically separate from the voting ballot service.

This application is not the ballot box. It only confirms that a person or condominium unit is eligible to obtain one anonymous voting credential.

---

# 2. Recommended Technology Stack

Use the following stack unless there is a strong technical reason to change it:

## Backend

* Node.js
* TypeScript
* Fastify
* PostgreSQL
* Prisma ORM
* Zod for input validation
* OpenAPI documentation
* Vitest for unit and integration tests

## Administrative Frontend

* React
* TypeScript
* Vite
* React Router
* TanStack Query
* A simple accessible component library

## Infrastructure

* Docker
* Docker Compose for local development
* Environment variables for configuration
* Database migrations committed to the repository

Do not implement the voter-facing voting interface in this project.

## Reuse of Existing Libraries

Prefer an existing, well-supported library over a custom implementation when it
already solves the required problem. Before adopting it, verify that it is
actively maintained, compatible with the project stack, appropriately licensed,
and suitable for the security and correctness requirements.

Custom implementations of established infrastructure or formats—such as
parsers, cryptographic primitives, protocol clients, and generic utilities—must
be used only when no suitable maintained library exists or a documented project
requirement makes the library unsuitable. Record that justification and add
tests for the behavior the project must maintain.

---

# 3. Security Model

The registration application handles real identities or condominium records.

The voting application will handle anonymous voting credentials.

These two concerns must remain separated.

The registration database may know:

* The condominium unit.
* The registered owner or authorized representative.
* Whether the person or unit is eligible to vote.
* Whether an activation QR was generated.
* Whether the activation QR was redeemed.
* Whether a credential was revoked.
* The anonymous credential issuance status.

The registration database must not know:

* Which proposals the voter viewed.
* Whether the voter voted yes, no, abstain, or selected any candidate.
* When the anonymous voter later submitted a vote.
* The anonymous voter identifier used by the ballot service, whenever cryptographic unlinkability is implemented.

For the first prototype, the cryptographic anonymity may be implemented in simplified stages. The architecture must nevertheless avoid unnecessary identity-to-credential links.

---

# 4. Core Concepts

## 4.1 Registration Record

A registration record represents one eligible voting entitlement.

Depending on the condominium rules, this may represent:

* One condominium unit.
* One owner.
* One authorized voting representative.
* One weighted voting entitlement.

Each record must have:

* Internal UUID.
* Unit identifier.
* Owner or representative name.
* Contact information.
* Voting weight.
* Eligibility status.
* Activation status.
* Credential status.
* Created and updated timestamps.

## 4.2 Activation Token

An activation token is a high-entropy random secret delivered through a QR code.

Requirements:

* At least 256 bits of cryptographically secure randomness.
* Stored only as a secure hash.
* Single use.
* Expiration date.
* Revocable.
* Must not contain a name, unit number, email address, or predictable identifier.
* Must not be a JWT containing identity data.
* Must be protected against brute-force attempts.

Example QR payload:

```text
https://vote.example.org/activate?token=<opaque-random-token>
```

## 4.3 Voter Key Pair

The voter-facing application will generate a cryptographic key pair locally.

The private key must never be sent to this registration service.

The registration service receives only:

* A public key, or
* A blinded public-key commitment in a later cryptographic stage.

## 4.4 Anonymous Voting Credential

An anonymous voting credential proves that a public key belongs to an eligible voter.

For the initial prototype, this may be represented by a digitally signed credential containing:

* Public key or public-key fingerprint.
* Election or voting-scope identifier.
* Voting weight.
* Credential version.
* Issue timestamp.
* Expiration timestamp.
* Issuer identifier.

Later stages should replace direct signing with a blind-signature or unlinkable credential protocol.

---

# 5. User Roles

## 5.1 System Administrator

Can:

* Log in securely.
* Create and manage voting scopes.
* Import eligible voters.
* Edit registration records.
* Generate activation QR codes.
* Revoke activation tokens.
* Revoke voting credentials.
* Reissue credentials.
* View audit events.
* Export operational reports.

Cannot:

* See voting selections.
* Access the ballot-service database.
* Determine how a credential voted.

## 5.2 Registration Operator

Optional restricted role.

Can:

* Search registration records.
* Confirm identity manually.
* Generate or reissue activation credentials.
* Mark credentials as delivered.
* Initiate recovery procedures.

Cannot:

* Change system configuration.
* Access cryptographic issuer private keys.
* Delete audit logs.

## 5.3 Auditor

Read-only role.

Can:

* Review registration counts.
* Review token issuance and redemption totals.
* Review revocation events.
* Verify published issuer public keys.
* Export audit information.

Cannot:

* Modify records.
* Generate credentials.
* View unnecessary personal information.

---

# 6. Main Functional Requirements

## 6.1 Authentication and Authorization

Implement secure administrative authentication.

Minimum requirements:

* Email and password login.
* Password hashing using Argon2id.
* Role-based access control.
* Secure session cookies or short-lived access tokens with refresh-token rotation.
* Rate limiting.
* Account lockout or progressive delay after repeated failures.
* Audit login success and failure.
* Support for optional TOTP-based multi-factor authentication in a later stage.

Do not use the same authentication mechanism for anonymous voters and administrators.

## 6.2 Registration Record Management

The administrator must be able to:

* Create a registration record.
* Edit contact and unit information.
* Set voting weight.
* Mark a record as eligible or ineligible.
* Assign an authorized representative.
* Add administrative notes.
* Search by unit, name, email, or status.
* Filter by activation and credential status.
* View record history.

Deletion should normally be avoided. Use soft deletion or inactive status.

## 6.3 Bulk Import

Support CSV import.

Suggested fields:

```csv
unit_number,owner_name,email,phone,voting_weight,eligible
A-101,Example Owner,owner@example.com,+5210000000000,1.0,true
```

Import requirements:

* Preview before committing.
* Validate required fields.
* Detect duplicates.
* Return row-level errors.
* Allow successful rows to be imported while rejecting invalid rows.
* Produce an import summary.
* Store import audit metadata.

## 6.4 Voting Scope Management

A voting scope represents one assembly, consultation, or election period.

Fields:

* UUID.
* Name.
* Description.
* Status.
* Start date.
* End date.
* Credential expiration.
* Whether voting weights are enabled.
* Issuer public-key version.
* Created and updated timestamps.

Statuses:

* Draft.
* Registration open.
* Activation open.
* Voting active.
* Closed.
* Archived.

This application does not create proposals or receive ballots. It only associates issued credentials with an allowed voting scope.

## 6.5 Activation Token Generation

The administrator must be able to generate an activation token for an eligible registration record.

Rules:

* Only one valid unredeemed activation token per registration record and voting scope.
* Generating a new token revokes the previous unredeemed token.
* The raw token is shown only once.
* Only the token hash is stored.
* The QR code must be downloadable as PNG and as a localized, single-page PDF generated in the administrator browser.
* Record who generated the token and when.
* Optionally record the delivery method.

The QR code should not display the owner name unless explicitly added to a separate printed cover page. The QR payload itself must remain anonymous and opaque.

## 6.6 Credential Activation

Activation flow:

1. The voter scans the QR code.
2. The voter-facing application extracts the opaque activation token.
3. The voter-facing application generates a public/private key pair locally.
4. The voter-facing application sends the activation token and public key to the registration API.
5. The registration service validates:

   * Token exists.
   * Token is not expired.
   * Token is not revoked.
   * Token has not been used.
   * Registration record remains eligible.
   * Voting scope accepts activation.
6. The registration service issues a signed anonymous voting credential.
7. The activation token becomes permanently redeemed.
8. The response returns the credential and issuer metadata.
9. The registration service must never receive the private key.

The activation API must be idempotent when safely possible.

Repeated submission of the same successfully redeemed token must not create multiple credentials.

## 6.7 Credential Revocation

Support credential revocation for:

* Lost device.
* Stolen QR before activation.
* Incorrect registration.
* Change of authorized representative.
* Administrative disqualification.
* Compromised credential.
* Recovery request.

A credential must have:

* Credential ID or fingerprint.
* Version.
* Status.
* Revocation timestamp.
* Revocation reason.
* Replacement credential reference, where applicable.

The ballot service must eventually be able to retrieve or verify revocation information without receiving voter identity data.

Possible interface:

```text
GET /public/credential-status/:credentialFingerprint
```

or a signed revocation list published periodically.

Avoid exposing private registration information through public credential-status endpoints.

## 6.8 Credential Reissuance

Recovery flow:

1. Administrator or operator verifies the person according to condominium procedures.
2. Existing activation tokens are revoked.
3. Existing credential is revoked.
4. Credential version is incremented.
5. A new activation QR is generated.
6. The replacement activation follows the normal activation process.
7. All actions are written to the audit log.

The old credential must remain invalid after replacement.

## 6.9 Audit Log

Create an append-only application audit log.

Audit at least:

* Administrative login attempts.
* Registration creation and updates.
* Eligibility changes.
* CSV imports.
* Activation-token creation.
* Token revocation.
* Token redemption.
* Credential issuance.
* Credential revocation.
* Credential replacement.
* Role and permission changes.
* Voting-scope changes.
* Export operations.

Audit entries must include:

* Event UUID.
* Timestamp.
* Actor type.
* Actor ID, when applicable.
* Event type.
* Target type.
* Target ID.
* Source IP for administrative actions.
* Structured metadata.
* Previous audit-entry hash.
* Current audit-entry hash.

Use a hash chain so later modification becomes detectable.

Do not place raw activation tokens, passwords, private keys, or vote data in audit logs.

---

# 7. Privacy Requirements

## 7.1 Data Minimization

Store only information necessary to manage voting eligibility.

Avoid collecting:

* Government identification numbers unless required.
* Biometric data.
* Device fingerprints.
* Advertising identifiers.
* Unnecessary browser telemetry.

## 7.2 Logging Restrictions

Do not log:

* Raw activation tokens.
* Credential private keys.
* Full QR URLs containing active tokens.
* Request bodies containing sensitive credential material.
* Vote choices.
* Ballot-service traffic.

Redact secrets from application logs.

## 7.3 Separation of Duties

Use separate:

* Database schemas or databases.
* Service accounts.
* encryption keys.
* deployment credentials.
* administrative permissions.

The registration service must never have direct read access to the ballot-service database.

The ballot service must never have direct read access to personal registration records.

---

# 8. Cryptographic Requirements

## 8.1 Initial Prototype

For the first working version:

* Generate signing keys outside application source code.
* Store the issuer private key in a protected secret store or mounted secret file.
* Use Ed25519 when supported consistently.
* Otherwise use ECDSA P-256.
* Publish the issuer public key.
* Sign a canonical serialized credential.
* Include a credential schema version.
* Verify signatures in automated tests.

Example credential payload:

```json
{
  "schemaVersion": 1,
  "credentialId": "random-uuid",
  "scopeId": "voting-scope-uuid",
  "publicKey": "base64url-encoded-public-key",
  "publicKeyAlgorithm": "Ed25519",
  "weight": "1.0000",
  "credentialVersion": 1,
  "issuedAt": "2026-07-14T18:00:00Z",
  "expiresAt": "2026-08-31T23:59:59Z",
  "issuer": "condominium-registration-service"
}
```

The signature must be separate or contained in a standard signed envelope.

## 8.2 Later Privacy Upgrade

Design the credential-issuance interface so a later stage can replace direct public-key signing with:

* Blind signatures.
* Anonymous credentials.
* Zero-knowledge proofs.
* Unlinkable issuance and redemption.

Do not tightly couple the ballot service to the initial credential format.

Define a versioned credential-verification interface.

---

# 9. Suggested Database Model

## AdminUser

* id
* email
* passwordHash
* role
* status
* failedLoginCount
* lockedUntil
* createdAt
* updatedAt

## VotingScope

* id
* name
* description
* status
* startsAt
* endsAt
* activationStartsAt
* activationEndsAt
* credentialExpiresAt
* issuerKeyVersion
* createdAt
* updatedAt

## RegistrationRecord

* id
* unitNumber
* ownerName
* representativeName
* email
* phone
* votingWeight
* eligible
* status
* notes
* createdAt
* updatedAt
* deletedAt

## ScopeEligibility

Allows eligibility to vary by voting scope.

* id
* registrationRecordId
* votingScopeId
* eligible
* votingWeight
* createdAt
* updatedAt

## ActivationToken

* id
* registrationRecordId
* votingScopeId
* tokenHash
* tokenPrefixForSupport
* status
* expiresAt
* generatedBy
* generatedAt
* deliveredAt
* redeemedAt
* revokedAt
* revocationReason

Statuses:

* Active.
* Redeemed.
* Expired.
* Revoked.

## IssuedCredential

For the initial prototype only.

* id
* registrationRecordId
* votingScopeId
* credentialId
* publicKeyFingerprint
* credentialVersion
* status
* issuedAt
* expiresAt
* revokedAt
* revocationReason
* replacedByCredentialId

This table creates a link between identity and credential in the prototype. Clearly document that this is temporary and does not provide strong cryptographic unlinkability.

In the blind-signature stage, remove or redesign this relationship so the issuer does not learn the final credential identifier.

## AuditEvent

* id
* occurredAt
* actorType
* actorId
* eventType
* targetType
* targetId
* metadata
* previousHash
* eventHash

---

# 10. API Design

Use REST with JSON and version all endpoints under:

```text
/api/v1
```

## Administrative Endpoints

```text
POST   /api/v1/admin/auth/login
POST   /api/v1/admin/auth/logout
POST   /api/v1/admin/auth/refresh
GET    /api/v1/admin/me
```

```text
GET    /api/v1/admin/registrations
POST   /api/v1/admin/registrations
GET    /api/v1/admin/registrations/:id
PATCH  /api/v1/admin/registrations/:id
POST   /api/v1/admin/registrations/import/preview
POST   /api/v1/admin/registrations/import
GET    /api/v1/admin/registration-imports/:id/errors.csv
```

```text
GET    /api/v1/admin/scopes
POST   /api/v1/admin/scopes
GET    /api/v1/admin/scopes/:id
PATCH  /api/v1/admin/scopes/:id
```

```text
POST   /api/v1/admin/registrations/:id/scopes/:scopeId/activation-token
POST   /api/v1/admin/activation-tokens/:id/delivered
POST   /api/v1/admin/activation-tokens/:id/revoke
POST   /api/v1/admin/credentials/:id/revoke
POST   /api/v1/admin/credentials/:id/reissue
```

```text
GET    /api/v1/admin/audit-events
GET    /api/v1/admin/reports/registration-summary
```

## Public Activation Endpoints

```text
POST   /api/v1/public/activate
GET    /api/v1/public/issuer-keys
GET    /api/v1/public/scopes/:scopeId/status
```

Example activation request:

```json
{
  "activationToken": "opaque-random-token",
  "publicKey": "base64url-public-key",
  "publicKeyAlgorithm": "Ed25519",
  "clientNonce": "base64url-random-nonce"
}
```

Example response:

```json
{
  "credential": {
    "payload": {
      "schemaVersion": 1,
      "credentialId": "uuid",
      "scopeId": "uuid",
      "publicKey": "base64url-public-key",
      "publicKeyAlgorithm": "Ed25519",
      "weight": "1.0000",
      "credentialVersion": 1,
      "issuedAt": "2026-07-14T18:00:00Z",
      "expiresAt": "2026-08-31T23:59:59Z",
      "issuer": "condominium-registration-service"
    },
    "signature": "base64url-signature",
    "keyVersion": "2026-01"
  }
}
```

---

# 11. Administrative Interface

Create a responsive web interface containing:

## Dashboard

Show:

* Total eligible records.
* Eligible records by scope.
* Activation tokens generated.
* Tokens redeemed.
* Tokens expired.
* Credentials issued.
* Credentials revoked.
* Registrations not yet activated.

## Registration List

Columns:

* Unit.
* Owner or representative.
* Eligibility.
* Weight.
* Activation status.
* Credential status.
* Last update.
* Actions.

## Registration Detail

Show:

* Registration information.
* Voting-scope eligibility.
* Activation-token status.
* Credential status.
* Audit history.
* Generate, revoke, and reissue actions.

Never display raw activation tokens after the initial generation screen.

## QR Generation Screen

After generating a token:

* Show QR code.
* Show printable activation instructions.
* Allow one-time download.
* Warn that the QR cannot be shown again.
* Require confirmation that it was securely delivered.

## Audit Screen

Provide filters by:

* Date.
* Event type.
* Actor.
* Registration record.
* Voting scope.

---

# 12. Non-Functional Requirements

## Performance

Expected condominium scale:

* 50 to 5,000 registration records.
* Low concurrent administrative traffic.
* Activation bursts during assemblies.
* API response target below 500 ms under normal conditions.

Do not overengineer for national scale.

## Availability

For the pilot:

* Graceful error handling.
* Health-check endpoint.
* Database connection monitoring.
* Structured logs.
* Backup and restore documentation.

## Accessibility

The administrative interface should:

* Support keyboard navigation.
* Use readable labels.
* Maintain sufficient contrast.
* Avoid relying only on color.
* Work on desktop and tablet.

## Localization

Prepare for Spanish and English.

Do not hard-code interface strings throughout the components.

The initial default language may be Spanish.

---

# 13. Implementation Stages

Codex must implement this project incrementally.

Do not attempt all stages in one pass.

Each stage must end with:

* Working code.
* Tests.
* Database migrations when applicable.
* Updated README.
* Manual verification instructions.
* A short list of known limitations.

---

## Stage 1 — Repository and Local Infrastructure

Implement:

* Monorepo or clearly separated frontend/backend folders.
* TypeScript configuration.
* Fastify backend.
* React administrative frontend.
* PostgreSQL.
* Prisma.
* Docker Compose.
* Health endpoint.
* Environment-variable validation.
* Basic CI workflow.
* Formatting and linting.
* Initial README.

Acceptance criteria:

* The complete project starts locally using one documented command.
* Backend health endpoint returns success.
* Frontend loads.
* Backend connects to PostgreSQL.
* Tests run successfully.

Do not implement authentication or business functionality yet.

---

## Stage 2 — Administrative Authentication and Roles

Implement:

* AdminUser model.
* Database migration.
* Seed command for initial administrator.
* Login.
* Logout.
* Session or token refresh.
* Argon2id password hashing.
* Role middleware.
* Protected frontend routes.
* Login audit events.
* Basic administrator-management screen.

Acceptance criteria:

* An administrator can log in and access the dashboard.
* Invalid credentials are rejected.
* Protected endpoints cannot be accessed anonymously.
* Password hashes are never exposed.
* Authentication tests pass.

---

## Stage 3 — Voting Scope Management

Implement:

* VotingScope database model.
* CRUD API.
* Status validation.
* Administrative list and edit screens.
* Date validation.
* Audit events.

Acceptance criteria:

* An administrator can create and edit a voting scope.
* Invalid date combinations are rejected.
* Scope changes appear in the audit log.
* Closed scopes cannot return to voting-active status without an explicit privileged operation.

---

## Stage 4 — Registration Records

Implement:

* RegistrationRecord model.
* ScopeEligibility model.
* CRUD API.
* Search and filters.
* Administrative list and detail screens.
* Voting-weight support.
* Soft deletion.
* Audit history.

Acceptance criteria:

* Records can be created, edited, disabled, and searched.
* Voting weights use fixed-point decimal values, never floating-point arithmetic.
* Ineligible records cannot receive activation tokens.
* Tests cover validation and permissions.

---

## Stage 4.1 — Internationalization

Implement:

* English and Spanish administrative-interface messages.
* Browser-language detection using the browser's ordered language preferences.
* English as the fallback when no supported language can be detected.
* Locale-aware date and time formatting.
* Localized role and voting-scope status labels.
* Translator-friendly message catalogs that include an English description of every message's purpose and context.
* Automated tests for detection, fallback, translation selection, and message interpolation.

Keep source-code identifiers, API contracts, error codes, and developer documentation in English. User-visible messages must use the localization layer rather than hard-coded text. Message catalogs must remain editable as ordinary source files without requiring an external translation service.

Acceptance criteria:

* A browser preferring Spanish displays the administrative interface in Spanish.
* English and unsupported browser languages display the interface in English.
* The document language and locale-aware dates match the selected language.
* Each message has enough English context for a translator to understand its purpose.
* Adding or updating a translation requires only a simple message-catalog edit.

---

## Stage 4.2 — Test Database Isolation

Implement:

* A dedicated `registration_test` database separate from development data.
* An ephemeral PostgreSQL test service with its own host port.
* A single command that starts the test service, applies migrations, and runs database integration tests.
* A reset guard requiring both explicit reset permission and the exact test database name.
* Automated tests for allowed, development, missing, and malformed database URLs.
* Documentation that clearly distinguishes development and test database ports.

Acceptance criteria:

* Database integration tests cannot reset the normal `registration` database.
* `npm run test:integration` provisions and tests only `registration_test`.
* Development administrators, scopes, registrations, and audit events survive integration-test runs.
* Ordinary unit-test runs do not require PostgreSQL or destructive reset permission.

---

## Stage 5 — CSV Import

Implement:

* CSV upload.
* Preview.
* Validation.
* Duplicate detection.
* Partial success.
* Import summary.
* Audit metadata.
* Downloadable error report.

Acceptance criteria:

* Valid rows are imported.
* Invalid rows identify exact row and field errors.
* Duplicate unit identifiers are handled deterministically.
* Importing the same file twice does not silently create duplicates.

Implementation contract:

* Preview and commit accept the original CSV text and file name; commit always revalidates server-side.
* Files are limited to 2 MiB and 5,000 data rows.
* Supported headers are `unit_number`, `owner_name`, `representative_name`, `email`, `phone`, `voting_weight`, `eligible`, `status`, and `notes`.
* `unit_number` and `owner_name` are required; optional values receive documented defaults.
* Unit identifiers are normalized to uppercase, and the database enforces uppercase unique storage.
* Imports are serialized, existing units are rejected, and later duplicate units in one file are rejected deterministically.
* A SHA-256 content hash prevents the same file content from being committed twice, even under a different file name.
* Error reports contain row, field, code, and localized-displayable error type without copying source field values.

---

## Stage 6 — Activation Token and QR Generation

Implement:

* ActivationToken model.
* Cryptographically secure opaque tokens.
* Hash-only storage.
* Expiration.
* Revocation.
* Single valid token per record and scope.
* QR generation.
* One-time token display.
* Administrative generation and revocation UI.
* Audit events.

Acceptance criteria:

* Raw tokens are never stored.
* A token cannot be redeemed twice.
* Generating a replacement revokes the previous token.
* QR codes contain no personal information.
* Token endpoints are rate limited.

Stage 6.1 foundation implementation contract:

* Tokens contain 32 bytes (256 bits) of randomness from Node.js cryptography APIs and use base64url encoding.
* Only a SHA-256 token hash and an eight-character support prefix are persisted.
* PostgreSQL enforces token formats, expiration ordering, lifecycle timestamp consistency, and one ACTIVE token per registration record and voting scope.
* Stage 6.2 adds rate-limited administrative generation/replacement and revocation endpoints.
* Generation requires an ACTIVATION_OPEN scope, an active and globally eligible registration without an ineligible scope override, and an activation window that has not ended.
* Token expiration defaults to the scope activation end; a custom expiration must fall after activation starts and cannot exceed activation end.
* Replacement atomically revokes the previous ACTIVE token for the registration and scope before creating the new token. Global or scope-level ineligibility and soft deletion atomically invalidate affected ACTIVE tokens.
* Every revoked token has a nonblank reason, and automatic expiration or revocation caused by eligibility changes or soft deletion creates a token-specific audit event in the same transaction.
* The raw token appears only in the successful generation response; later responses, storage, logs, and audit metadata expose only non-secret lifecycle fields.
* Generation, replacement, and revocation create audit events without raw token material.
* Stage 6.3 generates QR PNG data locally in the administrator browser from the one-time raw-token response; the QR payload is the opaque token only and contains no personal information.
* The administrative UI supports generation, atomic replacement, active-token status, revocation, printable instructions, and one-time PNG download.
* Secure-delivery confirmation rechecks registration and scope eligibility, records the delivery timestamp and method atomically with its audit event, and permanently hides the raw token and QR from the UI.
* If local QR rendering fails, the valid replacement remains active and the UI preserves the one-time raw-token fallback instead of leaving the registration without an active token.
* The qrcode dependency evaluation, license, security audit, and compatibility evidence are documented in README.md.
* Stage 6.4 generates a localized, single-page PDF in the administrator browser with the anonymous QR, fallback token, instructions, warning, and non-secret support prefix. It includes no owner, unit, email, or other personal data, and PDF download does not confirm delivery.
* The jsPDF dependency evaluation, license, security audit, compatibility, and release evidence are documented in README.md.

---

## Stage 7 — Prototype Credential Issuance

Implement:

* Public-key acceptance.
* Issuer signing keys.
* Canonical credential serialization.
* Credential signature.
* Issuer public-key endpoint.
* IssuedCredential model.
* Idempotent activation.
* Activation validation.
* Credential expiration.
* Automated signature-verification tests.

Acceptance criteria:

* A valid activation token and valid public key return one signed credential.
* The private key never reaches the backend.
* Expired, revoked, or previously redeemed tokens are rejected.
* Repeated identical requests do not create extra credentials.
* The returned credential can be independently verified.

Clearly document that this stage provides operational anonymity only and that the issuer still stores a temporary identity-to-credential link.

---

## Stage 8 — Revocation and Reissuance

Implement:

* Credential revocation.
* Credential versioning.
* Reissuance workflow.
* Signed public revocation list or status endpoint.
* Administrative recovery interface.
* Audit events.

Acceptance criteria:

* A revoked credential is publicly detectable as invalid without exposing voter identity.
* Reissuance invalidates the old credential.
* Recovery actions require appropriate permissions.
* The complete lifecycle is covered by integration tests.

---

## Stage 9 — Audit Integrity and Operational Reports

Implement:

* Hash-chained audit events.
* Audit verification command.
* Registration summary report.
* Activation summary report.
* Credential status report.
* CSV export.
* Security-sensitive export auditing.

Acceptance criteria:

* Modifying an older audit row causes verification failure.
* Reports do not expose raw activation secrets.
* Auditor role can access reports but cannot modify records.
* Exports are reproducible and documented.

---

## Stage 10 — Privacy Hardening

Implement:

* Sensitive-log redaction.
* Reduced IP retention.
* Configurable administrative-log retention.
* Separate database credentials.
* Strict Content Security Policy.
* CSRF protection.
* Secure HTTP headers.
* Dependency scanning.
* Threat-model document.
* Data-retention configuration.
* Backup-encryption documentation.

Acceptance criteria:

* Secrets do not appear in normal logs.
* Security headers are verified by automated tests.
* The threat model identifies trust boundaries and residual risks.
* Registration and ballot-service access controls are explicitly separated.

---

## Stage 11 — Blind Credential Prototype

Implement this only after the direct-signature prototype is stable.

Replace direct signing of the visible public key with a blind-signature or unlinkable-token issuance flow.

Requirements:

* Client blinds a credential commitment.
* Registration service authenticates the activation token.
* Registration service signs the blinded value.
* Client unblinds the result.
* Registration service cannot recognize the resulting credential during later ballot use.
* Issuance remains limited to one valid credential per entitlement and scope.
* Include protocol documentation and cryptographic test vectors.

Acceptance criteria:

* The final credential verifies against the issuer public key.
* Stored issuer data cannot directly identify the final credential.
* Automated tests prove correct blinding and unblinding.
* The implementation uses a reviewed library or clearly identified experimental code.
* The README explicitly states whether the implementation is production-ready or experimental.

---

# 14. Testing Requirements

Include:

* Unit tests.
* API integration tests.
* Database integration tests.
* Authentication tests.
* Authorization tests.
* Token expiration tests.
* Token replay tests.
* Credential-signature tests.
* Revocation tests.
* Audit-chain verification tests.
* CSV import tests.

Security-relevant tests must include:

* Brute-force protection.
* Duplicate activation attempts.
* Expired token rejection.
* Revoked token rejection.
* Unauthorized administrative access.
* Invalid public-key formats.
* Oversized request bodies.
* Malformed JSON.
* SQL-injection attempts through normal inputs.
* Sensitive-data log redaction.

---

# 15. Out of Scope

Do not implement in this application:

* Proposal management.
* Ballot selection.
* Vote storage.
* Vote counting.
* Public election results.
* Blockchain.
* Tor integration.
* Mix networks.
* Homomorphic tallying.
* Mobile-native applications.
* Biometric voter databases.
* Government identity integration.

Those belong to other applications or later experiments.

---

# 16. Definition of Done

The Registration Service is complete for the condominium pilot when:

* Administrators can load and manage the eligible-voter register.
* Each eligible entitlement can receive one secure activation QR.
* A voter application can redeem that QR.
* A voter-generated public key receives a verifiable signed credential.
* The token cannot be reused.
* Credentials can be revoked and replaced.
* The service does not receive ballots.
* Operational actions are auditable.
* Personal data and anonymous voting operations remain separated.
* The project can be deployed and tested using documented commands.
