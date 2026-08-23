import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMIN_PREFIX = '/api/v1/admin';

/**
 * Returns the origin of a Referer header when it is a valid absolute URL.
 *
 * @param referer - Raw Referer header, if present.
 */
function refererOrigin(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Accepts a mutating administrative request only when Origin or Referer
 * matches the configured admin origin. Combined with SameSite=Strict session
 * cookies this is the CSRF control for the administrative cookie API.
 *
 * Public activation endpoints are excluded: they authenticate with a
 * one-time token in the body, not a browser session cookie.
 *
 * @param request - Incoming Fastify request.
 * @param adminOrigin - Allowed administrative UI origin, for example http://localhost:5173.
 * @returns False when a cross-site or missing origin should be rejected.
 */
export function isAllowedAdminOrigin(
  request: FastifyRequest,
  adminOrigin: string,
): boolean {
  if (!MUTATING_METHODS.has(request.method)) return true;
  const url = request.url.split('?')[0] ?? '';
  if (!url.startsWith(ADMIN_PREFIX)) return true;
  const originHeader = request.headers.origin;
  if (typeof originHeader === 'string' && originHeader.length > 0)
    return originHeader === adminOrigin;
  const fromReferer = refererOrigin(
    typeof request.headers.referer === 'string'
      ? request.headers.referer
      : undefined,
  );
  if (fromReferer) return fromReferer === adminOrigin;
  return false;
}

/**
 * Registers an onRequest hook that rejects cross-origin administrative writes.
 *
 * @param app - Fastify instance.
 * @param adminOrigin - Configured ADMIN_ORIGIN.
 * @param enabled - When false, the hook is not registered (unit tests).
 */
export async function registerCsrfOriginCheck(
  app: FastifyInstance,
  adminOrigin: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return;
  app.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (isAllowedAdminOrigin(request, adminOrigin)) return;
      return reply.code(403).send({ code: 'CSRF_ORIGIN_REJECTED' });
    },
  );
}
