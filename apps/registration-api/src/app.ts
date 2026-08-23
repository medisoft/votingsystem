import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { registerActivationTokenRoutes } from './activation-token-routes.js';
import { registerCredentialRoutes } from './credential-routes.js';
import type { AppConfig } from './config.js';
import { setActiveSourceIpMode } from './client-ip.js';
import { registerCsrfOriginCheck } from './csrf.js';
import { createIssuer } from './issuer-keys.js';
import { LOG_REDACT_PATHS } from './log-redaction.js';
import databasePlugin from './plugins/database.js';
import { registerImportRoutes } from './imports.js';
import { registerScopeRoutes } from './scopes.js';
import { registerRegistrationRoutes } from './registrations.js';
import { registerOpenApi } from './openapi.js';
import { registerReportRoutes } from './report-routes.js';
import { registerSecurityHeaders } from './security-headers.js';

/** Default JSON body cap. CSV import routes override this with MAX_IMPORT_JSON_BYTES. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

export async function buildApp(
  config: AppConfig,
  checkDb?: () => Promise<void>,
): Promise<FastifyInstance> {
  setActiveSourceIpMode(config.SOURCE_IP_MODE);
  const app = Fastify({
    bodyLimit: MAX_JSON_BODY_BYTES,
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: { paths: LOG_REDACT_PATHS, censor: '[Redacted]' },
          },
  });
  await app.register(databasePlugin);
  await registerSecurityHeaders(app, config.NODE_ENV === 'production');
  await app.register(cors, { origin: config.ADMIN_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await registerCsrfOriginCheck(
    app,
    config.ADMIN_ORIGIN,
    config.CSRF_ORIGIN_CHECK,
  );
  await registerOpenApi(app);
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await (checkDb?.() ?? app.prisma.$connect());
      return { status: 'ready', database: 'connected' };
    } catch {
      return reply
        .code(503)
        .send({ status: 'not_ready', database: 'unavailable' });
    }
  });
  app.get('/api/v1', async () => ({ service: 'registration-api', version: 1 }));
  registerAuthRoutes(app, config.NODE_ENV === 'production');
  registerActivationTokenRoutes(app);
  registerCredentialRoutes(app, await createIssuer(config));
  registerScopeRoutes(app);
  registerImportRoutes(app);
  registerRegistrationRoutes(app);
  registerReportRoutes(app);
  return app;
}
