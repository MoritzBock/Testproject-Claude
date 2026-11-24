import type { Deps } from './deps.js';
import { classTeachers, classes, users } from './db/schema.js';
import { hashPassword } from './lib/passwords.js';

export const DEMO = {
  superadmin: { username: 'admin', password: 'Admin-Passwort-1' },
  teacher: { username: 'lehrkraft', password: 'Lehrkraft-Passwort-1' },
  classCode: 'DEMO-01',
  students: ['Pixelfuchs', 'Bitbiber', 'Datendachs', 'Kabeleule', 'Routerrabe'],
  studentPassword: 'Schueler-Passwort-1',
};

/** Creates demo accounts on an EMPTY database (development only). Returns true if created. */
export async function seedDemo(deps: Deps): Promise<boolean> {
  const { db, clock } = deps;
  if (db.select({ id: users.id }).from(users).limit(1).get()) return false;
  const now = clock.now();
  const mk = async (
    role: 'student' | 'teacher' | 'superadmin',
    username: string,
    pw: string,
    classId: string | null,
  ) => {
    const id = crypto.randomUUID();
    db.insert(users)
      .values({
        id,
        role,
        username,
        usernameKey: username.toLowerCase(),
        classId,
        passwordHash: await hashPassword(pw),
        mustChangePassword: false,
        lastActiveAt: now,
        createdAt: now,
      })
      .run();
    return id;
  };
  await mk('superadmin', DEMO.superadmin.username, DEMO.superadmin.password, null);
  const teacherId = await mk('teacher', DEMO.teacher.username, DEMO.teacher.password, null);
  const classId = crypto.randomUUID();
  db.insert(classes)
    .values({
      id: classId,
      name: 'FIAE 10a (Demo)',
      schoolYear: '2026/27',
      joinCode: DEMO.classCode,
      createdAt: now,
    })
    .run();
  db.insert(classTeachers).values({ classId, teacherId }).run();
  for (const s of DEMO.students) await mk('student', s, DEMO.studentPassword, classId);
  return true;
}
