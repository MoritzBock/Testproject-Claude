import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  ITEMS,
  LEVEL_REWARDS,
  pointsFor,
  starsFor,
  type PublicTask,
  type RunStartResponse,
  type RunSummary,
  type TaskResult,
  type WorldResponse,
} from '@pixel/shared';
import type { Deps } from '../deps.js';
import {
  groups,
  levelOverrides,
  levelProgress,
  levelRuns,
  rewardClaims,
  taskAttempts,
  taskStatsUser,
  users,
} from '../db/schema.js';
import {
  assertTeacherOfClass,
  assertTeacherOfStudent,
  requireReady,
  requireRole,
} from '../auth/guards.js';
import type { AuthUser } from '../auth/types.js';
import { HttpError, notFound, parse } from '../lib/http-error.js';
import { HOUR, MINUTE } from '../lib/clock.js';
import { levelMeta, type LevelDef } from '../content/loader.js';
import { getTaskType } from '../tasks/index.js';
import { audit } from '../audit.js';
import { checkAchievements } from './achievements.js';
import { grantItem } from './character.js';
import { affectedUsers, effectivePolicies } from './policies.js';
import { book } from './wallet.js';
import { setLevelOverride, worldStateFor } from './world.js';

interface TaskState {
  taskId: string;
  view: unknown;
  secret: unknown;
  attempts: number;
  hintsUsed: number;
  done: boolean;
  correct: boolean;
  points: number;
  timeMs: number;
  /** Timestamp from which the next attempt's duration is measured. */
  mark: number | null;
}
interface RunState {
  preview: boolean;
  tasks: TaskState[];
}

const MAX_ATTEMPT_MS = 20 * MINUTE;
const secureRand = () => randomInt(0, 2 ** 32) / 2 ** 32;

