# Backup encryption

The registration database contains personal data and credential metadata.
Backups must be encrypted before they leave the database host.

## Development

Local Compose volumes are unencrypted on the developer workstation. Do not
copy `registration-postgres` off-box without encrypting the archive.

Example of an encrypted logical dump (age, MIT licensed):

```bash
pg_dump --format=custom "$DATABASE_ADMIN_URL" \
  | age -r "$BACKUP_AGE_RECIPIENT" > registration-$(date -u +%Y%m%d).dump.age
```

Restore only onto `registration` or another explicitly named database. Never
restore a backup onto `registration_test`.

## Production expectations

- Encrypt at rest with a platform mechanism (PostgreSQL tablespace
  encryption, filesystem encryption, or the managed-database offering).
- Encrypt in transit with TLS to PostgreSQL.
- Encrypt off-site copies with a key that is not stored next to the backup.
- Split duties: the ballot service must not hold registration backup keys.
- Record restore tests. A backup that cannot be restored is not a control.
- Treat issuer private keys and `.env` files as secrets, not as part of the
  application artifact. Store them in a secret manager or a root-owned file
  mounted as `ISSUER_PRIVATE_KEY_FILE`.

This project does not ship a production backup scheduler. Operators must
attach encryption to whatever dump or snapshot tool they already run.
