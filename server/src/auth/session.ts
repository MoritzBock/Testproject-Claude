import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, lt } from 'drizzle-orm';
import type { Deps } from '../deps.js';
import { sessions, users } from '../db/schema.js';
import { HOUR, MINUTE } from '../lib/clock.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import type { AuthUser } from './types.js';

export const cookieName = (deps: Deps) => (deps.cfg.COOKIE_SECURE ? '__Host-sid' : 'sid');

export function createSession(
  deps: Deps,
  user: { id: string; role: string },
): { token: string; expiresAt: number } {
  const now = deps.clock.now();
  const hours =
    user.role === 'student' ? deps.cfg.SESSION_HOURS_STUDENT : deps.cfg.SESSION_HOURS_STAFF;
  const token = randomToken(32);
  const expiresAt = now + hours * HOUR;
  deps.db
    .insert(sessions)
    .values({ idHash: sha256(token), userId: user.id, createdAt: now, expiresAt, lastSeenAt: now })
    .run();
  return { token, expiresAt };
}

export function setSessionCookie(
  deps: Deps,
  reply: FastifyReply,
  token: string,
  expiresAt: number,
): void {
  reply.setCookie(cookieName(deps), token, {
    path: '/',
    httpOnly: true,
    secure: deps.cfg.COOKIE_SECURE,
    sameSite: 'strict',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(deps: Deps, reply: FastifyReply): void {
  reply.clearCookie(cookieName(deps), {
    path: '/',
    httpOnly: true,
    secure: deps.cfg.COOKIE_SECURE,
    sameSite: 'strict',
  });
}

export function destroySession(deps: Deps, idHash: string): void {
  deps.db.delete(sessions).where(eq(sessions.idHash, idHash)).run();
}

export function destroyUserSessions(deps: Deps, userId: string, exceptHash?: string | null): void {
  const all = deps.db
    .select({ h: sessions.idHash })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all();
  for (const s of all) if (s.h !== exceptHash) destroySession(deps, s.h);
}

export function purgeExpiredSessions(deps: Deps): number {
  return deps.db.delete(sessions).where(lt(sessions.expiresAt, deps.clock.now())).run().changes;
}

/** Resolves the session cookie to a user (or null). Never throws. */
export function resolveSession(
  deps: Deps,
  token: string | undefined,
): { user: AuthUser; hash: string } | null {
  if (!token || token.length > 100) return null;
  const hash = sha256(token);
  const now = deps.clock.now();
  const row = deps.db
    .select()
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, hash))
    .get();
  if (!row) return null;
  const s = row.sessions;
  const u = row.users;
  const idleLimit = deps.cfg.SESSION_IDLE_MINUTES * MINUTE;
  if (s.expiresAt < now || now - s.lastSeenAt > idleLimit || u.status !== 'active') {
    destroySession(deps, hash);
    return null;
  }
  if (now - s.lastSeenAt > MINUTE) {
    deps.db
      .update(sessions)
      .set({ lastSeenAt: now })
      .where(and(eq(sessions.idHash, hash)))
      .run();
  }
  return {
    hash,
    user: {
      id: u.id,
      role: u.role,
      username: u.username,
      classId: u.classId,
      mustChangePassword: u.mustChangePassword,
      privacyAckVersion: u.privacyAckVersion,
      totpEnabled: u.totpEnabled,
    },
  };
}

export function registerSessionHook(app: FastifyInstance, deps: Deps): void {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionHash', null);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (!req.url.startsWith('/api/')) return;
    const r = resolveSession(deps, req.cookies[cookieName(deps)]);
    req.user = r?.user ?? null;
    req.sessionHash = r?.hash ?? null;
  });
}
