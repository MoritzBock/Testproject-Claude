import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Username } from '@pixel/shared';
import type { Deps } from '../deps.js';
import {
  classTeachers,
  classes,
  groupMembers,
  groups,
  policies,
  teacherNotes,
  users,
} from '../db/schema.js';
import {
  assertTeacherOfClass,
  assertTeacherOfStudent,
  assertTeacherOfStudents,
  requireRole,
  teacherClassIds,
} from '../auth/guards.js';
import { destroyUserSessions } from '../auth/session.js';
import { HttpError, conflict, notFound, parse } from '../lib/http-error.js';
import { generateJoinCode } from '../lib/crypto.js';
import { generatePseudonym, generateStartPassword, hashPassword } from '../lib/passwords.js';
import { audit } from '../audit.js';
import { deleteUserCompletely } from './users.js';

const ClassBody = z.object({
  name: z.string().trim().min(1).max(40),
  schoolYear: z
    .string()
    .trim()
    .regex(/^\d{4}\/\d{2}$/, 'Schuljahr im Format 2026/27'),
});

function uniqueJoinCode(deps: Deps): string {
  for (let i = 0; i < 20; i++) {
    const code = generateJoinCode();
    if (!deps.db.select().from(classes).where(eq(classes.joinCode, code)).get()) return code;
  }
  throw new Error('Kein freier Klassencode gefunden');
}

/** Creates one student account. Returns the one-time start password. */
async function createStudent(deps: Deps, classId: string, username: string) {
  const key = username.toLowerCase();
  if (
    deps.db
      .select()
      .from(users)
      .where(and(eq(users.classId, classId), eq(users.usernameKey, key)))
      .get()
  )
    throw conflict(`Der Name „${username}“ ist in dieser Klasse schon vergeben.`);
  const password = generateStartPassword();
  const now = deps.clock.now();
  const id = crypto.randomUUID();
  deps.db
    .insert(users)
    .values({
      id,
      role: 'student',
      username,
      usernameKey: key,
      classId,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      lastActiveAt: now,
      createdAt: now,
    })
    .run();
  return { id, username, startPassword: password };
}

