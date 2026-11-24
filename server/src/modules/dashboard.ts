import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import {
  activityDaily,
  auditLog,
  groupMembers,
  groups,
  inventory,
  levelProgress,
  taskAttempts,
  taskStatsAnon,
  taskStatsUser,
  teacherNotes,
  users,
  achievements,
  deletionRequests,
} from '../db/schema.js';
import {
  assertTeacherOfClass,
  assertTeacherOfStudent,
  requireRole,
  teacherClassIds,
} from '../auth/guards.js';
import { DAY, dayKey } from '../lib/clock.js';
import { parse } from '../lib/http-error.js';
import { audit } from '../audit.js';
import { balance } from './wallet.js';
import { recentlyActive } from './activity.js';

export interface StudentRow {
  id: string;
  username: string;
  status: string;
  online: boolean;
  lastActiveAt: number;
  levelsCompleted: number;
  stars: number;
  totalMinutes: number;
  attempts: number;
  successRate: number | null;
  groupIds: string[];
  note: string | null;
  deletionDueAt: number;
  deletionRequestedFor: number | null;
}

/** Overview rows for one class. */
export function classOverview(deps: Deps, classId: string): StudentRow[] {
  const { db, cfg, clock } = deps;
  const studs = db
    .select()
    .from(users)
    .where(and(eq(users.classId, classId), eq(users.role, 'student')))
    .orderBy(asc(users.usernameKey))
    .all();
  if (!studs.length) return [];
  const ids = studs.map((s) => s.id);
  const prog = db.select().from(levelProgress).where(inArray(levelProgress.userId, ids)).all();
  const act = db.select().from(activityDaily).where(inArray(activityDaily.userId, ids)).all();
  const stats = db.select().from(taskStatsUser).where(inArray(taskStatsUser.userId, ids)).all();
  const gm = db.select().from(groupMembers).where(inArray(groupMembers.userId, ids)).all();
  const notes = db.select().from(teacherNotes).where(inArray(teacherNotes.userId, ids)).all();
  const dels = db
    .select()
    .from(deletionRequests)
    .where(inArray(deletionRequests.userId, ids))
    .all();
  const now = clock.now();
  return studs.map((s) => {
    const p = prog.filter((x) => x.userId === s.id);
    const st = stats.filter((x) => x.userId === s.id);
    const attempts = st.reduce((a, x) => a + x.attempts, 0);
    const errors = st.reduce((a, x) => a + x.errors, 0);
    return {
      id: s.id,
      username: s.username,
      status: s.status,
      online: deps.presence.isOnline(s.id) || recentlyActive(s.id, now),
      lastActiveAt: s.lastActiveAt,
      levelsCompleted: p.filter((x) => x.status === 'completed').length,
      stars: p.reduce((a, x) => a + x.bestStars, 0),
      totalMinutes: act.filter((x) => x.userId === s.id).reduce((a, x) => a + x.minutes, 0),
      attempts,
      successRate: attempts ? (attempts - errors) / attempts : null,
      groupIds: gm.filter((x) => x.userId === s.id).map((x) => x.groupId),
      note: notes.find((n) => n.userId === s.id)?.text ?? null,
      deletionDueAt: s.lastActiveAt + cfg.RETENTION_INACTIVE_DAYS * DAY,
      deletionRequestedFor: dels.find((d) => d.userId === s.id)?.executeAt ?? null,
    };
  });
}

/** Readable label for a stored wrong-answer key (resolved against the level content). */
function wrongLabel(deps: Deps, levelId: string, taskId: string, key: string): string {
  const task = deps.content.levels.get(levelId)?.tasks.find((t) => t.id === taskId) as unknown as
    | {
        type: string;
        options?: Array<{ text: string }>;
        pairs?: Array<{ left: string; right: string }>;
        items?: string[];
      }
    | undefined;
  if (!task) return key;
  if (key.startsWith('opt:')) {
    const idx = key.slice(4);
    if (idx === '-') return 'keine Auswahl';
    return `gewählt: ${idx
      .split(',')
      .map((i) => task.options?.[Number(i)]?.text ?? '?')
      .join(', ')}`;
  }
  if (task.type === 'cloze') {
    const [gap, ...rest] = key.split('=');
    return `Lücke „${gap}“: „${rest.join('=') || '(leer)'}“`;
  }
  if (key.startsWith('pairs:') && task.pairs) {
    return key
      .slice(6)
      .split(',')
      .map((p) => {
        const [l, r] = p.split('>');
        const left = task.pairs![Number(l)]?.left ?? '?';
        const right = r === '-' ? '(leer)' : (task.pairs![Number(r)]?.right ?? '?');
        return `${left} → ${right}`;
      })
      .join('; ');
  }
  if (key.startsWith('order:') && task.items) {
    return `Reihenfolge: ${key
      .slice(6)
      .split(',')
      .map((i) => task.items![Number(i)] ?? '?')
      .join(' → ')}`;
  }
  return key;
}

