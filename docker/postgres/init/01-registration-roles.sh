#!/bin/sh
set -eu
APP_PASSWORD="${REGISTRATION_APP_PASSWORD:-voting_app}"
READONLY_PASSWORD="${REGISTRATION_READONLY_PASSWORD:-voting_readonly}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'registration_app') THEN
    CREATE ROLE registration_app LOGIN PASSWORD '${APP_PASSWORD}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'registration_readonly') THEN
    CREATE ROLE registration_readonly LOGIN PASSWORD '${READONLY_PASSWORD}';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO registration_app, registration_readonly;
GRANT USAGE ON SCHEMA public TO registration_app, registration_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO registration_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO registration_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO registration_readonly;
EOSQL
