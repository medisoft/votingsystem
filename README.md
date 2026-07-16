# Condominium Voting System

Stage 1 foundation for the Registration and Credential Issuance Service: Fastify API, React administrative shell, PostgreSQL through Prisma, and automated quality checks. It intentionally contains no authentication or registration business functionality.

## Requirements

- Node.js 24.15.0
- npm 11+
- Docker with Docker Compose

## Start locally

After selecting the version in .nvmrc, install dependencies and generate the Prisma client:

    npm install
    npm run db:generate
    docker compose up

That single Compose command starts PostgreSQL, the API, and the admin frontend. Open http://localhost:5173. The API runs on http://localhost:3000.

The admin frontend uses same-origin API paths. When it is opened remotely (for example, http://ispy.local:5173), Vite proxies /api requests to the API container, so the remote browser never tries to contact its own localhost.

Create or reset the initial system administrator after the stack is running:

    ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='choose-at-least-12-characters' npm run db:seed

The seed is idempotent for the supplied email. It hashes the password with Argon2id and never prints it.

Database integration tests delete their target data and run only when ALLOW_DATABASE_RESET=true. Never enable that flag against a development or production database.

For host-based development, copy each app's .env.example to .env, run npm run dev:infra, and then npm run dev.

## Verification

Check /health/live, /health/ready, and /api/v1 on port 3000. The readiness endpoint verifies PostgreSQL connectivity. Run npm run check for formatting, linting, type checking, tests, and builds.

## Stage 2 authentication

Administrative authentication uses an opaque, hashed, eight-hour server-side session in an HTTP-only, SameSite=Strict cookie. Five failed logins lock an account for 15 minutes. Login attempts, logout, and administrator creation are audited.

Roles are SYSTEM_ADMIN, REGISTRATION_OPERATOR, and AUDITOR. Only a system administrator can list and create administrator accounts in this stage.

## Known Stage 2 limitations

- There are no voting scopes, voter records, activation tokens, or credentials yet.
- Account editing, password reset, TOTP, and the complete audit viewer are deferred.
- Audit events are hash-linked, but full verification and concurrency hardening belong to Stage 9.

## Stage 3 voting scopes

Authenticated administrators can list voting scopes. System administrators can create and edit scopes and advance them through DRAFT, REGISTRATION_OPEN, ACTIVATION_OPEN, VOTING_ACTIVE, CLOSED, and ARCHIVED. Transitions are one-way, date ranges are validated, optimistic versions reject stale writes, and every mutation is audited.

The current UI supports creation, name editing while editable, and explicit forward transitions. Full detail-page editing and privileged exceptional rollback are deferred.

Activation and voting windows may overlap. Each window must be internally ordered, and credential expiration must be after both windows end.

- Local Docker credentials are development-only.
- HTTPS, backups, deployment secrets, and hardening belong to later stages.
