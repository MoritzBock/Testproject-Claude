import { and, eq } from 'drizzle-orm';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '@pixel/shared';
import type { Deps } from '../deps.js';
import { achievements, inventory, levelProgress } from '../db/schema.js';
import { grantItem } from './character.js';
import { book } from './wallet.js';

/** Achievement conditions (data in shared/economy.ts, logic here). */
const CONDITIONS: Record<
  string,
  (s: {
    stars: number;
    completed: number;
    perfect: number;
    items: number;
    levels: number;
  }) => boolean
> = {
  'first-level': (s) => s.completed >= 1,
  'stars-5': (s) => s.stars >= 5,
  'stars-15': (s) => s.stars >= 15,
  'perfect-level': (s) => s.perfect >= 1,
  'all-demo': (s) => s.levels > 0 && s.completed >= s.levels,
  'collector-10': (s) => s.items >= 10,
  'collector-25': (s) => s.items >= 25,
};

/** Checks and pays out newly reached achievements (idempotent). Returns new ids. */
export function checkAchievements(deps: Deps, userId: string): string[] {
  const { db, clock } = deps;
  const progress = db.select().from(levelProgress).where(eq(levelProgress.userId, userId)).all();
  const stats = {
    stars: progress.reduce((s, p) => s + p.bestStars, 0),
    completed: progress.filter((p) => p.status === 'completed').length,
    perfect: progress.filter((p) => p.bestStars >= 3).length,
    items: db.select().from(inventory).where(eq(inventory.userId, userId)).all().length,
    levels: deps.content.levelList.length,
  };
  const have = new Set(
    db
      .select()
      .from(achievements)
      .where(eq(achievements.userId, userId))
      .all()
      .map((a) => a.achievementId),
  );
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id) || !CONDITIONS[a.id]?.(stats)) continue;
    db.insert(achievements)
      .values({ userId, achievementId: a.id, unlockedAt: clock.now() })
      .onConflictDoNothing()
      .run();
    if (a.reward.currency)
      book(deps, userId, a.reward.currency, `achievement:${a.id}`, `achievement:${a.id}`);
    if (a.reward.item)
      grantItem(deps, userId, a.reward.item, `achievement:${a.id}`, `achievement:${a.id}:item`);
    fresh.push(a.id);
  }
  // Collecting items can unlock collector achievements in turn.
  if (fresh.some((id) => ACHIEVEMENT_BY_ID.get(id)?.reward.item))
    fresh.push(...checkAchievements(deps, userId));
  return fresh;
}

export function achievementsOf(deps: Deps, userId: string) {
  return deps.db
    .select()
    .from(achievements)
    .where(and(eq(achievements.userId, userId)))
    .all();
}