export function registerClassRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, clock } = deps;

  app.get('/api/teacher/classes', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const ids = teacherClassIds(deps, u.id);
    if (!ids.length) return [];
    const rows = db
      .select()
      .from(classes)
      .where(inArray(classes.id, ids))
      .orderBy(asc(classes.name))
      .all();
    return rows.map((c) => ({
      ...c,
      studentCount: db.select({ id: users.id }).from(users).where(eq(users.classId, c.id)).all()
        .length,
      teachers: db
        .select({ username: users.username })
        .from(classTeachers)
        .innerJoin(users, eq(users.id, classTeachers.teacherId))
        .where(eq(classTeachers.classId, c.id))
        .all()
        .map((t) => t.username),
    }));
  });

  app.post('/api/teacher/classes', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const body = parse(ClassBody, req.body);
    const id = crypto.randomUUID();
    db.transaction(() => {
      db.insert(classes)
        .values({ id, ...body, joinCode: uniqueJoinCode(deps), createdAt: clock.now() })
        .run();
      db.insert(classTeachers).values({ classId: id, teacherId: u.id }).run();
    });
    audit(deps, u, 'class.create', { classId: id, name: body.name });
    return db.select().from(classes).where(eq(classes.id, id)).get();
  });

  app.patch('/api/teacher/classes/:id', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const c = assertTeacherOfClass(deps, u.id, id);
    const body = parse(ClassBody.partial().extend({ archived: z.boolean().optional() }), req.body);
    const archivedAt =
      body.archived === undefined ? c.archivedAt : body.archived ? clock.now() : null;
    db.update(classes)
      .set({ name: body.name ?? c.name, schoolYear: body.schoolYear ?? c.schoolYear, archivedAt })
      .where(eq(classes.id, id))
      .run();
    if (body.archived !== undefined) {
      // Archiving a class deactivates (but keeps) all its accounts.
      const status = body.archived ? 'archived' : 'active';
      db.update(users).set({ status }).where(eq(users.classId, id)).run();
      if (body.archived)
        for (const s of db.select({ id: users.id }).from(users).where(eq(users.classId, id)).all())
          destroyUserSessions(deps, s.id);
      audit(deps, u, body.archived ? 'class.archive' : 'class.unarchive', {
        classId: id,
        name: c.name,
      });
    } else audit(deps, u, 'class.update', { classId: id, name: body.name ?? c.name });
    return db.select().from(classes).where(eq(classes.id, id)).get();
  });

  /** One-click deletion of a class incl. all accounts (requires typing the class name). */
  app.delete('/api/teacher/classes/:id', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const c = assertTeacherOfClass(deps, u.id, id);
    const body = parse(z.object({ confirmName: z.string() }), req.body ?? {});
    if (body.confirmName.trim() !== c.name)
      throw new HttpError(
        400,
        'validation',
        'Zur Bestätigung bitte den Klassennamen exakt eingeben.',
      );
    const students = db.select({ id: users.id }).from(users).where(eq(users.classId, id)).all();
    db.transaction(() => {
      for (const s of students) deleteUserCompletely(deps, s.id);
      db.delete(policies)
        .where(and(eq(policies.scopeType, 'class'), eq(policies.scopeId, id)))
        .run();
      db.delete(classes).where(eq(classes.id, id)).run();
    });
    audit(deps, u, 'class.delete', { classId: id, name: c.name }, { accounts: students.length });
    return { ok: true, deletedAccounts: students.length };
  });

  app.post('/api/teacher/classes/:id/join-code', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const c = assertTeacherOfClass(deps, u.id, id);
    const joinCode = uniqueJoinCode(deps);
    db.update(classes).set({ joinCode }).where(eq(classes.id, id)).run();
    audit(deps, u, 'class.joincode', { classId: id, name: c.name });
    return { joinCode };
  });

  /** Adds a co-teacher (team teaching / substitution). */
  app.post('/api/teacher/classes/:id/teachers', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const c = assertTeacherOfClass(deps, u.id, id);
    const { username } = parse(z.object({ username: z.string().trim().min(1).max(40) }), req.body);
    const t = db
      .select()
      .from(users)
      .where(
        and(
          eq(users.usernameKey, username.toLowerCase()),
          eq(users.role, 'teacher'),
          isNull(users.classId),
        ),
      )
      .get();
    if (!t) throw notFound('Lehrkraft');
    db.insert(classTeachers).values({ classId: id, teacherId: t.id }).onConflictDoNothing().run();
    audit(deps, u, 'class.addTeacher', { classId: id, name: c.name }, { teacher: t.username });
    return { ok: true };
  });

  app.delete('/api/teacher/classes/:id/teachers/me', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const c = assertTeacherOfClass(deps, u.id, id);
    const count = db.select().from(classTeachers).where(eq(classTeachers.classId, id)).all().length;
    if (count < 2)
      throw conflict(
        'Die letzte Lehrkraft kann eine Klasse nicht verlassen. Bitte stattdessen löschen.',
      );
    db.delete(classTeachers)
      .where(and(eq(classTeachers.classId, id), eq(classTeachers.teacherId, u.id)))
      .run();
    audit(deps, u, 'class.leave', { classId: id, name: c.name });
    return { ok: true };
  });

  // --- accounts ---------------------------------------------------------------
  app.post('/api/teacher/classes/:id/students', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const c = assertTeacherOfClass(deps, u.id, id);
    const body = parse(
      z.union([
        z.object({ usernames: z.array(Username).min(1).max(60) }),
        z.object({
          count: z.number().int().min(1).max(60),
          mode: z.enum(['prefix', 'random']),
          prefix: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9._-]{1,16}$/)
            .optional(),
        }),
      ]),
      req.body,
    );
    let names: string[];
    if ('usernames' in body) names = body.usernames;
    else if (body.mode === 'prefix') {
      const prefix = body.prefix ?? 'schueler';
      const existing = new Set(
        db
          .select({ k: users.usernameKey })
          .from(users)
          .where(eq(users.classId, id))
          .all()
          .map((r) => r.k),
      );
      names = [];
      for (let n = 1; names.length < body.count && n < 1000; n++) {
        const name = `${prefix}${String(n).padStart(2, '0')}`;
        if (!existing.has(name.toLowerCase())) names.push(name);
      }
    } else {
      const set = new Set<string>();
      while (set.size < body.count) set.add(generatePseudonym());
      names = [...set];
    }
    const created = [];
    for (const n of names) created.push(await createStudent(deps, id, n));
    audit(deps, u, 'student.create', { classId: id, name: c.name }, { count: created.length });
    // Start passwords are shown once (printable list) and never stored in plain text.
    return { className: c.name, joinCode: c.joinCode, accounts: created };
  });

  app.post('/api/teacher/students/:id/reset-password', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const s = assertTeacherOfStudent(deps, u.id, id);
    const startPassword = generateStartPassword();
    db.update(users)
      .set({
        passwordHash: await hashPassword(startPassword),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, id))
      .run();
    destroyUserSessions(deps, id);
    audit(deps, u, 'student.resetPassword', { userId: id, name: s.username, classId: s.classId });
    return { username: s.username, startPassword };
  });

  app.patch('/api/teacher/students/:id', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const s = assertTeacherOfStudent(deps, u.id, id);
    const body = parse(
      z.object({
        status: z.enum(['active', 'locked', 'archived']).optional(),
        username: Username.optional(),
      }),
      req.body,
    );
    if (body.username && body.username.toLowerCase() !== s.usernameKey) {
      const taken = db
        .select()
        .from(users)
        .where(
          and(eq(users.classId, s.classId!), eq(users.usernameKey, body.username.toLowerCase())),
        )
        .get();
      if (taken) throw conflict('Name bereits vergeben.');
    }
    db.update(users)
      .set({
        status: body.status ?? s.status,
        username: body.username ?? s.username,
        usernameKey: (body.username ?? s.username).toLowerCase(),
        ...(body.status === 'active' ? { lastActiveAt: clock.now() } : {}),
      })
      .where(eq(users.id, id))
      .run();
    if (body.status && body.status !== 'active') destroyUserSessions(deps, id);
    audit(deps, u, 'student.update', { userId: id, name: s.username, classId: s.classId }, body);
    return { ok: true };
  });

  app.delete('/api/teacher/students/:id', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const s = assertTeacherOfStudent(deps, u.id, id);
    deleteUserCompletely(deps, id);
    audit(deps, u, 'student.delete', { classId: s.classId });
    return { ok: true };
  });

  app.put('/api/teacher/students/:id/note', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    assertTeacherOfStudent(deps, u.id, id);
    const { text } = parse(
      z.object({ text: z.string().trim().max(200, 'Höchstens 200 Zeichen.') }),
      req.body,
    );
    if (!text) db.delete(teacherNotes).where(eq(teacherNotes.userId, id)).run();
    else
      db.insert(teacherNotes)
        .values({ userId: id, text, authorId: u.id, updatedAt: clock.now() })
        .onConflictDoUpdate({
          target: teacherNotes.userId,
          set: { text, authorId: u.id, updatedAt: clock.now() },
        })
        .run();
    return { ok: true };
  });

  // --- groups -----------------------------------------------------------------
  app.get('/api/teacher/groups', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    return db
      .select()
      .from(groups)
      .where(eq(groups.ownerId, u.id))
      .orderBy(asc(groups.name))
      .all()
      .map((g) => ({
        ...g,
        memberIds: db
          .select({ id: groupMembers.userId })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, g.id))
          .all()
          .map((m) => m.id),
      }));
  });

  app.post('/api/teacher/groups', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(40) }), req.body);
    const id = crypto.randomUUID();
    db.insert(groups).values({ id, ownerId: u.id, name, createdAt: clock.now() }).run();
    audit(deps, u, 'group.create', { name });
    return { id, name, memberIds: [] };
  });

  const ownGroup = (ownerId: string, id: string) => {
    const g = db.select().from(groups).where(eq(groups.id, id)).get();
    if (!g || g.ownerId !== ownerId) throw notFound('Gruppe');
    return g;
  };

  app.patch('/api/teacher/groups/:id', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    ownGroup(u.id, id);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(40) }), req.body);
    db.update(groups).set({ name }).where(eq(groups.id, id)).run();
    return { ok: true };
  });

  app.delete('/api/teacher/groups/:id', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const g = ownGroup(u.id, id);
    db.delete(policies)
      .where(and(eq(policies.scopeType, 'group'), eq(policies.scopeId, id)))
      .run();
    db.delete(groups).where(eq(groups.id, id)).run();
    audit(deps, u, 'group.delete', { name: g.name });
    return { ok: true };
  });

  app.put('/api/teacher/groups/:id/members', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const { id } = req.params as { id: string };
    const g = ownGroup(u.id, id);
    const { userIds } = parse(
      z.object({ userIds: z.array(z.string().max(64)).max(500) }),
      req.body,
    );
    const unique = [...new Set(userIds)];
    // Only own students can be put into a group.
    assertTeacherOfStudents(deps, u.id, unique);
    db.transaction(() => {
      db.delete(groupMembers).where(eq(groupMembers.groupId, id)).run();
      for (const uid of unique) db.insert(groupMembers).values({ groupId: id, userId: uid }).run();
    });
    audit(deps, u, 'group.members', { name: g.name }, { count: unique.length });
    return { ok: true };
  });
}
