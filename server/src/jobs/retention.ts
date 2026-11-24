import { and, eq, lt, lte } from 'drizzle-orm';
import type { Deps } from '../deps.js';
import {
  activityDaily,
  auditLog,
  deletionRequests,
  levelRuns,
  meta,
  taskAttempts,
  taskStatsAnon,
  users,
} from '../db/schema.js';
import { DAY, dayKey } from '../lib/clock.js';
import { purgeExpiredSessions } from '../auth/session.js';
import { deleteUserCompletely } from '../modules/users.js';
import { audit } from '../audit.js';

export interface RetentionReport {
  sessions: number;
  attemptsAggregated: number;
  activityDeleted: number;
  auditDeleted: number;
  runsDeleted: number;
  accountsDeletedInactive: number;
  accountsDeletedOnRequest: number;
}

/**
 * Automatic deletion periods (Art. 5 (1) e GDPR – storage limitation). Idempotent; runs
 * at start-up and every 6 hours. All periods are configurable (see .env.example).
 */
export function runRetention(deps: Deps): RetentionReport {
  const { db, cfg, clock } = deps;
  const now = clock.now();
  const report: RetentionReport = {
    sessions: purgeExpiredSessions(deps),
    attemptsAggregated: 0,
    activityDeleted: 0,
    auditDeleted: 0,
    runsDeleted: 0,
    accountsDeletedInactive: 0,
    accountsDeletedOnRequest: 0,
  };

  // 1. Detailed attempts → anonymous class statistics, then delete the details.
  const cutoff = now - cfg.RETENTION_ATTEMPTS_DAYS * DAY;
  db.transaction(() => {
    const old = db.select().from(taskAttempts).where(lt(taskAttempts.createdAt, cutoff)).all();
    const groups = new Map<string, typeof old>();
    for (const a of old) {
      if (!a.classId) continue;
      const k = `${a.classId}|${a.levelId}|${a.taskId}`;
      groups.set(k, [...(groups.get(k) ?? []), a]);
    }
    for (const [k, list] of groups) {
      const [classId, levelId, taskId] = k.split('|') as [string, string, string];
      const existing = db
        .select()
        .from(taskStatsAnon)
        .where(
          and(
            eq(taskStatsAnon.classId, classId),
            eq(taskStatsAnon.levelId, levelId),
            eq(taskStatsAnon.taskId, taskId),
          ),
        )
        .get();
      const wrong: Record<string, number> = existing ? JSON.parse(existing.wrongAnswers) : {};
      for (const a of list)
        if (a.wrongAnswerKey) wrong[a.wrongAnswerKey] = (wrong[a.wrongAnswerKey] ?? 0) + 1;
      const row = {
        attempts: (existing?.attempts ?? 0) + list.length,
        errors: (existing?.errors ?? 0) + list.filter((a) => !a.correct).length,
        hints: (existing?.hints ?? 0) + list.reduce((s, a) => s + a.hintsUsed, 0),
        timeSumMs: (existing?.timeSumMs ?? 0) + list.reduce((s, a) => s + a.durationMs, 0),
        wrongAnswers: JSON.stringify(wrong),
      };
      db.insert(taskStatsAnon)
        .values({ classId, levelId, taskId, ...row })
        .onConflictDoUpdate({
          target: [taskStatsAnon.classId, taskStatsAnon.levelId, taskStatsAnon.taskId],
          set: row,
        })
        .run();
    }
    report.attemptsAggregated = db
      .delete(taskAttempts)
      .where(lt(taskAttempts.createdAt, cutoff))
      .run().changes;
  });

  // 2. Online minutes, audit log, old level runs.
  report.activityDeleted = db
    .delete(activityDaily)
    .where(lt(activityDaily.day, dayKey(now - cfg.RETENTION_ACTIVITY_DAYS * DAY)))
    .run().changes;
  report.auditDeleted = db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, now - cfg.RETENTION_AUDIT_DAYS * DAY))
    .run().changes;
  report.runsDeleted = db
    .delete(levelRuns)
    .where(lt(levelRuns.startedAt, now - cfg.RETENTION_RUNS_DAYS * DAY))
    .run().changes;

  // 3. Self-service deletion requests whose grace period is over.
  for (const r of db
    .select()
    .from(deletionRequests)
    .where(lte(deletionRequests.executeAt, now))
    .all()) {
    const u = db.select().from(users).where(eq(users.id, r.userId)).get();
    deps.presence?.kick(r.userId, 'Dein Konto wurde gelöscht.');
    deleteUserCompletely(deps, r.userId);
    audit(deps, null, 'retention.deleteOnRequest', { classId: u?.classId ?? null });
    report.accountsDeletedOnRequest++;
  }

  // 4. Learner accounts inactive for longer than the retention period.
  const inactive = db
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, 'student'),
        lt(users.lastActiveAt, now - cfg.RETENTION_INACTIVE_DAYS * DAY),
      ),
    )
    .all();
  for (const u of inactive) {
    deleteUserCompletely(deps, u.id);
    audit(deps, null, 'retention.deleteInactive', { classId: u.classId });
    report.accountsDeletedInactive++;
  }

  db.insert(meta)
    .values({ key: 'retention_last_run', value: String(now) })
    .onConflictDoUpdate({ target: meta.key, set: { value: String(now) } })
    .run();
  return report;
}

/** Schedules the job (start + every 6 hours). Returns a stop function. */
export function scheduleRetention(
  deps: Deps,
  log: (msg: string, r: RetentionReport) => void,
): () => void {
  const run = () => {
    try {
      log('Löschfristen angewendet', runRetention(deps));
    } catch (e) {
      log(`Löschfristen-Job fehlgeschlagen: ${(e as Error).message}`, {} as RetentionReport);
    }
  };
  run();
  const t = setInterval(run, 6 * 60 * 60 * 1000);
  t.unref();
  return () => clearInterval(t);
}
