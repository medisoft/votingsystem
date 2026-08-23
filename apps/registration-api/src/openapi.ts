import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance, HTTPMethods } from 'fastify';

/** Browser path for the interactive OpenAPI explorer. */
export const OPENAPI_UI_PREFIX = '/documentation';

/**
 * CSP for the Swagger UI HTML/JS/CSS. Helmet's API policy is `default-src
 * 'none'` and would block this page.
 */
export const OPENAPI_UI_CSP =
  "default-src 'self';base-uri 'self';font-src 'self' data:;img-src 'self' data:;object-src 'none';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';connect-src 'self';frame-ancestors 'none';form-action 'self'";

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
  await app.register(swaggerUi, {
    routePrefix: OPENAPI_UI_PREFIX,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: false,
      tryItOutEnabled: true,
    },
    staticCSP: true,
    transformStaticCSP: () => OPENAPI_UI_CSP,
  });
  app.get('/api/v1/openapi.json', async () => app.swagger());
}

declare module 'fastify' {
  interface FastifyInstance {
    apiRoutes: Array<{ method: string; url: string }>;
  }
}
