import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import { z } from 'zod';
import {
  ChangePasswordRequest,
  LoginRequest,
  Password,
  Username,
  type MeResponse,
} from '@pixel/shared';
import type { Deps } from '../deps.js';
import { characters, classes, meta, users } from '../db/schema.js';
import { MINUTE } from '../lib/clock.js';
import { decryptSecret, encryptSecret, randomToken, sha256 } from '../lib/crypto.js';
import { HttpError, conflict, forbidden, parse } from '../lib/http-error.js';
import { dummyHash, hashPassword, verifyPassword } from '../lib/passwords.js';
import { audit } from '../audit.js';
import { requireUser } from './guards.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  setSessionCookie,
} from './session.js';

const invalid = () =>
  new HttpError(
    401,
    'invalid_credentials',
    'Anmeldung fehlgeschlagen. Bitte prüfe deine Eingaben.',
  );

export function buildMe(deps: Deps, userId: string): MeResponse {
  const u = deps.db.select().from(users).where(eq(users.id, userId)).get()!;
  const cls = u.classId
    ? deps.db.select().from(classes).where(eq(classes.id, u.classId)).get()
    : null;
  const hasCharacter = !!deps.db.select().from(characters).where(eq(characters.userId, u.id)).get();
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    classId: u.classId,
    className: cls?.name ?? null,
    mustChangePassword: u.mustChangePassword,
    privacyAckRequired: (u.privacyAckVersion ?? 0) < deps.cfg.PRIVACY_VERSION,
    privacyVersion: deps.cfg.PRIVACY_VERSION,
    totpEnabled: u.totpEnabled,
    totpSetupRequired: deps.cfg.REQUIRE_STAFF_2FA && u.role !== 'student' && !u.totpEnabled,
    hasCharacter: u.role !== 'student' || hasCharacter,
  };
}

