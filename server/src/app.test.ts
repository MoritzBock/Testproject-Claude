import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HealthResponse } from '@pixel/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { stripQuery } from './logger.js';

describe('app', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp(loadConfig({ NODE_ENV: 'test' }));
  });
  afterAll(() => app.close());

  it('GET /api/health returns a valid health response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json()).status).toBe('ok');
  });

  it('sets strict security headers without external sources', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/https?:\/\//);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toContain('camera=()');
  });

  it('answers unknown API routes with JSON 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gibtsnicht' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });
});

describe('config', () => {
  it('refuses insecure cookies in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow();
  });
  it('allows insecure cookies in development', () => {
    expect(loadConfig({ NODE_ENV: 'development', COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(
      false,
    );
  });
});

describe('logger', () => {
  it('strips query strings from logged URLs', () => {
    expect(stripQuery('/api/x?user=abc')).toBe('/api/x');
    expect(stripQuery('/api/x')).toBe('/api/x');
  });
});
