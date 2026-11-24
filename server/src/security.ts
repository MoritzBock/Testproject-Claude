import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';

/** Content-Security-Policy: everything from our own origin, nothing external. */
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  // data:/blob: are needed for programmatically generated textures and audio.
  imgSrc: ["'self'", 'data:', 'blob:'],
  mediaSrc: ["'self'", 'blob:'],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'", 'blob:'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  upgradeInsecureRequests: null as null | [],
};

export async function registerSecurityHeaders(app: FastifyInstance, cfg: Config): Promise<void> {
  const isProd = cfg.NODE_ENV === 'production';
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { ...CSP_DIRECTIVES, upgradeInsecureRequests: isProd ? [] : null },
    },
    // HSTS is only meaningful behind TLS (Caddy); harmless otherwise.
    strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    );
  });
}
