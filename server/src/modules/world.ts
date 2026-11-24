import { and, eq, inArray, or } from 'drizzle-orm';
import { computeWorldState, type LevelProgress, type WorldState } from '@pixel/shared';
import type { Deps } from '../deps.js';
import { groupMembers, levelOverrides, levelProgress, users } from '../db/schema.js';
import type { AuthUser } from '../auth/types.js';

/**
 * Teacher overrides for one learner. Precedence: user > group > class;
 * among several groups "lock" wins (restrictive).
 */
export function overridesFor(
  deps: Deps,
  userId: string,
): { unlocked: Set<string>; locked: Set<string> } {
  const u = deps.db.select().from(users).where(eq(users.id, userId)).get();
  const groupIds = deps.db
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .all()
    .map((g) => g.id);
  const conds = [and(eq(levelOverrides.scopeType, 'user'), eq(levelOverrides.scopeId, userId))];
  if (u?.classId)
    conds.push(and(eq(levelOverrides.scopeType, 'class'), eq(levelOverrides.scopeId, u.classId)));
  if (groupIds.length)
    conds.push(
      and(eq(levelOverrides.scopeType, 'group'), inArray(levelOverrides.scopeId, groupIds)),
    );
  const rows = deps.db
    .select()
    .from(levelOverrides)
    .where(or(...conds))
    .all();
  const unlocked = new Set<string>();
  const locked = new Set<string>();
  const levelIds = new Set(rows.map((r) => r.levelId));
  for (const levelId of levelIds) {
    const forLevel = rows.filter((r) => r.levelId === levelId);
    const pick =
      forLevel.find((r) => r.scopeType === 'user') ??
      (forLevel.some((r) => r.scopeType === 'group' && r.mode === 'lock')
        ? forLevel.find((r) => r.scopeType === 'group' && r.mode === 'lock')
        : forLevel.find((r) => r.scopeType === 'group')) ??
      forLevel.find((r) => r.scopeType === 'class');
    if (pick?.mode === 'unlock') unlocked.add(levelId);
    if (pick?.mode === 'lock') locked.add(levelId);
  }
  return { unlocked, locked };
}

export function progressMap(deps: Deps, userId: string): Record<string, LevelProgress> {
  const rows = deps.db.select().from(levelProgress).where(eq(levelProgress.userId, userId)).all();
  return Object.fromEntries(
    rows.map((r) => [
      r.levelId,
      { status: r.status === 'completed' ? 'completed' : 'started', stars: r.bestStars },
    ]),
  );
}

/** Authoritative world state for a user. Staff see everything unlocked (preview). */
export function worldStateFor(deps: Deps, user: Pick<AuthUser, 'id' | 'role'>): WorldState {
  const progress = user.role === 'student' ? progressMap(deps, user.id) : {};
  if (user.role !== 'student') {
    const all = new Set(deps.content.levelList.map((l) => l.id));
    const w = computeWorldState(deps.content.unlockDefs, { progress, teacherUnlocked: all });
    for (const z of Object.values(w.zones)) {
      z.open = true;
      z.missing = [];
    }
    return w;
  }
  const o = overridesFor(deps, user.id);
  return computeWorldState(deps.content.unlockDefs, {
    progress,
    teacherUnlocked: o.unlocked,
    teacherLocked: o.locked,
  });
}

export function setLevelOverride(
  deps: Deps,
  scope: { scopeType: 'user' | 'group' | 'class'; scopeId: string },
  levelId: string,
  mode: 'unlock' | 'lock' | null,
  actorId: string,
): void {
  const where = and(
    eq(levelOverrides.scopeType, scope.scopeType),
    eq(levelOverrides.scopeId, scope.scopeId),
    eq(levelOverrides.levelId, levelId),
  );
  if (mode === null) {
    deps.db.delete(levelOverrides).where(where).run();
    return;
  }
  deps.db
    .insert(levelOverrides)
    .values({ ...scope, levelId, mode, actorId, createdAt: deps.clock.now() })
    .onConflictDoUpdate({
      target: [levelOverrides.scopeType, levelOverrides.scopeId, levelOverrides.levelId],
      set: { mode, actorId, createdAt: deps.clock.now() },
    })
    .run();
}