function totp(secretBase32: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: 'Pixel-Lernwelt',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export function registerAuthRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, clock, cfg } = deps;

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parse(LoginRequest, req.body);
      const key = body.username.toLowerCase();
      let user;
      if (body.classCode) {
        const cls = db.select().from(classes).where(eq(classes.joinCode, body.classCode)).get();
        user =
          cls && !cls.archivedAt
            ? db
                .select()
                .from(users)
                .where(
                  and(
                    eq(users.classId, cls.id),
                    eq(users.usernameKey, key),
                    eq(users.role, 'student'),
                  ),
                )
                .get()
            : undefined;
      } else {
        user = db
          .select()
          .from(users)
          .where(and(isNull(users.classId), eq(users.usernameKey, key)))
          .get();
        if (user?.role === 'student') user = undefined;
      }
      if (!user) {
        await verifyPassword(await dummyHash(), body.password); // equal timing
        throw invalid();
      }
      const now = clock.now();
      if (user.lockedUntil && user.lockedUntil > now) {
        const min = Math.ceil((user.lockedUntil - now) / MINUTE);
        throw new HttpError(
          423,
          'locked',
          `Zu viele Fehlversuche. Bitte in ${min} Minute(n) erneut versuchen.`,
        );
      }
      const fail = () => {
        const fails = user.failedLogins + 1;
        const lock = fails >= cfg.LOGIN_MAX_FAILS;
        db.update(users)
          .set({
            failedLogins: lock ? 0 : fails,
            lockedUntil: lock ? now + cfg.LOGIN_LOCK_MINUTES * MINUTE : null,
          })
          .where(eq(users.id, user.id))
          .run();
        return invalid();
      };
      if (!(await verifyPassword(user.passwordHash, body.password))) throw fail();
      if (user.status !== 'active')
        throw new HttpError(
          403,
          'disabled',
          'Dieses Konto ist gesperrt oder archiviert. Bitte wende dich an deine Lehrkraft.',
        );
      if (user.totpEnabled) {
        if (!body.totp)
          throw new HttpError(
            401,
            'totp_required',
            'Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.',
          );
        const ok = totp(decryptSecret(deps.appKey, user.totpSecretEnc!), user.username).validate({
          token: body.totp,
          window: 1,
        });
        if (ok === null) throw fail();
      }
      db.update(users)
        .set({ failedLogins: 0, lockedUntil: null, lastActiveAt: now })
        .where(eq(users.id, user.id))
        .run();
      const s = createSession(deps, user);
      setSessionCookie(deps, reply, s.token, s.expiresAt);
      return buildMe(deps, user.id);
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionHash) destroySession(deps, req.sessionHash);
    clearSessionCookie(deps, reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => buildMe(deps, requireUser(req).id));

  app.post('/api/auth/change-password', async (req) => {
    const u = requireUser(req);
    const body = parse(ChangePasswordRequest, req.body);
    const row = db.select().from(users).where(eq(users.id, u.id)).get()!;
    if (!(await verifyPassword(row.passwordHash, body.currentPassword)))
      throw new HttpError(400, 'invalid_credentials', 'Das aktuelle Passwort stimmt nicht.');
    if (body.currentPassword === body.newPassword)
      throw new HttpError(
        400,
        'validation',
        'Das neue Passwort muss sich vom alten unterscheiden.',
      );
    db.update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), mustChangePassword: false })
      .where(eq(users.id, u.id))
      .run();
    destroyUserSessions(deps, u.id, req.sessionHash);
    return buildMe(deps, u.id);
  });

  app.post('/api/auth/privacy-ack', async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ version: z.number().int() }), req.body);
    if (body.version !== cfg.PRIVACY_VERSION)
      throw new HttpError(400, 'validation', 'Veraltete Datenschutzinformation.');
    db.update(users)
      .set({ privacyAckVersion: cfg.PRIVACY_VERSION, privacyAckAt: clock.now() })
      .where(eq(users.id, u.id))
      .run();
    return buildMe(deps, u.id);
  });

  // --- TOTP (staff only) ------------------------------------------------------
  app.post('/api/auth/totp/setup', async (req) => {
    const u = requireUser(req);
    if (u.role === 'student') throw forbidden();
    if (u.totpEnabled) throw conflict('Zwei-Faktor-Anmeldung ist bereits aktiv.');
    const secret = new OTPAuth.Secret({ size: 20 });
    db.update(users)
      .set({ totpSecretEnc: encryptSecret(deps.appKey, secret.base32) })
      .where(eq(users.id, u.id))
      .run();
    return { secret: secret.base32, uri: totp(secret.base32, u.username).toString() };
  });

  app.post('/api/auth/totp/enable', async (req) => {
    const u = requireUser(req);
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
    const row = db.select().from(users).where(eq(users.id, u.id)).get()!;
    if (u.role === 'student' || !row.totpSecretEnc) throw forbidden();
    if (
      totp(decryptSecret(deps.appKey, row.totpSecretEnc), u.username).validate({
        token: code,
        window: 1,
      }) === null
    )
      throw new HttpError(
        400,
        'validation',
        'Der Code ist ungültig. Bitte prüfe die Uhrzeit deines Geräts.',
      );
    db.update(users).set({ totpEnabled: true }).where(eq(users.id, u.id)).run();
    audit(deps, u, 'totp.enable', { userId: u.id, name: u.username });
    return buildMe(deps, u.id);
  });

  app.post('/api/auth/totp/disable', async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    if (cfg.REQUIRE_STAFF_2FA) throw forbidden('Zwei-Faktor-Anmeldung ist verpflichtend.');
    const row = db.select().from(users).where(eq(users.id, u.id)).get()!;
    if (!(await verifyPassword(row.passwordHash, body.password)))
      throw new HttpError(400, 'invalid_credentials', 'Das Passwort stimmt nicht.');
    db.update(users)
      .set({ totpEnabled: false, totpSecretEnc: null })
      .where(eq(users.id, u.id))
      .run();
    audit(deps, u, 'totp.disable', { userId: u.id, name: u.username });
    return buildMe(deps, u.id);
  });

  // --- first-time setup (create superadmin) ------------------------------------
  app.get('/api/setup/status', async () => ({ needsSetup: !hasSuperadmin(deps) }));

  app.post(
    '/api/setup',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parse(
        z.object({ token: z.string().min(1).max(200), username: Username, password: Password }),
        req.body,
      );
      const stored = db.select().from(meta).where(eq(meta.key, 'setup_token_hash')).get();
      if (hasSuperadmin(deps) || !stored || stored.value !== sha256(body.token))
        throw new HttpError(
          403,
          'forbidden',
          'Einrichtung nicht möglich (Token ungültig oder bereits erfolgt).',
        );
      const now = clock.now();
      const id = crypto.randomUUID();
      db.insert(users)
        .values({
          id,
          role: 'superadmin',
          username: body.username,
          usernameKey: body.username.toLowerCase(),
          passwordHash: await hashPassword(body.password),
          mustChangePassword: false,
          lastActiveAt: now,
          createdAt: now,
        })
        .run();
      db.delete(meta).where(eq(meta.key, 'setup_token_hash')).run();
      audit(deps, { id, username: body.username }, 'setup.superadmin');
      const s = createSession(deps, { id, role: 'superadmin' });
      setSessionCookie(deps, reply, s.token, s.expiresAt);
      return buildMe(deps, id);
    },
  );
}

export function hasSuperadmin(deps: Deps): boolean {
  return !!deps.db.select({ id: users.id }).from(users).where(eq(users.role, 'superadmin')).get();
}

/** If no superadmin exists, prepares a one-time setup token. Returns it if newly generated. */
export function prepareSetupToken(deps: Deps): string | null {
  if (hasSuperadmin(deps)) return null;
  const token = deps.cfg.SETUP_TOKEN ?? randomToken(18);
  deps.db
    .insert(meta)
    .values({ key: 'setup_token_hash', value: sha256(token) })
    .onConflictDoUpdate({ target: meta.key, set: { value: sha256(token) } })
    .run();
  return deps.cfg.SETUP_TOKEN ? null : token;
}
