import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { parseEd25519PrivateKey } from './issuer-keys.js';

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

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.parse(env);
  const issuerPrivateKey = resolveIssuerPrivateKey(parsed);
  parseEd25519PrivateKey(issuerPrivateKey);
  return {
    NODE_ENV: parsed.NODE_ENV,
    HOST: parsed.HOST,
    PORT: parsed.PORT,
    DATABASE_URL: parsed.DATABASE_URL,
    ADMIN_ORIGIN: parsed.ADMIN_ORIGIN,
    LOG_LEVEL: parsed.LOG_LEVEL,
    ISSUER_PRIVATE_KEY: issuerPrivateKey,
    ISSUER_KEY_VERSION: parsed.ISSUER_KEY_VERSION,
    ISSUER_ID: parsed.ISSUER_ID,
  };
};
