import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HealthResponse } from '@pixel/shared';
import type { Config } from './config.js';
import { loggerOptions } from './logger.js';
import { registerSecurityHeaders } from './security.js';

export const VERSION = '0.1.0';

export async function buildApp(cfg: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(cfg),
    // Behind Caddy (private Docker network); the forwarded IP is only used in memory
    // for rate limiting and is never persisted or logged.
    trustProxy: cfg.NODE_ENV === 'production' ? 'loopback, linklocal, uniquelocal' : false,
    bodyLimit: 64 * 1024,
  });

  await registerSecurityHeaders(app, cfg);

  app.get('/api/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  // Unknown API routes: JSON 404 instead of falling through to static files.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Nicht gefunden' });
    }
    return reply.code(404).type('text/plain; charset=utf-8').send('Seite nicht gefunden');
  });

  if (cfg.CLIENT_DIST) {
    const root = resolve(cfg.CLIENT_DIST);
    if (existsSync(root)) {
      await app.register(fastifyStatic, {
        root,
        index: ['index.html'],
        setHeaders(res, path) {
          // Vite emits content-hashed files below /assets-built – cache them for a year.
          res.header(
            'Cache-Control',
            path.includes('/assets-built/') ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      });
    } else {
      app.log.warn('CLIENT_DIST existiert nicht – Client wird nicht ausgeliefert.');
    }
  }

  return app;
}
