import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { HealthResponse } from '@pixel/shared';
import type { Config } from './config.js';
import { openDb } from './db/client.js';
import type { Deps } from './deps.js';
import { systemClock, type Clock } from './lib/clock.js';
import { loadAppKey } from './lib/crypto.js';
import { HttpError } from './lib/http-error.js';
import { loggerOptions } from './logger.js';
import { registerSecurityHeaders } from './security.js';
import { registerSessionHook } from './auth/session.js';
import { prepareSetupToken, registerAuthRoutes } from './auth/routes.js';
import { registerClassRoutes } from './modules/classes.js';
import { registerMeRoutes } from './modules/me.js';
import { registerPolicyRoutes } from './modules/policies.js';
import { registerStaffRoutes } from './modules/staff.js';
import { registerCharacterRoutes } from './modules/character.js';
import { seedDemo, DEMO } from './dev-seed.js';
import { loadContent } from './content/loader.js';
import { registerLevelRoutes } from './modules/levels.js';
import { registerWalletRoutes } from './modules/wallet.js';
import { registerEconomyRoutes } from './modules/economy.js';
import { registerActivityRoutes } from './modules/activity.js';
import { Presence } from './realtime/presence.js';
import { registerConsoleRoutes } from './modules/console.js';
import { registerDashboardRoutes } from './modules/dashboard.js';
import { registerLeaderboardRoutes } from './modules/leaderboard.js';
import { registerPrivacyRoutes } from './modules/privacy.js';
import { scheduleRetention } from './jobs/retention.js';

export const VERSION = '0.9.0';

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps;
  }
}

export interface BuildOptions {
  clock?: Clock;
}

export async function buildApp(cfg: Config, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(cfg),
    // Behind Caddy (private Docker network); the forwarded IP is only used in memory
    // for rate limiting and is never persisted or logged.
    trustProxy: cfg.NODE_ENV === 'production' ? 'loopback, linklocal, uniquelocal' : false,
    bodyLimit: 256 * 1024,
  });

  // --- persistence --------------------------------------------------------------
  const isTest = cfg.NODE_ENV === 'test';
  if (!isTest) mkdirSync(cfg.DATA_DIR, { recursive: true });
  const dbFile = cfg.DB_FILE ?? (isTest ? ':memory:' : join(cfg.DATA_DIR, 'pixel.db'));
  const { db, sqlite } = openDb(dbFile);
  const appKey = isTest ? Buffer.alloc(32, 7) : loadAppKey(cfg.DATA_DIR, cfg.APP_SECRET);
  const content = loadContent(cfg.CONTENT_DIR);
  const deps = { db, sqlite, cfg, clock: opts.clock ?? systemClock, appKey, content } as Deps;
  deps.presence = new Presence(deps);
  app.addHook('preClose', async () => deps.presence.close());
  app.decorate('deps', deps);
  app.addHook('onClose', async () => sqlite.close());

  // --- plugins & security -------------------------------------------------------------
  await registerSecurityHeaders(app, cfg);
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });
  registerSessionHook(app, deps);

  // CSRF defence in depth (besides SameSite=Strict): state-changing API requests must
  // come from our own origin.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    const host = req.headers.host;
    let ok = false;
    if (origin) {
      try {
        ok = origin === cfg.PUBLIC_ORIGIN || new URL(origin).host === host;
      } catch {
        ok = false;
      }
    }
    if (!ok) throw new HttpError(403, 'forbidden', 'Anfrage von fremder Herkunft abgelehnt.');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError)
      return reply.code(err.status).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 429)
      return reply
        .code(429)
        .send({ error: 'rate_limited', message: 'Zu viele Anfragen. Bitte kurz warten.' });
    if (status >= 400 && status < 500)
      return reply.code(status).send({ error: 'validation', message: 'Ungültige Anfrage.' });
    req.log.error(
      { err: { message: err instanceof Error ? err.message : String(err) } },
      'Unerwarteter Fehler',
    );
    return reply.code(500).send({ error: 'internal', message: 'Interner Fehler.' });
  });

  // --- routes -----------------------------------------------------------------------
  app.get('/api/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
  }));
  app.get('/api/public/info', async () => ({
    schoolName: cfg.SCHOOL_NAME,
    schoolContact: cfg.SCHOOL_CONTACT,
    dpoContact: cfg.DPO_CONTACT,
    hostingInfo: cfg.HOSTING_INFO,
    privacyVersion: cfg.PRIVACY_VERSION,
    retention: {
      inactiveDays: cfg.RETENTION_INACTIVE_DAYS,
      attemptsDays: cfg.RETENTION_ATTEMPTS_DAYS,
      activityDays: cfg.RETENTION_ACTIVITY_DAYS,
      selfDeleteGraceDays: cfg.SELF_DELETE_GRACE_DAYS,
    },
  }));
  registerAuthRoutes(app, deps);
  registerMeRoutes(app, deps);
  registerPolicyRoutes(app, deps);
  registerClassRoutes(app, deps);
  registerStaffRoutes(app, deps);
  registerCharacterRoutes(app, deps);
  registerLevelRoutes(app, deps);
  registerWalletRoutes(app, deps);
  registerEconomyRoutes(app, deps);
  registerActivityRoutes(app, deps);
  registerConsoleRoutes(app, deps);
  registerDashboardRoutes(app, deps);
  registerLeaderboardRoutes(app, deps);
  registerPrivacyRoutes(app, deps);

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/'))
      return reply.code(404).send({ error: 'not_found', message: 'Nicht gefunden' });
    return reply.code(404).type('text/plain; charset=utf-8').send('Seite nicht gefunden');
  });

  if (cfg.CLIENT_DIST) {
    const root = resolve(cfg.CLIENT_DIST);
    if (existsSync(root)) {
      await app.register(fastifyStatic, {
        root,
        index: ['index.html'],
        setHeaders(res, path) {
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

  if (!isTest) {
    deps.presence.attach(app);
    const stop = scheduleRetention(deps, (msg, r) => app.log.info({ retention: r }, msg));
    app.addHook('onClose', async () => stop());
  }

  // --- first start ------------------------------------------------------------------
  if (cfg.NODE_ENV === 'development' && cfg.DEV_SEED && (await seedDemo(deps))) {
    app.log.warn(
      `Demo-Daten angelegt – Lehrkraft: ${DEMO.teacher.username} / ${DEMO.teacher.password}, ` +
        `Admin: ${DEMO.superadmin.username} / ${DEMO.superadmin.password}, ` +
        `Klassencode ${DEMO.classCode}, Lernende: ${DEMO.students.join(', ')} / ${DEMO.studentPassword}`,
    );
  }
  if (!isTest) {
    const token = prepareSetupToken(deps);
    if (token)
      app.log.warn(
        `Ersteinrichtung: Öffnen Sie /dashboard.html und verwenden Sie das Setup-Token ${token}`,
      );
  }

  return app;
}