export function registerLevelRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, clock, content } = deps;

  const level = (id: string): LevelDef => {
    const l = content.levels.get(id);
    if (!l) throw notFound('Level');
    return l;
  };

  const loadRun = (user: AuthUser, runId: string) => {
    const run = db.select().from(levelRuns).where(eq(levelRuns.id, runId)).get();
    if (!run || run.userId !== user.id) throw notFound('Durchgang');
    if (run.finishedAt)
      throw new HttpError(409, 'conflict', 'Dieser Durchgang ist bereits abgeschlossen.');
    return { run, state: JSON.parse(run.state) as RunState, def: level(run.levelId) };
  };

  const saveRun = (runId: string, state: RunState) =>
    db
      .update(levelRuns)
      .set({ state: JSON.stringify(state) })
      .where(eq(levelRuns.id, runId))
      .run();

  const publicTasks = (def: LevelDef, state: RunState): PublicTask[] =>
    state.tasks.map((ts) => {
      const t = def.tasks.find((x) => x.id === ts.taskId)!;
      return {
        id: t.id,
        type: t.type,
        prompt: t.prompt,
        hintCount: t.hints.length,
        maxPoints: t.points,
        maxAttempts: t.maxAttempts,
        view: ts.view,
      } as PublicTask;
    });

  const progressOf = (state: RunState) =>
    state.tasks.map((t) => ({
      taskId: t.taskId,
      done: t.done,
      points: t.points,
      attempts: t.attempts,
      hintsUsed: t.hintsUsed,
    }));

  // --- world --------------------------------------------------------------------------
  app.get('/api/world', async (req): Promise<WorldResponse> => {
    const u = requireReady(req, deps);
    return {
      levels: content.levelList.map(levelMeta),
      zones: content.zones.map((z) => ({ id: z.id, label: z.label })),
      state: worldStateFor(deps, u),
      preview: u.role !== 'student',
    };
  });

  // --- runs ---------------------------------------------------------------------------
  app.post('/api/levels/:id/start', async (req): Promise<RunStartResponse> => {
    const u = requireReady(req, deps);
    const def = level((req.params as { id: string }).id);
    const preview = u.role !== 'student';
    if (!preview) {
      if (effectivePolicies(deps, u.id).frozen)
        throw new HttpError(403, 'forbidden', 'Deine Lehrkraft hat das Spiel gerade pausiert.');
      const st = worldStateFor(deps, u).levels[def.id];
      if (!st || st.status === 'locked')
        throw new HttpError(403, 'forbidden', 'Dieses Level ist noch gesperrt.');
    }
    const now = clock.now();
    // Resume an unfinished run of the last 12 hours (same shuffled tasks).
    const open = db
      .select()
      .from(levelRuns)
      .where(
        and(
          eq(levelRuns.userId, u.id),
          eq(levelRuns.levelId, def.id),
          isNull(levelRuns.finishedAt),
        ),
      )
      .orderBy(desc(levelRuns.startedAt))
      .get();
    if (open && now - open.startedAt < 12 * HOUR) {
      const state = JSON.parse(open.state) as RunState;
      return {
        runId: open.id,
        level: { id: def.id, title: def.title, subject: def.subject },
        tasks: publicTasks(def, state),
        preview,
        progress: progressOf(state),
      };
    }
    const state: RunState = {
      preview,
      tasks: def.tasks.map((t) => {
        const { view, secret } = getTaskType(t.type).toPublic(t, secureRand);
        return {
          taskId: t.id,
          view,
          secret,
          attempts: 0,
          hintsUsed: 0,
          done: false,
          correct: false,
          points: 0,
          timeMs: 0,
          mark: null,
        };
      }),
    };
    const runId = crypto.randomUUID();
    db.transaction(() => {
      db.insert(levelRuns)
        .values({
          id: runId,
          userId: u.id,
          levelId: def.id,
          startedAt: now,
          state: JSON.stringify(state),
        })
        .run();
      if (!preview)
        db.insert(levelProgress)
          .values({ userId: u.id, levelId: def.id, status: 'started', firstStartedAt: now })
          .onConflictDoNothing()
          .run();
    });
    return {
      runId,
      level: { id: def.id, title: def.title, subject: def.subject },
      tasks: publicTasks(def, state),
      preview,
      progress: progressOf(state),
    };
  });

  const taskOf = (state: RunState, taskId: string) => {
    const ts = state.tasks.find((t) => t.taskId === taskId);
    if (!ts) throw notFound('Aufgabe');
    return ts;
  };

  /** The client reports when a task is shown – starts the server-side timer. */
  app.post('/api/runs/:runId/tasks/:taskId/view', async (req) => {
    const u = requireReady(req, deps);
    const { runId, taskId } = req.params as { runId: string; taskId: string };
    const { state } = loadRun(u, runId);
    const ts = taskOf(state, taskId);
    if (!ts.done) {
      ts.mark = clock.now();
      saveRun(runId, state);
    }
    return { ok: true };
  });

  app.post('/api/runs/:runId/tasks/:taskId/hint', async (req) => {
    const u = requireReady(req, deps);
    const { runId, taskId } = req.params as { runId: string; taskId: string };
    const { state, def } = loadRun(u, runId);
    const ts = taskOf(state, taskId);
    const task = def.tasks.find((t) => t.id === taskId)!;
    if (ts.done) throw new HttpError(409, 'conflict', 'Aufgabe ist bereits erledigt.');
    if (ts.hintsUsed >= task.hints.length)
      throw new HttpError(409, 'conflict', 'Keine weiteren Hinweise.');
    const hint = task.hints[ts.hintsUsed]!;
    ts.hintsUsed++;
    saveRun(runId, state);
    return { hint, hintsUsed: ts.hintsUsed, hintsLeft: task.hints.length - ts.hintsUsed };
  });

  app.post('/api/runs/:runId/tasks/:taskId/answer', async (req): Promise<TaskResult> => {
    const u = requireReady(req, deps);
    const { runId, taskId } = req.params as { runId: string; taskId: string };
    const { run, state, def } = loadRun(u, runId);
    const ts = taskOf(state, taskId);
    const task = def.tasks.find((t) => t.id === taskId)!;
    if (ts.done) throw new HttpError(409, 'conflict', 'Aufgabe ist bereits erledigt.');
    const type = getTaskType(task.type);
    const answer = parse(type.answerSchema, (req.body as { answer?: unknown })?.answer);
    const evaluation = type.evaluate(task, answer, ts.secret);
    const now = clock.now();
    const duration = Math.min(MAX_ATTEMPT_MS, Math.max(0, now - (ts.mark ?? now)));
    ts.mark = now;
    ts.attempts++;
    ts.timeMs += duration;
    const correct = evaluation.score >= 1;
    const points = pointsFor(task.points, evaluation.score, ts.attempts, ts.hintsUsed);
    ts.points = Math.max(ts.points, points);
    ts.correct = correct;
    ts.done = correct || ts.attempts >= task.maxAttempts;

    db.transaction(() => {
      saveRun(runId, state);
      if (state.preview) return;
      // Detailed attempt (aggregated and deleted after the retention period).
      const cls = db.select({ c: users.classId }).from(users).where(eq(users.id, u.id)).get();
      db.insert(taskAttempts)
        .values({
          userId: u.id,
          classId: cls?.c ?? null,
          levelId: run.levelId,
          taskId,
          attemptNo: ts.attempts,
          correct,
          points,
          maxPoints: task.points,
          hintsUsed: ts.hintsUsed,
          durationMs: duration,
          wrongAnswerKey: correct ? null : (evaluation.wrongKey ?? null),
          createdAt: now,
        })
        .run();
      // Long-term summary per person and task (no timeline).
      db.insert(taskStatsUser)
        .values({
          userId: u.id,
          levelId: run.levelId,
          taskId,
          attempts: 1,
          errors: correct ? 0 : 1,
          hints: ts.hintsUsed,
          timeSumMs: duration,
          lastAt: now,
        })
        .onConflictDoUpdate({
          target: [taskStatsUser.userId, taskStatsUser.levelId, taskStatsUser.taskId],
          set: {
            attempts: sql`${taskStatsUser.attempts} + 1`,
            errors: sql`${taskStatsUser.errors} + ${correct ? 0 : 1}`,
            hints: sql`max(${taskStatsUser.hints}, ${ts.hintsUsed})`,
            timeSumMs: sql`${taskStatsUser.timeSumMs} + ${duration}`,
            lastAt: now,
          },
        })
        .run();
    });

    const feedback =
      (correct ? task.feedback.correct : task.feedback.wrong) ??
      (correct
        ? 'Richtig!'
        : ts.done
          ? 'Leider nicht richtig.'
          : 'Noch nicht ganz – versuche es noch einmal.');
    return {
      correct,
      score: evaluation.score,
      points,
      attempt: ts.attempts,
      attemptsLeft: task.maxAttempts - ts.attempts,
      done: ts.done,
      timeMs: ts.timeMs,
      hintsUsed: ts.hintsUsed,
      feedback: evaluation.detail && !correct ? `${feedback} (${evaluation.detail})` : feedback,
      ...(ts.done && task.explanation ? { explanation: task.explanation } : {}),
    };
  });

  app.post('/api/runs/:runId/finish', async (req): Promise<RunSummary> => {
    const u = requireReady(req, deps);
    const { runId } = req.params as { runId: string };
    const { state, def } = loadRun(u, runId);
    const now = clock.now();
    const points = state.tasks.reduce((s, t) => s + t.points, 0);
    const maxPoints = def.tasks.reduce((s, t) => s + t.points, 0);
    const stars = starsFor(maxPoints ? points / maxPoints : 0, def.stars);
    const passed = stars >= 1;
    const timeMs = state.tasks.reduce((s, t) => s + t.timeMs, 0);
    const summary: RunSummary = {
      stars,
      bestStars: stars,
      points,
      maxPoints,
      passed,
      newStars: 0,
      currency: 0,
      items: [],
      achievements: [],
      status: passed ? 'completed' : 'started',
      preview: state.preview,
    };

    db.transaction(() => {
      db.update(levelRuns)
        .set({ finishedAt: now, state: JSON.stringify(state) })
        .where(eq(levelRuns.id, runId))
        .run();
      if (state.preview) return;
      const prev = db
        .select()
        .from(levelProgress)
        .where(and(eq(levelProgress.userId, u.id), eq(levelProgress.levelId, def.id)))
        .get()!;
      const bestStars = Math.max(prev.bestStars, stars);
      const completed = prev.status === 'completed' || passed;
      // Pay only stars that were never paid before → a replay never pays twice.
      const newStars = Math.max(0, bestStars - prev.rewardedStars);
      const perStar = def.rewards.currencyPerStar ?? LEVEL_REWARDS.perStar;
      let currency = 0;
      if (
        newStars > 0 &&
        book(
          deps,
          u.id,
          newStars * perStar,
          `level:${def.id}:stars`,
          `level:${def.id}:stars:${bestStars}`,
        )
      )
        currency += newStars * perStar;
      const firstCompletion = passed && !prev.completionRewarded;
      if (firstCompletion) {
        const bonus = def.rewards.completionBonus ?? LEVEL_REWARDS.firstCompletion;
        if (book(deps, u.id, bonus, `level:${def.id}:completion`, `level:${def.id}:completion`))
          currency += bonus;
      }
      db.update(levelProgress)
        .set({
          status: completed ? 'completed' : 'started',
          bestStars,
          rewardedStars: Math.max(prev.rewardedStars, bestStars),
          completionRewarded: prev.completionRewarded || passed,
          runs: prev.runs + 1,
          totalTimeMs: prev.totalTimeMs + timeMs,
          completedAt: prev.completedAt ?? (passed ? now : null),
        })
        .where(and(eq(levelProgress.userId, u.id), eq(levelProgress.levelId, def.id)))
        .run();
      // Item rewards defined in the item database (source: level).
      if (completed) {
        for (const item of ITEMS) {
          const src = item.sources.find((s) => s.type === 'level' && s.levelId === def.id);
          if (!src || src.type !== 'level' || bestStars < (src.stars ?? 1)) continue;
          const ref = `level:${def.id}:item:${item.id}`;
          if (
            db
              .select()
              .from(rewardClaims)
              .where(and(eq(rewardClaims.userId, u.id), eq(rewardClaims.ref, ref)))
              .get()
          )
            continue;
          db.insert(rewardClaims).values({ userId: u.id, ref, createdAt: now }).run();
          summary.items.push(grantItem(deps, u.id, item.id, `level:${def.id}`, ref));
        }
      }
      summary.achievements = checkAchievements(deps, u.id);
      summary.bestStars = bestStars;
      summary.newStars = newStars;
      summary.currency = currency + summary.items.reduce((s, i) => s + i.converted, 0);
      summary.status = completed ? 'completed' : 'started';
    });
    return summary;
  });

  // --- teacher: unlock / lock levels -----------------------------------------------------
  app.post('/api/teacher/levels/overrides', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const body = parse(
      z.object({
        targets: z
          .array(
            z.object({
              scopeType: z.enum(['user', 'group', 'class']),
              scopeId: z.string().max(64),
            }),
          )
          .min(1)
          .max(500),
        levelId: z.string().max(40),
        mode: z.enum(['unlock', 'lock']).nullable(),
      }),
      req.body,
    );
    level(body.levelId);
    db.transaction(() => {
      for (const t of body.targets) {
        let info: { name?: string; classId?: string | null };
        if (t.scopeType === 'user') {
          const s = assertTeacherOfStudent(deps, u.id, t.scopeId);
          info = { name: s.username, classId: s.classId };
        } else if (t.scopeType === 'class') {
          const c = assertTeacherOfClass(deps, u.id, t.scopeId);
          info = { name: c.name, classId: c.id };
        } else {
          const g = db.select().from(groups).where(eq(groups.id, t.scopeId)).get();
          if (!g || g.ownerId !== u.id) throw notFound('Gruppe');
          info = { name: g.name };
        }
        setLevelOverride(deps, t, body.levelId, body.mode, u.id);
        const affected = affectedUsers(deps, t);
        deps.presence?.refresh(affected, ['world']);
        audit(
          deps,
          u,
          body.mode === 'lock'
            ? 'level.lock'
            : body.mode === 'unlock'
              ? 'level.unlock'
              : 'level.override.clear',
          {
            userId: t.scopeType === 'user' ? t.scopeId : null,
            name: info.name,
            classId: info.classId ?? null,
          },
          { levelId: body.levelId, scope: t.scopeType },
        );
      }
    });
    return { ok: true };
  });

  /** Current overrides of one scope (for the dashboard editor). */
  app.get('/api/teacher/levels/overrides', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const q = parse(
      z.object({ scopeType: z.enum(['user', 'group', 'class']), scopeId: z.string().max(64) }),
      req.query,
    );
    if (q.scopeType === 'user') assertTeacherOfStudent(deps, u.id, q.scopeId);
    else if (q.scopeType === 'class') assertTeacherOfClass(deps, u.id, q.scopeId);
    else {
      const g = db.select().from(groups).where(eq(groups.id, q.scopeId)).get();
      if (!g || g.ownerId !== u.id) throw notFound('Gruppe');
    }
    return db
      .select({ levelId: levelOverrides.levelId, mode: levelOverrides.mode })
      .from(levelOverrides)
      .where(and(eq(levelOverrides.scopeType, q.scopeType), eq(levelOverrides.scopeId, q.scopeId)))
      .all();
  });

  /** Level list for the dashboard (metadata only, no solutions). */
  app.get('/api/teacher/levels', async (req) => {
    requireRole(req, deps, 'teacher');
    return content.levelList.map((l) => ({
      ...levelMeta(l),
      tasks: l.tasks.map((t) => ({ id: t.id, type: t.type, prompt: t.prompt })),
    }));
  });
}
