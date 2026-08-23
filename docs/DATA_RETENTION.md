# Data retention

Configured with environment variables (see `apps/registration-api/.env.example`).

| Data | Variable | Default | Notes |
| --- | --- | --- | --- |
| Hash-chained audit events | `AUDIT_RETENTION_DAYS` | 2555 (~7 years) | Live window for operational review. Rows are **not** deleted automatically. |
| Application logs (Pino) | `APPLICATION_LOG_RETENTION_DAYS` | 30 | Enforce in the log shipper or container log driver. |
| Audit source IP | `SOURCE_IP_MODE` | `truncated` | `truncated` stores /24 or /48; `omitted` stores null. Applied at write time. |

## Why audit rows are not pruned in place

Each `AuditEvent` includes `sourceIp` in its canonical hash. Changing or
deleting an older row breaks `npm run audit:verify`. Retention therefore
means:

1. Keep the live chain in PostgreSQL.
2. After the live window, export older events to an encrypted archive
   (see `docs/BACKUP_ENCRYPTION.md`).
3. Leave the database chain intact so verification still succeeds.

Report how many events are older than the live window:

```bash
npm run audit:retain
```

The command prints the cutoff and count. It does not delete rows.

## Other records

Registration rows, activation-token hashes, and issued credentials follow
the voting-scope lifecycle (through ARCHIVED). They are out of scope for
the administrative-log retention timer.

Raw activation tokens, passwords, TOTP secrets, and voter private keys are
never retained in logs. Tokens exist in plaintext only in the one-time
generation response.
