import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  fastifyPathToOpenApi,
  OPENAPI_UI_CSP,
  OPENAPI_UI_PREFIX,
} from '../src/openapi.js';
import { testConfig } from './test-config.js';

const config = testConfig({
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
});

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

describe('OpenAPI contract', () => {
  it('matches the live /api/v1 route table and omits secret examples', async () => {
    const app = await buildApp(config, async () => undefined);
    const response = await app.inject({ url: '/api/v1/openapi.json' });
    expect(response.statusCode).toBe(200);
    const spec = response.json() as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(spec.openapi.startsWith('3.1')).toBe(true);
    const documented = new Set<string>();
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const method of Object.keys(item)) {
        if (HTTP_METHODS.has(method.toUpperCase()))
          documented.add(`${method.toUpperCase()} ${path}`);
      }
    }
    const live = new Set(
      app.apiRoutes.map(
        (route) => `${route.method} ${fastifyPathToOpenApi(route.url)}`,
      ),
    );
    expect([...live].sort()).toEqual([...documented].sort());
    const serialized = JSON.stringify(spec);
    expect(serialized).not.toMatch(/ManualTest-2026/);
    expect(serialized).not.toMatch(/opaque-random-token/);
    expect(serialized).not.toMatch(/super-secret/);
    await app.close();
  });

  it('serves Swagger UI for the committed OpenAPI document', async () => {
    const app = await buildApp(config, async () => undefined);
    const redirected = await app.inject({ url: OPENAPI_UI_PREFIX });
    const page =
      redirected.statusCode >= 300 && redirected.statusCode < 400
        ? await app.inject({
            url: redirected.headers.location ?? `${OPENAPI_UI_PREFIX}/`,
          })
        : redirected;
    expect(page.statusCode).toBe(200);
    expect(String(page.headers['content-type'])).toMatch(/html/);
    expect(page.body).toMatch(/swagger/i);
    expect(String(page.headers['content-security-policy'])).toBe(
      OPENAPI_UI_CSP,
    );
    expect(String(page.headers['content-security-policy'])).not.toContain(
      "default-src 'none'",
    );
    await app.close();
  });

  it('maps Fastify params to OpenAPI templates', () => {
    expect(
      fastifyPathToOpenApi(
        '/api/v1/admin/registrations/:id/scopes/:scopeId/activation-token',
      ),
    ).toBe(
      '/api/v1/admin/registrations/{id}/scopes/{scopeId}/activation-token',
    );
  });
});
