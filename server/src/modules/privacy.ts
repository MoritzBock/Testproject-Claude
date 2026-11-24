import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import {
  achievements,
  activityDaily,
  characters,
  classTeachers,
  classes,
  deletionRequests,
  groupMembers,
  groups,
  inventory,
  levelProgress,
  taskAttempts,
  taskStatsUser,
  transactions,
  userSettings,
  users,
  wallets,
} from '../db/schema.js';
import { requireUser } from '../auth/guards.js';
import { destroyUserSessions } from '../auth/session.js';
import { DAY } from '../lib/clock.js';
import { HttpError, parse } from '../lib/http-error.js';
import { verifyPassword } from '../lib/passwords.js';
import { audit } from '../audit.js';
import { deleteUserCompletely } from './users.js';

/**
 * Data subject rights for learners: access + portability (Art. 15/20 GDPR),
 * self-service deletion with a grace period (Art. 17) and archiving.
 */
export function registerPrivacyRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, cfg, clock } = deps;

  /** Everything stored about the logged-in person, as JSON (machine-readable). */
  app.get('/api/me/data', async (req) => {
    const u = requireUser(req);
    const row = db.select().from(users).where(eq(users.id, u.id)).get()!;
    const cls = row.classId
      ? db.select().from(classes).where(eq(classes.id, row.classId)).get()
      : null;
    const teachers = row.classId
      ? db
          .select({ username: users.username })
          .from(classTeachers)
          .innerJoin(users, eq(users.id, classTeachers.teacherId))
          .where(eq(classTeachers.classId, row.classId))
          .all()
          .map((t) => t.username)
      : [];
    const settings = db.select().from(userSettings).where(eq(userSettings.userId, u.id)).get();
    const character = db.select().from(characters).where(eq(characters.userId, u.id)).get();
    return {
      exportedAt: new Date(clock.now()).toISOString(),
      notice:
        'Auskunft und Datenübertragbarkeit (Art. 15 und 20 DSGVO). Passwörter werden nur als Hash gespeichert und sind nicht enthalten.',
      account: {
        username: row.username,
        role: row.role,
        class: cls ? { name: cls.name, schoolYear: cls.schoolYear } : null,
        status: row.status,
        createdAt: new Date(row.createdAt).toISOString(),
        lastActiveAt: new Date(row.lastActiveAt).toISOString(),
        privacyNoticeConfirmedAt: row.privacyAckAt
          ? new Date(row.privacyAckAt).toISOString()
          : null,
        twoFactorEnabled: row.totpEnabled,
      },
      whoCanSee: {
        teachersOfYourClass: teachers,
        administration: 'nur technische Kontodaten, keine Lerndaten',
        classmates:
          'höchstens Benutzername und Spielfigur, wenn deine Lehrkraft gemeinsames Spielen oder Ranglisten aktiviert',
      },
      groups: db
        .select({ name: groups.name })
        .from(groupMembers)
        .innerJoin(groups, eq(groups.id, groupMembers.groupId))
        .where(eq(groupMembers.userId, u.id))
        .all()
        .map((g) => g.name),
      settings: settings ? JSON.parse(settings.json) : null,
      character: character
        ? { skinTone: character.skinTone, equipped: JSON.parse(character.equipped) }
        : null,
      inventory: db
        .select({
          itemId: inventory.itemId,
          source: inventory.source,
          acquiredAt: inventory.acquiredAt,
        })
        .from(inventory)
        .where(eq(inventory.userId, u.id))
        .all(),
      wallet:
        db
          .select({ balance: wallets.balance, totalEarned: wallets.totalEarned })
          .from(wallets)
          .where(eq(wallets.userId, u.id))
          .get() ?? null,
      transactions: db
        .select({
          amount: transactions.amount,
          reason: transactions.reason,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(eq(transactions.userId, u.id))
        .orderBy(desc(transactions.id))
        .all(),
      levelProgress: db
        .select({
          levelId: levelProgress.levelId,
          status: levelProgress.status,
          bestStars: levelProgress.bestStars,
          runs: levelProgress.runs,
          totalTimeMs: levelProgress.totalTimeMs,
        })
        .from(levelProgress)
        .where(eq(levelProgress.userId, u.id))
        .all(),
      taskSummary: db
        .select({
          levelId: taskStatsUser.levelId,
          taskId: taskStatsUser.taskId,
          attempts: taskStatsUser.attempts,
          errors: taskStatsUser.errors,
          hints: taskStatsUser.hints,
          timeSumMs: taskStatsUser.timeSumMs,
        })
        .from(taskStatsUser)
        .where(eq(taskStatsUser.userId, u.id))
        .all(),
      taskAttempts: db
        .select({
          levelId: taskAttempts.levelId,
          taskId: taskAttempts.taskId,
          attemptNo: taskAttempts.attemptNo,
          correct: taskAttempts.correct,
          points: taskAttempts.points,
          hintsUsed: taskAttempts.hintsUsed,
          durationMs: taskAttempts.durationMs,
          createdAt: taskAttempts.createdAt,
        })
        .from(taskAttempts)
        .where(eq(taskAttempts.userId, u.id))
        .all(),
      onlineMinutesPerDay: db
        .select({ day: activityDaily.day, minutes: activityDaily.minutes })
        .from(activityDaily)
        .where(eq(activityDaily.userId, u.id))
        .all(),
      achievements: db
        .select({ id: achievements.achievementId, unlockedAt: achievements.unlockedAt })
        .from(achievements)
        .where(eq(achievements.userId, u.id))
        .all(),
      deletionRequest:
        db.select().from(deletionRequests).where(eq(deletionRequests.userId, u.id)).get() ?? null,
      retention: {
        attemptsDays: cfg.RETENTION_ATTEMPTS_DAYS,
        activityDays: cfg.RETENTION_ACTIVITY_DAYS,
        accountDeletedAfterInactiveDays: cfg.RETENTION_INACTIVE_DAYS,
        scheduledAutomaticDeletion:
          row.role === 'student'
            ? new Date(row.lastActiveAt + cfg.RETENTION_INACTIVE_DAYS * DAY).toISOString()
            : null,
      },
    };
  });

  const checkPassword = async (userId: string, password: string) => {
    const row = db.select().from(users).where(eq(users.id, userId)).get()!;
    if (!(await verifyPassword(row.passwordHash, password)))
      throw new HttpError(400, 'invalid_credentials', 'Das Passwort stimmt nicht.');
    return row;
  };

  /** Request deletion of the own account (executed after the grace period; can be cancelled). */
  app.post('/api/me/delete-request', async (req, reply) => {
    const u = requireUser(req);
    if (u.role !== 'student')
      throw new HttpError(403, 'forbidden', 'Konten von Lehrkräften verwaltet die Administration.');
    const { password } = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const row = await checkPassword(u.id, password);
    const now = clock.now();
    if (cfg.SELF_DELETE_GRACE_DAYS === 0) {
      deleteUserCompletely(deps, u.id);
      audit(deps, null, 'privacy.selfDelete', { classId: row.classId });
      reply.clearCookie('__Host-sid', { path: '/' }).clearCookie('sid', { path: '/' });
      return { deleted: true };
    }
    const executeAt = now + cfg.SELF_DELETE_GRACE_DAYS * DAY;
    db.insert(deletionRequests)
      .values({ userId: u.id, requestedAt: now, executeAt })
      .onConflictDoUpdate({ target: deletionRequests.userId, set: { requestedAt: now, executeAt } })
      .run();
    audit(deps, u, 'privacy.deleteRequest', {
      userId: u.id,
      name: u.username,
      classId: row.classId,
    });
    return { deleted: false, executeAt };
  });

  app.delete('/api/me/delete-request', async (req) => {
    const u = requireUser(req);
    db.delete(deletionRequests)
      .where(and(eq(deletionRequests.userId, u.id)))
      .run();
    audit(deps, u, 'privacy.deleteRequestCancelled', {
      userId: u.id,
      name: u.username,
      classId: u.classId,
    });
    return { ok: true };
  });

  /** Archive the own account: login disabled, data kept until the normal deletion period. */
  app.post('/api/me/archive', async (req) => {
    const u = requireUser(req);
    if (u.role !== 'student') throw new HttpError(403, 'forbidden', 'Nur für Lernende.');
    const { password } = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const row = await checkPassword(u.id, password);
    db.update(users).set({ status: 'archived' }).where(eq(users.id, u.id)).run();
    destroyUserSessions(deps, u.id);
    audit(deps, u, 'privacy.selfArchive', { userId: u.id, name: u.username, classId: row.classId });
    return { ok: true };
  });
}
