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

For host-based development, copy each app's .env.example to .env, run npm run dev:infra, and then npm run dev.

## Verification

Check /health/live, /health/ready, and /api/v1 on port 3000. The readiness endpoint verifies PostgreSQL connectivity. Run npm run check for formatting, linting, type checking, tests, and builds.

## Known Stage 1 limitations

- No authentication, authorization, scopes, voter records, tokens, credentials, or audit events.
- No application tables or migrations are needed yet.
- Local Docker credentials are development-only.
- HTTPS, backups, deployment secrets, and hardening belong to later stages.
