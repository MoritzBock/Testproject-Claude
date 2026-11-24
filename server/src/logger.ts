import type { FastifyServerOptions } from 'fastify';
import type { Config } from './config.js';

/**
 * Privacy-preserving logger options.
 * - No IP address, hostname, user agent, headers or bodies.
 * - Query strings are stripped (they could carry identifiers).
 * Logs therefore contain no personal data; Docker rotates them (see docker-compose.yml).
 */
export function loggerOptions(cfg: Config): FastifyServerOptions['logger'] {
  if (cfg.NODE_ENV === 'test') return false;
  return {
    level: cfg.LOG_LEVEL,
    base: null, // no hostname / pid
    redact: { paths: ['req.headers', 'req.body', 'password', '*.password'], remove: true },
    serializers: {
      req(req: { method: string; url: string }) {
        return { method: req.method, url: stripQuery(req.url) };
      },
      res(res: { statusCode: number }) {
        return { statusCode: res.statusCode };
      },
    },
  };
}

export function stripQuery(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}
