import { PrismaClient } from '@prisma/client';

const APP_ROLE = 'registration_app';
const READONLY_ROLE = 'registration_readonly';

/**
 * Escapes a SQL string literal for CREATE ROLE PASSWORD.
 *
 * @param value - Role password from the environment.
 */
function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Creates split database roles when missing and grants least-privilege table
 * access. Requires a superuser connection (DATABASE_ADMIN_URL).
 *
 * @param prisma - Client connected as the database owner.
 * @param passwords - Login passwords for the application and read-only roles.
 */
export async function grantRegistrationRoles(
  prisma: PrismaClient,
  passwords: { app: string; readonly: string },
): Promise<{ granted: boolean; reason?: string }> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} LOGIN PASSWORD ${quoteLiteral(passwords.app)};
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${READONLY_ROLE}') THEN
        CREATE ROLE ${READONLY_ROLE} LOGIN PASSWORD ${quoteLiteral(passwords.readonly)};
      END IF;
    END
    $$;
  `);
  await prisma.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}, ${READONLY_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READONLY_ROLE}`,
  );
  return { granted: true };
}

const enabled = process.env.GRANT_APP_ROLES === 'true';
if (enabled && process.env.DATABASE_ADMIN_URL) {
  const admin = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_ADMIN_URL } },
  });
  const result = await grantRegistrationRoles(admin, {
    app: process.env.REGISTRATION_APP_PASSWORD ?? 'voting_app',
    readonly: process.env.REGISTRATION_READONLY_PASSWORD ?? 'voting_readonly',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  await admin.$disconnect();
}
