import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import swagger from '@fastify/swagger';
import type { FastifyInstance, HTTPMethods } from 'fastify';

const SKIPPED_METHODS = new Set<HTTPMethods | 'HEAD'>(['HEAD', 'OPTIONS']);

/**
 * Absolute path of the committed OpenAPI document.
 */
export const OPENAPI_SPEC_PATH = fileURLToPath(
  new URL('../openapi.yaml', import.meta.url),
);

/**
 * Converts a Fastify route path to an OpenAPI path template.
 *
 * @param url - Fastify path such as `/api/v1/admin/scopes/:id`.
 * @returns OpenAPI path such as `/api/v1/admin/scopes/{id}`.
 */
export function fastifyPathToOpenApi(url: string): string {
  return url.replaceAll(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * Registers the static OpenAPI document and records `/api/v1` routes for
 * contract tests. The `onRoute` hook must run before other `/api/v1` routes.
 *
 * @param app - Fastify instance being built.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  const apiRoutes: Array<{ method: string; url: string }> = [];
  app.decorate('apiRoutes', apiRoutes);
  app.addHook('onRoute', (route) => {
    const methods = (
      Array.isArray(route.method) ? route.method : [route.method]
    ).filter((method) => !SKIPPED_METHODS.has(method));
    if (!route.url.startsWith('/api/v1')) return;
    for (const method of methods) apiRoutes.push({ method, url: route.url });
  });
  await app.register(swagger, {
    mode: 'static',
    specification: {
      path: OPENAPI_SPEC_PATH,
      baseDir: dirname(OPENAPI_SPEC_PATH),
    },
  });
  app.get('/api/v1/openapi.json', async () => app.swagger());
}

declare module 'fastify' {
  interface FastifyInstance {
    apiRoutes: Array<{ method: string; url: string }>;
  }
}
