import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { retainClientIp, truncateClientIp } from '../src/client-ip.js';
import { isAllowedAdminOrigin } from '../src/csrf.js';
import {
  LOG_REDACT_PATHS,
  logContainsSecret,
  redactSensitiveFields,
} from '../src/log-redaction.js';
import { API_CONTENT_SECURITY_POLICY } from '../src/security-headers.js';
import { auditArchiveCutoff } from '../src/retention.js';
import { testConfig } from './test-config.js';

describe('sensitive log redaction', () => {
  it('redacts known secret fields in structured payloads', () => {
    const redacted = redactSensitiveFields({
      password: 'super-secret-password',
      activationToken: 'opaque-token-value',
      nested: { totp: '123456', email: 'admin@example.com' },
    }) as Record<string, unknown>;
    expect(redacted.password).toBe('[Redacted]');
    expect(redacted.activationToken).toBe('[Redacted]');
    expect((redacted.nested as Record<string, unknown>).totp).toBe(
      '[Redacted]',
    );
    expect((redacted.nested as Record<string, unknown>).email).toBe(
      'admin@example.com',
    );
  });

  it('covers request body and header paths used by Pino', () => {
    expect(LOG_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.activationToken',
        'req.body.publicKey',
        'req.body.clientNonce',
      ]),
    );
  });

  it('censors secrets in a Pino line with the same redact paths', () => {
    const lines: string[] = [];
    const logger = pino(
      {
        redact: { paths: LOG_REDACT_PATHS, censor: '[Redacted]' },
      },
      new Writable({
        write(chunk, _encoding, callback) {
          lines.push(String(chunk));
          callback();
        },
      }),
    );
    logger.info({
      req: {
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'registration_session=raw-session',
        },
        body: {
          password: 'super-secret-password',
          activationToken: 'opaque-token-value',
        },
      },
    });
    const serialized = lines.join('');
    expect(
      logContainsSecret(serialized, [
        'super-secret-password',
        'opaque-token-value',
        'secret-token',
        'raw-session',
      ]),
    ).toBe(false);
    expect(serialized).toContain('[Redacted]');
  });
});

describe('client IP retention', () => {
  it('truncates IPv4 to /24 and IPv6 to /48', () => {
    expect(truncateClientIp('203.0.113.45')).toBe('203.0.113.0');
    expect(truncateClientIp('127.0.0.1')).toBe('127.0.0.0');
    expect(truncateClientIp('2001:db8:abcd:0012::1')).toBe('2001:0db8:abcd::');
    expect(truncateClientIp('::ffff:198.51.100.9')).toBe('198.51.100.0');
  });

  it('omits the address when configured', () => {
    expect(retainClientIp('203.0.113.45', 'omitted')).toBeNull();
  });
});

describe('audit retention window', () => {
  it('computes the archive cutoff without deleting events', () => {
    const now = new Date('2026-08-22T00:00:00.000Z');
    expect(auditArchiveCutoff(now, 30).toISOString()).toBe(
      '2026-07-23T00:00:00.000Z',
    );
  });
});

describe('CSRF origin check', () => {
  const adminOrigin = 'http://localhost:5173';
  const request = (
    method: string,
    url: string,
    headers: Record<string, string | undefined> = {},
  ) =>
    ({
      method,
      url,
      headers,
    }) as Parameters<typeof isAllowedAdminOrigin>[0];

  it('allows GET and public POSTs', () => {
    expect(
      isAllowedAdminOrigin(request('GET', '/api/v1/admin/me'), adminOrigin),
    ).toBe(true);
    expect(
      isAllowedAdminOrigin(
        request('POST', '/api/v1/public/activate'),
        adminOrigin,
      ),
    ).toBe(true);
  });

  it('rejects mutating admin requests from another origin', () => {
    expect(
      isAllowedAdminOrigin(
        request('POST', '/api/v1/admin/auth/login', {
          origin: 'https://evil.example',
        }),
        adminOrigin,
      ),
    ).toBe(false);
    expect(
      isAllowedAdminOrigin(
        request('POST', '/api/v1/admin/auth/login'),
        adminOrigin,
      ),
    ).toBe(false);
  });

  it('accepts the configured admin origin', () => {
    expect(
      isAllowedAdminOrigin(
        request('POST', '/api/v1/admin/auth/login', { origin: adminOrigin }),
        adminOrigin,
      ),
    ).toBe(true);
    expect(
      isAllowedAdminOrigin(
        request('POST', '/api/v1/admin/auth/logout', {
          referer: 'http://localhost:5173/dashboard',
        }),
        adminOrigin,
      ),
    ).toBe(true);
  });
});

describe('security headers', () => {
  it('sets CSP and related headers on API responses', async () => {
    const app = await buildApp(
      testConfig({ DATABASE_URL: 'postgresql://x:x@localhost:5432/x' }),
      async () => undefined,
    );
    const response = await app.inject({ url: '/health/live' });
    const csp = String(response.headers['content-security-policy'] ?? '');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toBe(API_CONTENT_SECURITY_POLICY);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toBeUndefined();
    await app.close();
  });

  it('rejects cross-origin administrative POSTs when CSRF checks are on', async () => {
    const app = await buildApp(
      testConfig({
        DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
        CSRF_ORIGIN_CHECK: true,
      }),
      async () => undefined,
    );
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'a@b.c', password: 'x' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ code: 'CSRF_ORIGIN_REJECTED' });
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: 'a@b.c', password: 'x' },
    });
    expect(allowed.statusCode).not.toBe(403);
    await app.close();
  });
});
