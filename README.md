# Condominium Voting System

Registration and Credential Issuance Service through Stage 11: Fastify API, React administrative shell, PostgreSQL through Prisma, activation tokens, experimental RSA partially-blind credential issuance, revocation, hash-chained audit verification, operational reports, and privacy hardening.

## Requirements

- Node.js 24.15.0
- npm 11+
- Docker with Docker Compose

## Engineering policy

Prefer mature, actively maintained libraries over custom implementations when
they meet the requirement. Evaluate compatibility, licensing, maintenance, and
security before adoption. Custom implementations of established formats,
protocols, cryptographic primitives, or general-purpose infrastructure require
a documented technical justification and focused tests.

## Start locally

After selecting the version in .nvmrc, install dependencies and generate the Prisma client:

    npm install
    npm run db:generate
    docker compose up

That single Compose command starts PostgreSQL, the API, and the admin frontend, and seeds a development system administrator. Open http://localhost:5173 and sign in as `admin@example.com` with password `ManualTest-2026`. The API runs on http://localhost:3001.

These Compose credentials are development-only. Restarting the API container resets that administrator to the same password.

The admin frontend uses same-origin API paths. When it is opened remotely (for example, http://ispy.local:5173), Vite proxies /api requests to the API container, so the remote browser never tries to contact its own localhost.

PostgreSQL is exposed to the host on port `15432`; containers continue to connect to it internally on port `5432`.

For host-based development, or to reset the password after changing it, run:

    npm run db:seed

That restores `admin@example.com` to `ManualTest-2026`. Override with `ADMIN_EMAIL` and `ADMIN_PASSWORD` only when you need a different development account. The seed is idempotent for the supplied email. It hashes the password with Argon2id and never prints it.

Database integration tests run only against the isolated `registration_test` database. Run `npm run test:integration`; it starts an ephemeral PostgreSQL test service on host port `15433`, applies migrations, enables reset permission, and runs the API integration suite. The suite also refuses to reset any database not named `registration_test`.

For host-based development, copy each app's .env.example to .env, run npm run dev:infra, and then npm run dev.

## Verification

Check /health/live, /health/ready, and /api/v1 on port 3001. The readiness endpoint verifies PostgreSQL connectivity. Run npm run check for formatting, linting, type checking, tests, and builds.
Check /health/live, /health/ready, and /api/v1 on port 3001. The readiness endpoint verifies PostgreSQL connectivity. Run npm run check for formatting, linting, type checking, tests, and builds.

## Stage 2 authentication

Administrative authentication uses an opaque, hashed, eight-hour server-side session in an HTTP-only, SameSite=Strict cookie. Five failed logins lock an account for 15 minutes. Login attempts, logout, password changes, TOTP enrollment, and administrator creation are audited.

An administrator can change their password by supplying the current password. Other sessions are revoked. They can enroll optional TOTP; when it is enabled, login requires a valid six-digit code. TOTP secrets are returned only during setup and are excluded from later responses, logs, and audit metadata.

Roles are SYSTEM_ADMIN, REGISTRATION_OPERATOR, and AUDITOR. Only a system administrator can list and create administrator accounts in this stage.

The API uses otpauth 9.5.1 for TOTP instead of a custom RFC 6238 implementation. It was selected for its maintained Node and TypeScript support, MIT license, and standard otpauth URL output. Version 9.5.1 is compatible with this project’s Node 24 and Fastify 5 setup. At selection time, npm reported no known production dependency vulnerabilities. Maintenance and license evidence: https://www.npmjs.com/package/otpauth and https://github.com/hectorm/otpauth.

## Known limitations

- Voting scopes, voter records, CSV imports, activation tokens, prototype credential issuance, revocation, and reissuance are implemented. Anonymous voting remains for later stages.
- Account editing is deferred. The dashboard lists recent audit events with type and date filters; it is not a full forensic viewer.

## Stage 3 voting scopes

Authenticated administrators can list voting scopes. System administrators can create and edit scopes and advance them through DRAFT, REGISTRATION_OPEN, ACTIVATION_OPEN, VOTING_ACTIVE, CLOSED, and ARCHIVED. Transitions are one-way, date ranges are validated, optimistic versions reject stale writes, and every mutation is audited.

The current UI supports creation, field editing while DRAFT or REGISTRATION_OPEN, explicit forward transitions, and a privileged SYSTEM_ADMIN rollback from CLOSED to VOTING_ACTIVE with a recorded reason.

Activation and voting windows may overlap. Each window must be internally ordered, and credential expiration must be after both windows end.

## Stage 4 registration records

Administrators and registration operators can create, search, filter, update, and assign per-scope eligibility to voting-entitlement records. Filters cover status, global eligibility, and whether an active activation token exists. The edit form covers unit, owner, representative, contact, weight, eligibility, status, and notes, and shows that record’s audit history. Weights use PostgreSQL DECIMAL(12,4), never floating-point storage. System administrators may soft-delete records; auditors have read-only access. All mutations are audited and stale updates are rejected using record versions.

## Stage 4.1 internationalization

The administrative interface supports English and Spanish. It checks the browser's ordered language preferences, selects the first supported language, and defaults to English when none is supported. The selected locale also controls document language, dates, role names, and voting-scope status labels.

User-visible text is maintained in `apps/registration-admin/src/i18n/messages.ts`. Every message contains an English description of its purpose plus its English and Spanish text, so translators can update the catalog with a simple file edit. Source identifiers, API error codes, and developer-facing documentation remain in English.

Known limitation: users cannot override the detected language from inside the interface yet; a persistent language selector can be added in a later stage.

## Stage 4.2 test database isolation

Development data uses `registration` on host port `15432`. Destructive integration tests use a separate ephemeral `registration_test` PostgreSQL service on port `15433`. The test runner requires both `ALLOW_DATABASE_RESET=true` and the exact database name `registration_test`; either safeguard prevents a reset when misconfigured.

Run the complete database integration workflow from the repository root with `npm run test:integration`. The ordinary `npm test` command keeps database integration tests skipped.

## Stage 5 CSV import

System administrators and registration operators can upload a CSV, preview validation results, and explicitly commit only valid rows. Auditors cannot preview, commit, or download import error reports. Each commit stores a SHA-256 file hash, counts, actor, timestamp, row-level errors, and a hash-chained audit event. Re-uploading identical file content returns a conflict instead of creating duplicates.

Required headers are `unit_number` and `owner_name`. Unit identifiers are normalized to uppercase and stored uniquely. Optional headers are `representative_name`, `email`, `phone`, `voting_weight`, `eligible`, `status`, and `notes`. Voting weight defaults to `1.0000`, eligibility to `true`, and status to `ACTIVE`. Files are limited to 2 MiB and 5,000 data rows. Quoted commas, escaped quotes, and quoted line breaks are supported.

Invalid rows show their exact CSV row and field. Valid rows can still be committed, and the resulting error report can be downloaded as CSV without including the rejected source values. Existing units and later duplicate units in the same file are rejected; the first valid occurrence wins.

Known limitations: imports create new registration records only; updating existing units and assigning per-scope eligibility through CSV are deferred. Error explanations are localized in the UI, while error-report codes remain stable English API identifiers.

## Stage 6 activation-token lifecycle and QR delivery

Activation tokens use 32 bytes (256 bits) of cryptographically secure randomness encoded as URL-safe opaque strings. Only SHA-256 hashes and an eight-character support prefix are persisted. The raw token is returned exactly once by the administrative generation response and is excluded from later responses, storage, logs, and audit metadata.

POST /api/v1/admin/registrations/:id/scopes/:scopeId/activation-token generates or replaces a token for an eligible registration. Replacement atomically revokes the prior ACTIVE token. Expiration defaults to the scope activation end and cannot exceed it. POST /api/v1/admin/activation-tokens/:id/revoke revokes an ACTIVE token with a reason. Both endpoints require registration-write permission, are rate limited to 10 requests per minute per client, and create audit events.

Stage 6 Step 3 generates the opaque-token QR locally in the administrator browser, supports a one-time PNG download and printable instructions, records secure-delivery confirmation, and exposes non-secret active-token status for later revocation or replacement. Stage 6 Step 4 adds a one-page, browser-generated activation PDF containing the anonymous QR, fallback token, localized instructions, warning, and non-secret support prefix. The PDF contains no owner, unit, email, or other personal data, and downloading it does not replace explicit secure-delivery confirmation. The raw token and QR data are discarded after delivery confirmation, selection changes, revocation, or page exit.

The admin uses qrcode 1.5.4 instead of a custom QR encoder. It was selected for its established Node/browser implementation and PNG data-URL support. The package is MIT licensed, declares Node >=10.13 compatibility, and is compatible with this project’s Node 24, React 19, Vite 6, and TypeScript setup. At selection time, npm reported no known production dependency vulnerabilities; qrcode 1.5.4 and the @types/qrcode 1.5.6 definitions were the current published releases. Maintenance and release evidence: https://www.npmjs.com/package/qrcode and https://github.com/soldair/node-qrcode.

The admin uses jsPDF 4.2.1 for browser-local PDF generation instead of implementing the PDF format. It was selected because it is an established client-side library with built-in TypeScript definitions, current releases, and direct PNG embedding. Version 4.2.1 is MIT licensed, compatible with this project’s Node 24, React 19, Vite 6, and TypeScript setup, and includes fixes for the security issues disclosed in its release notes. At selection time, npm audit reported no known vulnerabilities. Maintenance, license, release, and security evidence: https://www.npmjs.com/package/jspdf and https://github.com/parallax/jsPDF/releases.

## Stage 7 prototype credential issuance

Stage 7 introduced public activation. Stage 11 replaced direct Ed25519 signing of the voter public key with the experimental partially-blind RSA flow documented below. Historical Stage 7 behavior is no longer served.

## Stage 8 credential revocation and reissuance

POST /api/v1/admin/credentials/:id/revoke requires registration-write permission and a nonblank reason. It marks the credential REVOKED and revokes leftover ACTIVE activation tokens for that registration and scope. Auditors receive 403.

POST /api/v1/admin/credentials/:id/reissue performs the recovery workflow in one transaction: revoke the current credential if it is still ACTIVE, revoke leftover tokens, increment the next credential version, and return a one-time replacement activation token. The voter completes replacement through the normal public activation endpoint. The previous credential stays invalid. A credential that already has a successor is rejected.

GET `/api/v1/public/issuance-status/:issuanceId` returns ACTIVE, REVOKED, or EXPIRED for an internal issuance id. GET `/api/v1/public/scopes/:scopeId/revocations` returns a signed list of revoked issuance ids. Neither public endpoint includes owner, unit, registration id, public key, revocation reason, or the unlinkable credential identifier.

The administrative UI shows credential status on each record and, for the selected registration and scope, supports revoke and reissue. Reissue reuses the existing one-time QR delivery screen. All recovery actions are audited as CREDENTIAL_REVOKED and CREDENTIAL_REISSUED.

Pending manual tests:

- On a registration that already has an issued credential, the dashboard shows status and version and does not show a public key.
- Revoke from that record with a reason. Status becomes revoked.
- Reissue with a reason. The existing QR delivery screen appears with a replacement token. The previous issuance stays revoked.
- Reissuing the original credential again is rejected.
- An auditor can view the record but cannot revoke or reissue.

When creating a local voting scope, set issuer key version to `dev-2026-01` so it matches the Compose issuer.

## Stage 9 audit integrity and operational reports

Audit events are hash-chained. Each row stores a monotonic `chainIndex`, the previous event hash, and `eventHash` = SHA-256 of canonical JSON with a fixed field order (`id`, `occurredAt`, `actorType`, `actorId`, `eventType`, `targetType`, `targetId`, `sourceIp`, sorted `metadata`, `previousHash`). Append uses `pg_advisory_xact_lock` so concurrent writers cannot fork the chain.

Verify the stored chain against the current `DATABASE_URL`:

    npm run audit:verify

The command exits 0 when the chain is intact and 1 when an older row was modified, a hash link is broken, or `chainIndex` has a gap. It prints the first failing event id.

GET `/api/v1/admin/reports/registration-summary`, `/activation-summary`, and `/credential-status` return count snapshots. Append `.csv` for a downloadable export. Optional `asOf` (RFC 3339) freezes token and credential expiration classification and is copied into every CSV row so the same instant yields the same file. CSV column order is documented in `apps/registration-api/src/reports.ts`. Reports contain totals and scope names only: no owner, unit, email, raw activation token, public key, or token hash.

Any authenticated administrator, including AUDITOR, can read reports. Auditors still cannot create or modify records. CSV downloads write `REPORT_EXPORTED` audit events with `{ report, format: "csv", asOf }` and never include snapshot contents or secrets.

GET `/api/v1/admin/audit-events` accepts `eventType`, `actorId`, `targetType`, `targetId`, `from`, and `to`.

Pending manual tests:

- Sign in as the development administrator, open the dashboard, and confirm eligible-record, token, and credential totals.
- Download each CSV. Re-download with the same `asOf` and confirm the files match. Confirm the files contain no owner names or activation tokens.
- Sign in as an auditor (create one from the administrator list). Confirm reports and CSV links work, and that creating a registration is forbidden.
- Run `npm run audit:verify` against the development database; it should report a valid chain. Using `psql`, change `metadata` on an older `AuditEvent` row and run the command again; it must fail. Restore the row or re-seed afterward.

Events written before this stage used a non-canonical hash payload. After migrating, run `npm run audit:verify`; if historical rows fail, reset or re-seed the development database. Do not rewrite hashes to hide tampering.

## Stage 10 privacy hardening

Application logs redact passwords, cookies, activation tokens, public keys, and TOTP material. Automated tests serialize a Pino line with the same redact paths and fail if the raw secrets still appear.

Audit `sourceIp` is truncated at write time (IPv4 /24, IPv6 /48) because that field is hashed. Setting `SOURCE_IP_MODE=omitted` stores null instead. Do not rewrite historical IPs.

`AUDIT_RETENTION_DAYS` (default 2555) and `APPLICATION_LOG_RETENTION_DAYS` (default 30) are documented in `docs/DATA_RETENTION.md`. `npm run audit:retain` reports how many audit events are older than the live window and does not delete them.

Compose uses split PostgreSQL roles: `voting` owns migrations and seed, `registration_app` is the API runtime user, and `registration_readonly` is SELECT-only. The API refuses `BALLOT_DATABASE_URL` and `VOTING_DATABASE_URL` so ballot-service credentials cannot be loaded into this process. If an existing Compose volume predates the init script, `npm run db:grant-roles` (already part of the API container command) creates the roles.

The API uses @fastify/helmet 13.1.1 instead of hand-written header middleware. It is the official Fastify 5 wrapper around Helmet (MIT, actively maintained). Headers include `Content-Security-Policy: default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'`. CSRF protection for cookie-authenticated `/api/v1/admin` writes is Origin/Referer matching `ADMIN_ORIGIN`, plus SameSite=Strict cookies and `X-Requested-With: XMLHttpRequest` from the administrative UI. Public activation is excluded; it authenticates with the one-time token, not the session cookie.

CI runs `npm run audit:deps` (`npm audit --omit=dev --audit-level=critical` on the app workspaces). Fastify 5.12.1, find-my-way 9.9.0, and fast-uri 3.1.5 address router and URI advisories. Remaining high findings in `npm audit` come from the Prisma 6.19 CLI (`deepmerge-ts`); do not downgrade Prisma to 6.12 to silence them. Threat model, retention, and backup encryption: `docs/THREAT_MODEL.md`, `docs/DATA_RETENTION.md`, `docs/BACKUP_ENCRYPTION.md`.

Passed manual tests:

- Sign in from the admin UI, then in the browser network panel confirm mutating calls include `Origin` for `http://localhost:5173` (or the host you opened) and `X-Requested-With: XMLHttpRequest`.
- `curl -D- http://localhost:3001/health/live` and confirm `content-security-policy`, `x-frame-options: DENY`, and `x-content-type-options: nosniff`.
- `curl -X POST http://localhost:3001/api/v1/admin/auth/login -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{"email":"admin@example.com","password":"ManualTest-2026"}'` returns `CSRF_ORIGIN_REJECTED`.
- Repeat the login from the UI origin header and confirm it succeeds.
- `npm run audit:retain` prints a cutoff and `deleted: false`.
- After Compose recreate, connect as `registration_app` / `voting_app` and confirm DML works; connect as `registration_readonly` / `voting_readonly` and confirm INSERT is denied.

Known limitations:

- Local Docker credentials remain development-only. Recreate the Postgres volume (or rely on `db:grant-roles`) after pulling this stage so split roles exist.
- The admin CSP meta tag allows `'unsafe-eval'` for Vite HMR. Production static hosting should serve a stricter CSP without eval.
- Hash-chained audit events are archived operationally, not physically pruned.
- HTTPS termination and production secret storage remain deployment concerns.

## Stage 11 blind credential prototype (experimental)

This stage is **not production-ready**. It replaces direct Ed25519 signing of the voter public key with an experimental partially-blind RSA issuance flow. The protocol, library choice, and limitations are documented in `docs/BLIND_CREDENTIALS.md`.

The API uses @cloudflare/blindrsa-ts 0.4.6 (Apache-2.0, Node >= 24) for RFC 9474 RSA blind signatures and draft-amjad-cfrg-partially-blind-rsa-02 public metadata. Node 24 has no built-in blind-signature API. The suite is `RSAPBSSA-SHA384-PSS-Randomized`. Issuer keys must be RSA-2048 with safe primes; generate them with `npm run issuer:generate -w @voting/registration-api`. Ordinary OpenSSL RSA keys are not suitable. The Compose and `.env.example` values are development-only.

Issuance:

1. POST `/api/v1/public/activation-context` with `{ activationToken }` returns `publicMetadata` (scope, weight, version, expiry, issuer, key version). The token is not redeemed.
2. The voter app blinds a commitment `{ credentialId, publicKey, publicKeyAlgorithm }` using that metadata. The private key never leaves the client.
3. POST `/api/v1/public/activate` with the token, protocol, blinded message, echoed public metadata, and client nonce. The API authenticates the token, signs the blinded value, redeems the token, and stores an issuance row that does **not** contain the voter public key, credential id, or unblinded signature.
4. The client unblinds. The resulting signature verifies against the issuer public key from GET `/api/v1/public/issuer-keys`.

Repeated identical blinded messages return the original blinded signature without creating another row. A different blinded message after redemption is rejected. One active issuance remains per registration and scope.

GET `/api/v1/public/issuance-status/:issuanceId` reports ACTIVE, REVOKED, or EXPIRED for the internal issuance id (not the unlinkable credential). GET `/api/v1/public/scopes/:scopeId/revocations` lists revoked issuance ids. Neither includes owner, unit, registration id, public key, or revocation reason. A later ballot service cannot match a presented credential to those ids using stored issuer data.

Administrative revoke and reissue still work on the entitlement. They prevent a new activation and mark the issuance REVOKED. They do **not** make the previously unblinded mathematical signature fail verification. Cryptographic invalidation of outstanding credentials requires waiting for `expiresAt` or rotating the issuer key / `ISSUER_KEY_VERSION`.

Blinding, unblinding, replay, and issuer-key matching are covered by `npm test` and `npm run test:integration`. Manual checks are the administrative UI only.

Passed manual tests:

- Create a scope with issuer key version `dev-2026-01`. Advance it from DRAFT through REGISTRATION_OPEN to ACTIVATION_OPEN.
- Create an eligible registration, generate an activation QR, download the PNG or PDF, and confirm secure delivery. The screen must not show owner, unit, or email on the QR/PDF.
- After an issuance exists for that record, the dashboard shows credential version and ACTIVE without a public key or credential UUID.
- Revoke with a reason from the same record. Status becomes revoked. Reissue with a reason and confirm the replacement QR delivery screen. Reissuing the original credential again is rejected.

Known limitations:

- Experimental prototype. Partially-blind RSA is an IRTF draft, not a finished IETF standard.
- Unique voting weights can still distinguish a small number of entitlements in public metadata.
- Per-credential cryptographic revocation is not available without storing the final credential identifier.
