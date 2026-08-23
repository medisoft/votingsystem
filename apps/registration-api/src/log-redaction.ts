/** Field names that must never appear in application logs. */
export const SENSITIVE_LOG_FIELDS = [
  'authorization',
  'cookie',
  'password',
  'currentPassword',
  'newPassword',
  'totp',
  'totpSecret',
  'activationToken',
  'rawToken',
  'publicKey',
  'clientNonce',
  'privateKey',
  'ISSUER_PRIVATE_KEY',
] as const;

const sensitiveLookup = new Set(
  SENSITIVE_LOG_FIELDS.map((field) => field.toLowerCase()),
);

/**
 * Pino redact paths applied to Fastify request logs.
 *
 * Paths cover headers, bodies, and common nested error objects so raw
 * secrets are replaced before a log line is written.
 */
export const LOG_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.totp',
  'req.body.totpSecret',
  'req.body.activationToken',
  'req.body.rawToken',
  'req.body.publicKey',
  'req.body.clientNonce',
  'req.body.privateKey',
];

const CENSOR = '[Redacted]';

/**
 * Recursively replaces sensitive fields in a structured log payload.
 *
 * @param value - Arbitrary log object, array, or primitive.
 * @returns A copy with known secret fields replaced by `[Redacted]`.
 */
export function redactSensitiveFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, nested]) =>
      sensitiveLookup.has(key.toLowerCase())
        ? [key, CENSOR]
        : [key, redactSensitiveFields(nested)],
  );
  return Object.fromEntries(entries);
}

/**
 * Returns true when a serialized log line still contains a raw secret.
 *
 * @param serialized - JSON or text log output.
 * @param secrets - Values that must not appear.
 */
export function logContainsSecret(
  serialized: string,
  secrets: readonly string[],
): boolean {
  return secrets.some(
    (secret) => secret.length > 0 && serialized.includes(secret),
  );
}