export function classAnalysis(deps: Deps, classId: string) {
  const { db, content } = deps;
  const studentIds = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.classId, classId))
    .all()
    .map((r) => r.id);
  const live = db.select().from(taskAttempts).where(eq(taskAttempts.classId, classId)).all();
  const anon = db.select().from(taskStatsAnon).where(eq(taskStatsAnon.classId, classId)).all();
  const prog = studentIds.length
    ? db.select().from(levelProgress).where(inArray(levelProgress.userId, studentIds)).all()
    : [];

  const levels = content.levelList.map((l) => {
    const p = prog.filter((x) => x.levelId === l.id);
    const done = p.filter((x) => x.status === 'completed');
    const tasks = l.tasks.map((t) => {
      const la = live.filter((x) => x.levelId === l.id && x.taskId === t.id);
      const ag = anon.find((x) => x.levelId === l.id && x.taskId === t.id);
      const attempts = la.length + (ag?.attempts ?? 0);
      const errors = la.filter((x) => !x.correct).length + (ag?.errors ?? 0);
      const timeSum = la.reduce((s, x) => s + x.durationMs, 0) + (ag?.timeSumMs ?? 0);
      const hints = la.reduce((s, x) => s + x.hintsUsed, 0) + (ag?.hints ?? 0);
      const wrong: Record<string, number> = {
        ...(ag ? (JSON.parse(ag.wrongAnswers) as Record<string, number>) : {}),
      };
      for (const x of la)
        if (x.wrongAnswerKey) wrong[x.wrongAnswerKey] = (wrong[x.wrongAnswerKey] ?? 0) + 1;
      const topWrong = Object.entries(wrong)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key, count]) => ({ label: wrongLabel(deps, l.id, t.id, key), count }));
      return {
        taskId: t.id,
        type: t.type,
        prompt: t.prompt,
        attempts,
        errors,
        errorRate: attempts ? errors / attempts : null,
        avgTimeMs: attempts ? Math.round(timeSum / attempts) : null,
        hints,
        topWrong,
      };
    });
    return {
      levelId: l.id,
      title: l.title,
      started: p.length,
      completed: done.length,
      avgStars: done.length ? done.reduce((s, x) => s + x.bestStars, 0) / done.length : null,
      avgTimeMs: p.length ? Math.round(p.reduce((s, x) => s + x.totalTimeMs, 0) / p.length) : null,
      tasks,
    };
  });
  const problemTasks = levels
    .flatMap((l) => l.tasks.map((t) => ({ ...t, levelId: l.levelId, levelTitle: l.title })))
    .filter((t) => t.attempts >= 3 && (t.errorRate ?? 0) >= 0.5)
    .sort((a, b) => (b.errorRate ?? 0) - (a.errorRate ?? 0));
  return { levels, problemTasks };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  // prevent CSV/formula injection in spreadsheet programs
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function registerDashboardRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, content, clock } = deps;

  app.get('/api/teacher/classes/:id/overview', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const c = assertTeacherOfClass(deps, u.id, (req.params as { id: string }).id);
    return {
      class: c,
      students: classOverview(deps, c.id),
      retentionDays: deps.cfg.RETENTION_INACTIVE_DAYS,
      warnDays: deps.cfg.RETENTION_WARN_DAYS,
    };
  });

  app.get('/api/teacher/classes/:id/analysis', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const c = assertTeacherOfClass(deps, u.id, (req.params as { id: string }).id);
    return classAnalysis(deps, c.id);
  });

  app.get('/api/teacher/students/:id/detail', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const s = assertTeacherOfStudent(deps, u.id, (req.params as { id: string }).id);
    const since = clock.now() - 56 * DAY;
    const activity = db
      .select()
      .from(activityDaily)
      .where(and(eq(activityDaily.userId, s.id)))
      .orderBy(asc(activityDaily.day))
      .all();
    const prog = db.select().from(levelProgress).where(eq(levelProgress.userId, s.id)).all();
    const tasks = db.select().from(taskStatsUser).where(eq(taskStatsUser.userId, s.id)).all();
    const history = db
      .select()
      .from(taskAttempts)
      .where(and(eq(taskAttempts.userId, s.id), gte(taskAttempts.createdAt, since)))
      .orderBy(desc(taskAttempts.createdAt))
      .limit(300)
      .all();
    const prompt = (levelId: string, taskId: string) =>
      content.levels.get(levelId)?.tasks.find((t) => t.id === taskId)?.prompt ?? taskId;
    const title = (levelId: string) => content.levels.get(levelId)?.title ?? levelId;
    return {
      student: {
        id: s.id,
        username: s.username,
        status: s.status,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
      },
      note: db.select().from(teacherNotes).where(eq(teacherNotes.userId, s.id)).get()?.text ?? '',
      balance: balance(deps, s.id),
      items: db.select().from(inventory).where(eq(inventory.userId, s.id)).all().length,
      achievements: db
        .select()
        .from(achievements)
        .where(eq(achievements.userId, s.id))
        .all()
        .map((a) => a.achievementId),
      activity: activity.map((a) => ({ day: a.day, minutes: a.minutes })),
      levels: content.levelList.map((l) => {
        const p = prog.find((x) => x.levelId === l.id);
        return {
          levelId: l.id,
          title: l.title,
          status: p?.status ?? 'not_started',
          bestStars: p?.bestStars ?? 0,
          runs: p?.runs ?? 0,
          totalTimeMs: p?.totalTimeMs ?? 0,
        };
      }),
      tasks: tasks.map((t) => ({
        ...t,
        levelTitle: title(t.levelId),
        prompt: prompt(t.levelId, t.taskId),
      })),
      history: history.map((h) => ({
        createdAt: h.createdAt,
        levelTitle: title(h.levelId),
        prompt: prompt(h.levelId, h.taskId),
        attemptNo: h.attemptNo,
        correct: h.correct,
        points: h.points,
        maxPoints: h.maxPoints,
        hintsUsed: h.hintsUsed,
        durationMs: h.durationMs,
      })),
      historyRetentionDays: deps.cfg.RETENTION_ATTEMPTS_DAYS,
    };
  });

  /** CSV export of the own class (the dashboard shows a privacy notice first). */
  app.get('/api/teacher/classes/:id/export.csv', async (req, reply) => {
    const u = requireRole(req, deps, 'teacher');
    const c = assertTeacherOfClass(deps, u.id, (req.params as { id: string }).id);
    const rows = classOverview(deps, c.id);
    const prog = rows.length
      ? db
          .select()
          .from(levelProgress)
          .where(
            inArray(
              levelProgress.userId,
              rows.map((r) => r.id),
            ),
          )
          .all()
      : [];
    const head = [
      'Benutzername',
      'Status',
      'Letzte Aktivität',
      'Abgeschlossene Level',
      'Sterne gesamt',
      'Nutzungsdauer (Min.)',
      'Versuche',
      'Erfolgsquote (%)',
      ...content.levelList.map((l) => `Sterne ${l.title}`),
    ];
    const lines = rows.map((r) => [
      r.username,
      r.status,
      new Date(r.lastActiveAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
      r.levelsCompleted,
      r.stars,
      r.totalMinutes,
      r.attempts,
      r.successRate === null ? '' : Math.round(r.successRate * 100),
      ...content.levelList.map(
        (l) => prog.find((p) => p.userId === r.id && p.levelId === l.id)?.bestStars ?? '',
      ),
    ]);
    audit(deps, u, 'export.csv', { classId: c.id, name: c.name }, { rows: rows.length });
    const csv = '﻿' + [head, ...lines].map((l) => l.map(csvCell).join(';')).join('\r\n');
    const file = `lernstand_${c.name.replace(/[^A-Za-z0-9_-]+/g, '_')}_${dayKey(clock.now())}.csv`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${file}"`)
      .header('cache-control', 'no-store')
      .send(csv);
  });

  /** Audit log: own actions and actions concerning own classes. */
  app.get('/api/teacher/audit', async (req) => {
    const u = requireRole(req, deps, 'teacher', 'superadmin');
    const q = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) }),
      req.query,
    );
    const where =
      u.role === 'superadmin'
        ? or(
            eq(auditLog.actorId, u.id),
            inArray(auditLog.action, [
              'teacher.create',
              'teacher.delete',
              'teacher.update',
              'teacher.resetPassword',
              'setup.superadmin',
            ]),
          )
        : (() => {
            const ids = teacherClassIds(deps, u.id);
            return ids.length
              ? or(eq(auditLog.actorId, u.id), inArray(auditLog.targetClassId, ids))
              : eq(auditLog.actorId, u.id);
          })();
    return db.select().from(auditLog).where(where).orderBy(desc(auditLog.id)).limit(q.limit).all();
  });

  /** Groups with member names (for filters). */
  app.get('/api/teacher/groups/full', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    return db.select().from(groups).where(eq(groups.ownerId, u.id)).all();
  });
}
