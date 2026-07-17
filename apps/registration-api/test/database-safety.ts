const REQUIRED_TEST_DATABASE = 'registration_test';

export function assertSafeTestDatabase(databaseUrl: string) {
  let databaseName: string;
  try {
    const url = new URL(databaseUrl);
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Integration tests require a valid DATABASE_URL.');
  }
  if (databaseName !== REQUIRED_TEST_DATABASE) {
    throw new Error(
      `Refusing to reset database "${databaseName || '(missing)'}". ` +
        `Integration tests may only reset "${REQUIRED_TEST_DATABASE}".`,
    );
  }
}
