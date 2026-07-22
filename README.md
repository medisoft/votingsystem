# Condominium Voting System

Stage 1 foundation for the Registration and Credential Issuance Service: Fastify API, React administrative shell, PostgreSQL through Prisma, and automated quality checks. It intentionally contains no authentication or registration business functionality.

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

That single Compose command starts PostgreSQL, the API, and the admin frontend. Open http://localhost:5173. The API runs on http://localhost:3000.

The admin frontend uses same-origin API paths. When it is opened remotely (for example, http://ispy.local:5173), Vite proxies /api requests to the API container, so the remote browser never tries to contact its own localhost.

PostgreSQL is exposed to the host on port `15432`; containers continue to connect to it internally on port `5432`.

Create or reset the initial system administrator after the stack is running:

    ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='choose-at-least-12-characters' npm run db:seed

The seed is idempotent for the supplied email. It hashes the password with Argon2id and never prints it.

Database integration tests run only against the isolated `registration_test` database. Run `npm run test:integration`; it starts an ephemeral PostgreSQL test service on host port `15433`, applies migrations, enables reset permission, and runs the API integration suite. The suite also refuses to reset any database not named `registration_test`.

For host-based development, copy each app's .env.example to .env, run npm run dev:infra, and then npm run dev.

## Verification

Check /health/live, /health/ready, and /api/v1 on port 3000. The readiness endpoint verifies PostgreSQL connectivity. Run npm run check for formatting, linting, type checking, tests, and builds.

## Stage 2 authentication

Administrative authentication uses an opaque, hashed, eight-hour server-side session in an HTTP-only, SameSite=Strict cookie. Five failed logins lock an account for 15 minutes. Login attempts, logout, and administrator creation are audited.

Roles are SYSTEM_ADMIN, REGISTRATION_OPERATOR, and AUDITOR. Only a system administrator can list and create administrator accounts in this stage.

## Known limitations

- Voting scopes, voter records, CSV imports, and activation-token delivery are implemented. Activation-token redemption, credential issuance, and voting remain for later stages.
- Account editing, password reset, TOTP, and the complete audit viewer are deferred.
- Audit events are hash-linked, but full verification and concurrency hardening belong to Stage 9.

## Stage 3 voting scopes

Authenticated administrators can list voting scopes. System administrators can create and edit scopes and advance them through DRAFT, REGISTRATION_OPEN, ACTIVATION_OPEN, VOTING_ACTIVE, CLOSED, and ARCHIVED. Transitions are one-way, date ranges are validated, optimistic versions reject stale writes, and every mutation is audited.

The current UI supports creation, name editing while editable, and explicit forward transitions. Full detail-page editing and privileged exceptional rollback are deferred.

Activation and voting windows may overlap. Each window must be internally ordered, and credential expiration must be after both windows end.

## Stage 4 registration records

Administrators and registration operators can create, search, update, and assign per-scope eligibility to voting-entitlement records. Weights use PostgreSQL DECIMAL(12,4), never floating-point storage. System administrators may soft-delete records; auditors have read-only access. All mutations are audited and stale updates are rejected using record versions.

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

- Local Docker credentials are development-only.
- HTTPS, backups, deployment secrets, and hardening belong to later stages.
