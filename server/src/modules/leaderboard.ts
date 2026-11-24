import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  LEADERBOARD_CRITERIA,
  LEADERBOARD_LABELS,
  parseSettings,
  type LeaderboardCriterion,
} from '@pixel/shared';
import type { Deps } from '../deps.js';
import {
  activityDaily,
  inventory,
  levelProgress,
  userSettings,
  users,
  wallets,
} from '../db/schema.js';
import { requireReady } from '../auth/guards.js';
import { HttpError, parse } from '../lib/http-error.js';
import { effectivePolicies } from './policies.js';

/**
 * Leaderboards (off by default, enabled by the teacher per scope).
 * Only within the own class, top 10 plus own rank, pseudonyms only, opt-out → "Anonym".
 * Computed on the fly – nothing extra is stored.
 */
export function registerLeaderboardRoutes(app: FastifyInstance, deps: Deps): void {
  const { db } = deps;

  app.get('/api/leaderboard', async (req) => {
    const u = requireReady(req, deps);
    if (u.role !== 'student' || !u.classId)
      throw new HttpError(403, 'forbidden', 'Ranglisten gibt es nur für Lernende.');
    const pol = effectivePolicies(deps, u.id);
    if (!pol['leaderboard.enabled'])
      throw new HttpError(403, 'disabled', 'Ranglisten sind nicht aktiviert.');
    const allowed = pol['leaderboard.criteria'] as LeaderboardCriterion[];
    const q = parse(z.object({ criterion: z.enum(LEADERBOARD_CRITERIA).optional() }), req.query);
    const criterion = q.criterion && allowed.includes(q.criterion) ? q.criterion : allowed[0];
    if (!criterion) throw new HttpError(403, 'disabled', 'Keine Kriterien freigegeben.');

    const mates = db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(
        and(eq(users.classId, u.classId), eq(users.role, 'student'), eq(users.status, 'active')),
      )
      .all();
    const ids = mates.map((m) => m.id);
    const value = new Map<string, number>(ids.map((id) => [id, 0]));
    const add = (id: string, v: number) => value.set(id, (value.get(id) ?? 0) + v);
    if (criterion === 'stars' || criterion === 'levels') {
      for (const p of db
        .select()
        .from(levelProgress)
        .where(inArray(levelProgress.userId, ids))
        .all())
        add(p.userId, criterion === 'stars' ? p.bestStars : p.status === 'completed' ? 1 : 0);
    } else if (criterion === 'earned') {
      for (const w of db.select().from(wallets).where(inArray(wallets.userId, ids)).all())
        add(w.userId, w.totalEarned);
    } else if (criterion === 'collection') {
      for (const i of db.select().from(inventory).where(inArray(inventory.userId, ids)).all())
        add(i.userId, 1);
    } else {
      for (const a of db
        .select()
        .from(activityDaily)
        .where(inArray(activityDaily.userId, ids))
        .all())
        add(a.userId, a.minutes);
    }
    const anonymous = new Set(
      db
        .select()
        .from(userSettings)
        .where(inArray(userSettings.userId, ids))
        .all()
        .filter((s) => parseSettings(JSON.parse(s.json)).privacy.leaderboardAnonymous)
        .map((s) => s.userId),
    );
    const ranked = mates
      .map((m) => ({ id: m.id, name: m.username, value: value.get(m.id) ?? 0 }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    let rank = 0;
    let last = Number.NaN;
    const withRank = ranked.map((r, i) => {
      if (r.value !== last) rank = i + 1;
      last = r.value;
      return {
        rank,
        name: r.id === u.id ? r.name : anonymous.has(r.id) ? 'Anonym' : r.name,
        value: r.value,
        me: r.id === u.id,
      };
    });
    return {
      criterion,
      criteria: allowed.map((c) => ({ id: c, label: LEADERBOARD_LABELS[c] })),
      top: withRank.slice(0, 10),
      me: withRank.find((r) => r.me) ?? null,
      total: withRank.length,
      unit: criterion === 'playtime' ? 'Min.' : criterion === 'earned' ? 'Bytes' : '',
    };
  });
}
