import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { parseRsaPrivateKey } from './issuer-keys.js';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().max(65535).default(3001),
    DATABASE_URL: z.string().url(),
    ADMIN_ORIGIN: z.string().url().default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    AUDIT_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .default(2555),
    APPLICATION_LOG_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .default(30),
    SOURCE_IP_MODE: z.enum(['truncated', 'omitted']).default('truncated'),
    CSRF_ORIGIN_CHECK: z.enum(['true', 'false']).optional(),
    ISSUER_PRIVATE_KEY: z.string().min(1).optional(),
    ISSUER_PRIVATE_KEY_FILE: z.string().min(1).optional(),
    ISSUER_KEY_VERSION: z.string().trim().min(1).max(100),
    ISSUER_ID: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .default('condominium-registration-service'),
  })
  .superRefine((value, ctx) => {
    if (!value.ISSUER_PRIVATE_KEY && !value.ISSUER_PRIVATE_KEY_FILE)
      ctx.addIssue({
        code: 'custom',
        path: ['ISSUER_PRIVATE_KEY'],
        message: 'ISSUER_PRIVATE_KEY or ISSUER_PRIVATE_KEY_FILE is required',
      });
  });

export type AppConfig = {
  NODE_ENV: z.infer<typeof envSchema>['NODE_ENV'];
  HOST: string;
  PORT: number;
  DATABASE_URL: string;
  ADMIN_ORIGIN: string;
  LOG_LEVEL: z.infer<typeof envSchema>['LOG_LEVEL'];
  AUDIT_RETENTION_DAYS: number;
  APPLICATION_LOG_RETENTION_DAYS: number;
  SOURCE_IP_MODE: z.infer<typeof envSchema>['SOURCE_IP_MODE'];
  CSRF_ORIGIN_CHECK: boolean;
  ISSUER_PRIVATE_KEY: string;
  ISSUER_KEY_VERSION: string;
  ISSUER_ID: string;
};

/**
 * Reads issuer private-key material from the environment or a mounted secret file.
 *
 * @param env - Parsed environment including optional key and file path.
 * @returns PKCS8 PEM or base64url DER private-key text.
 */
function resolveIssuerPrivateKey(env: z.infer<typeof envSchema>): string {
  if (env.ISSUER_PRIVATE_KEY_FILE)
    return readFileSync(env.ISSUER_PRIVATE_KEY_FILE, 'utf8');
  return env.ISSUER_PRIVATE_KEY ?? '';
}

/**
 * Rejects ballot-service database URLs so this process cannot be pointed at
 * the voting database by a shared environment file.
 *
 * @param env - Process environment.
 */
function assertNoBallotDatabaseAccess(env: NodeJS.ProcessEnv) {
  if (env.BALLOT_DATABASE_URL || env.VOTING_DATABASE_URL) {
    throw new Error(
      'Registration API must not load ballot-service database credentials',
    );
  }
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  assertNoBallotDatabaseAccess(env);
  const parsed = envSchema.parse(env);
  const issuerPrivateKey = resolveIssuerPrivateKey(parsed);
  parseRsaPrivateKey(issuerPrivateKey);
  return {
    NODE_ENV: parsed.NODE_ENV,
    HOST: parsed.HOST,
    PORT: parsed.PORT,
    DATABASE_URL: parsed.DATABASE_URL,
    ADMIN_ORIGIN: parsed.ADMIN_ORIGIN,
    LOG_LEVEL: parsed.LOG_LEVEL,
    AUDIT_RETENTION_DAYS: parsed.AUDIT_RETENTION_DAYS,
    APPLICATION_LOG_RETENTION_DAYS: parsed.APPLICATION_LOG_RETENTION_DAYS,
    SOURCE_IP_MODE: parsed.SOURCE_IP_MODE,
    CSRF_ORIGIN_CHECK:
      parsed.CSRF_ORIGIN_CHECK === undefined
        ? parsed.NODE_ENV !== 'test'
        : parsed.CSRF_ORIGIN_CHECK === 'true',
    ISSUER_PRIVATE_KEY: issuerPrivateKey,
    ISSUER_KEY_VERSION: parsed.ISSUER_KEY_VERSION,
    ISSUER_ID: parsed.ISSUER_ID,
  };
};
