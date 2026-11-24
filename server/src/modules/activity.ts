import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import type { Deps } from '../deps.js';
import { activityDaily, users } from '../db/schema.js';
import { requireReady } from '../auth/guards.js';
import { dayKey } from '../lib/clock.js';

/** Last heartbeat per user – memory only. */
const lastBeat = new Map<string, number>();
const ONLINE_WINDOW = 150_000;

export function recentlyActive(userId: string, now: number): boolean {
  const t = lastBeat.get(userId);
  return t !== undefined && now - t < ONLINE_WINDOW;
}

/**
 * Online time is measured by a heartbeat every 60 s while the game is visible and stored
 * ONLY as minutes per day. No tracking of mouse, screen, keys or positions.
 */
export function registerActivityRoutes(app: FastifyInstance, deps: Deps): void {
  app.post(
    '/api/heartbeat',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const u = requireReady(req, deps);
      const now = deps.clock.now();
      const prev = lastBeat.get(u.id);
      lastBeat.set(u.id, now);
      // Count a minute only for regular heartbeats (≥ 50 s apart) – no double counting with several tabs.
      if (u.role === 'student' && (prev === undefined || now - prev >= 50_000)) {
        deps.db
          .insert(activityDaily)
          .values({ userId: u.id, day: dayKey(now), minutes: 1 })
          .onConflictDoUpdate({
            target: [activityDaily.userId, activityDaily.day],
            set: { minutes: sql`${activityDaily.minutes} + 1` },
          })
          .run();
      }
      deps.db.update(users).set({ lastActiveAt: now }).where(eq(users.id, u.id)).run();
      return { ok: true };
    },
  );
}
