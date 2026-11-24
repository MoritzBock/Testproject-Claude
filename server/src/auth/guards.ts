import type { FastifyRequest } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import type { Role } from '@pixel/shared';
import type { Deps } from '../deps.js';
import { classTeachers, classes, users } from '../db/schema.js';
import { HttpError, forbidden, notFound } from '../lib/http-error.js';
import type { AuthUser } from './types.js';

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Bitte melde dich an.');
  return req.user;
}

/** Logged in AND finished the mandatory first steps (password change, privacy notice, 2FA if required). */
export function requireReady(req: FastifyRequest, deps: Deps): AuthUser {
  const u = requireUser(req);
  if (u.mustChangePassword)
    throw new HttpError(403, 'password_change_required', 'Bitte ändere zuerst dein Startpasswort.');
  if ((u.privacyAckVersion ?? 0) < deps.cfg.PRIVACY_VERSION)
    throw new HttpError(
      403,
      'privacy_ack_required',
      'Bitte bestätige zuerst die Datenschutzinformation.',
    );
  if (deps.cfg.REQUIRE_STAFF_2FA && u.role !== 'student' && !u.totpEnabled)
    throw new HttpError(
      403,
      'totp_setup_required',
      'Bitte richte zuerst die Zwei-Faktor-Anmeldung ein.',
    );
  return u;
}

export function requireRole(req: FastifyRequest, deps: Deps, ...roles: Role[]): AuthUser {
  const u = requireReady(req, deps);
  if (!roles.includes(u.role)) throw forbidden();
  return u;
}

export function teacherClassIds(deps: Deps, teacherId: string): string[] {
  return deps.db
    .select({ id: classTeachers.classId })
    .from(classTeachers)
    .where(eq(classTeachers.teacherId, teacherId))
    .all()
    .map((r) => r.id);
}

export function assertTeacherOfClass(deps: Deps, teacherId: string, classId: string) {
  const link = deps.db
    .select()
    .from(classTeachers)
    .where(and(eq(classTeachers.teacherId, teacherId), eq(classTeachers.classId, classId)))
    .get();
  // Same answer for "does not exist" and "not yours" – no information leak.
  if (!link) throw notFound('Klasse');
  return deps.db.select().from(classes).where(eq(classes.id, classId)).get()!;
}

/** Returns the student if it belongs to one of the teacher's classes. */
export function assertTeacherOfStudent(deps: Deps, teacherId: string, studentId: string) {
  const s = deps.db
    .select()
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.role, 'student')))
    .get();
  if (!s || !s.classId || !teacherClassIds(deps, teacherId).includes(s.classId))
    throw notFound('Person');
  return s;
}

/** Filters a list of student ids down to those the teacher may manage (throws if any is foreign). */
export function assertTeacherOfStudents(deps: Deps, teacherId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const classIds = teacherClassIds(deps, teacherId);
  const rows = deps.db
    .select()
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.role, 'student')))
    .all();
  if (
    rows.length !== new Set(ids).size ||
    rows.some((r) => !r.classId || !classIds.includes(r.classId))
  )
    throw notFound('Person');
  return rows;
}
