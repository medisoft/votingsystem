import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

/** Content-Security-Policy for JSON API responses. */
export const API_CONTENT_SECURITY_POLICY =
  "default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'";

/**
 * Registers Helmet security headers including a strict API CSP.
 *
 * @fastify/helmet 13 wraps helmet 8 (MIT, Fastify 5 compatible). It is used
 * instead of setting individual headers so HSTS, frame denial, nosniff, and
 * CSP stay aligned with the maintained Helmet defaults.
 *
 * @param app - Fastify instance.
 * @param production - Enables HSTS only when the process is production.
 */
export async function registerSecurityHeaders(
  app: FastifyInstance,
  production: boolean,
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'deny' },
    strictTransportSecurity: production
      ? { maxAge: 15_552_000, includeSubDomains: true }
      : false,
  });
}
