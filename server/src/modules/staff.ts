import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { Username } from '@pixel/shared';
import type { Deps } from '../deps.js';
import { classTeachers, users } from '../db/schema.js';
import { requireRole } from '../auth/guards.js';
import { destroyUserSessions } from '../auth/session.js';
import { conflict, notFound, parse } from '../lib/http-error.js';
import { generateStartPassword, hashPassword } from '../lib/passwords.js';
import { audit } from '../audit.js';
import { deleteUserCompletely } from './users.js';

/** Superadmin: manages teacher accounts. Has NO access to learning data. */
export function registerStaffRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, clock } = deps;

  const teacher = (id: string) => {
    const t = db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, 'teacher')))
      .get();
    if (!t) throw notFound('Lehrkraft');
    return t;
  };

  app.get('/api/admin/teachers', async (req) => {
    requireRole(req, deps, 'superadmin');
    return db
      .select({
        id: users.id,
        username: users.username,
        status: users.status,
        totpEnabled: users.totpEnabled,
        lastActiveAt: users.lastActiveAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, 'teacher'))
      .orderBy(asc(users.usernameKey))
      .all()
      .map((t) => ({
        ...t,
        classCount: db.select().from(classTeachers).where(eq(classTeachers.teacherId, t.id)).all()
          .length,
      }));
  });

  app.post('/api/admin/teachers', async (req) => {
    const u = requireRole(req, deps, 'superadmin');
    const { username } = parse(z.object({ username: Username }), req.body);
    const key = username.toLowerCase();
    if (
      db
        .select()
        .from(users)
        .where(and(isNull(users.classId), eq(users.usernameKey, key)))
        .get()
    )
      throw conflict('Benutzername bereits vergeben.');
    const startPassword = generateStartPassword();
    const now = clock.now();
    const id = crypto.randomUUID();
    db.insert(users)
      .values({
        id,
        role: 'teacher',
        username,
        usernameKey: key,
        passwordHash: await hashPassword(startPassword),
        mustChangePassword: true,
        lastActiveAt: now,
        createdAt: now,
      })
      .run();
    audit(deps, u, 'teacher.create', { userId: id, name: username });
    return { id, username, startPassword };
  });

  app.post('/api/admin/teachers/:id/reset-password', async (req) => {
    const u = requireRole(req, deps, 'superadmin');
    const t = teacher((req.params as { id: string }).id);
    const startPassword = generateStartPassword();
    db.update(users)
      .set({
        passwordHash: await hashPassword(startPassword),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
        totpEnabled: false,
        totpSecretEnc: null,
      })
      .where(eq(users.id, t.id))
      .run();
    destroyUserSessions(deps, t.id);
    audit(deps, u, 'teacher.resetPassword', { userId: t.id, name: t.username });
    return { username: t.username, startPassword };
  });

  app.patch('/api/admin/teachers/:id', async (req) => {
    const u = requireRole(req, deps, 'superadmin');
    const t = teacher((req.params as { id: string }).id);
    const { status } = parse(z.object({ status: z.enum(['active', 'locked']) }), req.body);
    db.update(users).set({ status }).where(eq(users.id, t.id)).run();
    if (status !== 'active') destroyUserSessions(deps, t.id);
    audit(deps, u, 'teacher.update', { userId: t.id, name: t.username }, { status });
    return { ok: true };
  });

  app.delete('/api/admin/teachers/:id', async (req) => {
    const u = requireRole(req, deps, 'superadmin');
    const t = teacher((req.params as { id: string }).id);
    // Refuse if the teacher is the only one for a class (would orphan learner data).
    for (const link of db
      .select()
      .from(classTeachers)
      .where(eq(classTeachers.teacherId, t.id))
      .all()) {
      const others = db
        .select()
        .from(classTeachers)
        .where(and(eq(classTeachers.classId, link.classId), ne(classTeachers.teacherId, t.id)))
        .all();
      if (others.length === 0)
        throw conflict(
          'Diese Lehrkraft ist alleinige Lehrkraft einer Klasse. Bitte Klasse vorher übergeben oder löschen.',
        );
    }
    deleteUserCompletely(deps, t.id);
    audit(deps, u, 'teacher.delete', {});
    return { ok: true };
  });
}
