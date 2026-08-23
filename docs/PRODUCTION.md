# Production deployment notes

This repository ships a local Compose stack for development. It does not
provision a cloud. The following expectations apply when the registration
service is deployed for a condominium pilot.

## TLS

Terminate HTTPS in front of the API and the administrative static files
(reverse proxy, load balancer, or platform ingress). The API enables HSTS
only when `NODE_ENV=production`. Session cookies are `Secure` in production.
Set `ADMIN_ORIGIN` to the public `https://` origin of the admin UI so CSRF
origin checks match.

Do not expose PostgreSQL or the issuer private key to the public internet.

## Secrets

Do not commit production `DATABASE_URL` values or issuer private keys.

- Mount the issuer RSA key as a file and set `ISSUER_PRIVATE_KEY_FILE`
  (see `apps/registration-api/.env.example`). Generate keys with
  `npm run issuer:generate -w @voting/registration-api`. Ordinary OpenSSL
  RSA keys are not valid for the experimental partially-blind suite.
- Inject `DATABASE_URL` from the environment or a secret store. Use the
  least-privileged `registration_app` role for the running API.
- Keep Compose passwords and the development issuer material off production
  hosts.

## Static administrative UI

`npm run build -w @voting/registration-admin` writes `dist/` with a CSP that
does not include `'unsafe-eval'`. Serve that directory over HTTPS. The source
`index.html` still allows eval for Vite HMR during `npm run dev`.

## Retention and backups

- Audit events: `docs/DATA_RETENTION.md`. `npm run audit:retain` reports how
  many rows are older than the live window and does not delete them.
- Encrypted backups: `docs/BACKUP_ENCRYPTION.md`.
- Residual risks: `docs/THREAT_MODEL.md` and the experimental Stage 11 notes
  in `docs/BLIND_CREDENTIALS.md`.
