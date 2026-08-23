# Registration service threat model

This document describes trust boundaries and residual risks for the
registration and credential-issuance service through Stage 10.

## Assets

- Condominium identity data (unit, owner, contact, weight, eligibility).
- One-time activation tokens (shown once; stored only as SHA-256).
- Administrator passwords, sessions, and optional TOTP secrets.
- Issuer Ed25519 private key used to sign prototype credentials.
- Hash-chained administrative audit events.

## Trust boundaries

```text
[Administrator browser]
        |  same-origin /api via Vite or reverse proxy
        |  HTTP-only SameSite=Strict session cookie
        v
[registration-admin]
        |  no ballot-service credentials
        v
[registration-api] ---- PostgreSQL registration (identity DB)
        |
        x  must not hold BALLOT_DATABASE_URL / VOTING_DATABASE_URL

[Voter device] -- activation token + voter public key --> [registration-api]
[Ballot service] -- not this codebase -- anonymous credentials only
```

The registration database may know who is eligible and whether a credential
was issued. It must not know ballot selections. The ballot service must not
read registration rows. Split PostgreSQL roles enforce that at the database:
`registration_app` is DML-only; `registration_readonly` is SELECT-only; the
API process refuses ballot-service DSNs at startup.

## Adversaries

- Network attacker who can send HTTP requests to the API.
- Malicious website that tries to reuse an administrator's browser session.
- Compromised administrator account (operator or auditor).
- Database operator with SQL access.
- Insider who can read application logs or backups.

## Controls in this stage

- Pino request-log redaction for passwords, tokens, cookies, and keys.
- Truncated source IPs on audit writes (/24 IPv4, /48 IPv6) so precise
  addresses are never hashed into the append-only chain.
- Helmet security headers and a strict API Content-Security-Policy.
- CSRF defense: Origin/Referer must match `ADMIN_ORIGIN` for mutating
  `/api/v1/admin` routes, plus SameSite=Strict cookies and an
  `X-Requested-With` header from the administrative UI.
- Separate runtime database credentials from the migration owner.
- Dependency scanning (`npm run audit:deps`) in CI.

## Residual risks

- Stage 7–8 issuance still stores a temporary identity-to-credential link
  (`IssuedCredential.registrationRecordId`). This is operational anonymity
  only; unlinkability is Stage 11.
- Truncated IPs still identify a neighborhood-sized prefix.
- Hash-chained audit events are not deleted after `AUDIT_RETENTION_DAYS`;
  operators must archive and encrypt, not rewrite hashed rows.
- The issuer private key is loaded into API process memory.
- Local Compose passwords and keys are development-only.
- A stolen administrator session cookie is valid until expiry or logout.
- Public activation is protected by token entropy and rate limits, not CSRF
  cookies: possession of the raw token is the capability.
