/**
 * Unlock graph: requirements for levels and hub zones.
 * Pure logic shared by client (display) and server (authoritative checks, from M4).
 */

export type Requirement =
  | { all: Requirement[] }
  | { any: Requirement[] }
  | { level: string; status?: 'completed' | 'started'; minStars?: number }
  | { starsTotal: number }
  | { zone: string }
  | { teacherUnlock: true };

export type LevelStatus = 'locked' | 'available' | 'started' | 'completed';

export interface LevelProgress {
  status: 'not_started' | 'started' | 'completed';
  stars: number;
}

export interface UnlockDefinitions {
  levels: Array<{ id: string; requires?: Requirement }>;
  zones: Array<{ id: string; requires?: Requirement }>;
}

export interface UnlockContext {
  progress: Readonly<Record<string, LevelProgress | undefined>>;
  /** Level ids explicitly unlocked by a teacher for this learner. */
  teacherUnlocked: ReadonlySet<string>;
  /** Level ids explicitly locked by a teacher (wins over everything). */
  teacherLocked?: ReadonlySet<string>;
}

/** A single unmet leaf requirement – used to tell the learner what is missing. */
export type Missing =
  | { kind: 'level'; level: string; status: 'completed' | 'started'; minStars?: number }
  | { kind: 'starsTotal'; needed: number; have: number }
  | { kind: 'zone'; zone: string }
  | { kind: 'teacherUnlock' }
  | { kind: 'teacherLocked' };

export function totalStars(progress: UnlockContext['progress']): number {
  return Object.values(progress).reduce((sum, p) => sum + (p?.stars ?? 0), 0);
}

interface EvalEnv {
  ctx: UnlockContext;
  zoneOpen: (zone: string) => boolean;
  /** id of the level being evaluated (for teacherUnlock). */
  subject?: string;
}

function evaluate(req: Requirement, env: EvalEnv): Missing[] {
  if ('all' in req) return req.all.flatMap((r) => evaluate(r, env));
  if ('any' in req) {
    if (req.any.length === 0) return [];
    const results = req.any.map((r) => evaluate(r, env));
    if (results.some((m) => m.length === 0)) return [];
    // report the alternative with the fewest missing parts
    return results.reduce((a, b) => (b.length < a.length ? b : a));
  }
  if ('level' in req) {
    const p = env.ctx.progress[req.level];
    const need = req.status ?? 'completed';
    const statusOk =
      need === 'started'
        ? p?.status === 'started' || p?.status === 'completed'
        : p?.status === 'completed';
    const starsOk = (p?.stars ?? 0) >= (req.minStars ?? 0);
    return statusOk && starsOk
      ? []
      : [
          {
            kind: 'level',
            level: req.level,
            status: need,
            ...(req.minStars ? { minStars: req.minStars } : {}),
          },
        ];
  }
  if ('starsTotal' in req) {
    const have = totalStars(env.ctx.progress);
    return have >= req.starsTotal ? [] : [{ kind: 'starsTotal', needed: req.starsTotal, have }];
  }
  if ('zone' in req) return env.zoneOpen(req.zone) ? [] : [{ kind: 'zone', zone: req.zone }];
  // teacherUnlock
  return env.subject && env.ctx.teacherUnlocked.has(env.subject) ? [] : [{ kind: 'teacherUnlock' }];
}

export interface WorldState {
  zones: Record<string, { open: boolean; missing: Missing[] }>;
  levels: Record<string, { status: LevelStatus; stars: number; missing: Missing[] }>;
  starsTotal: number;
}

/** Computes the state of every zone and level for one learner. */
export function computeWorldState(defs: UnlockDefinitions, ctx: UnlockContext): WorldState {
  const zoneDefs = new Map(defs.zones.map((z) => [z.id, z]));
  const zoneCache = new Map<string, Missing[]>();
  const visiting = new Set<string>();

  const zoneMissing = (id: string): Missing[] => {
    const cached = zoneCache.get(id);
    if (cached) return cached;
    const def = zoneDefs.get(id);
    if (!def) return [{ kind: 'zone', zone: id }]; // unknown zone = closed
    if (visiting.has(id)) throw new Error(`Zyklus in Zonen-Voraussetzungen bei "${id}"`);
    visiting.add(id);
    const m = def.requires ? evaluate(def.requires, { ctx, zoneOpen }) : [];
    visiting.delete(id);
    zoneCache.set(id, m);
    return m;
  };
  const zoneOpen = (id: string) => zoneMissing(id).length === 0;

  const zones: WorldState['zones'] = {};
  for (const z of defs.zones) {
    const missing = zoneMissing(z.id);
    zones[z.id] = { open: missing.length === 0, missing };
  }

  const levels: WorldState['levels'] = {};
  for (const l of defs.levels) {
    const p = ctx.progress[l.id];
    const stars = p?.stars ?? 0;
    let missing: Missing[];
    if (ctx.teacherLocked?.has(l.id)) missing = [{ kind: 'teacherLocked' }];
    else if (ctx.teacherUnlocked.has(l.id)) missing = [];
    else missing = l.requires ? evaluate(l.requires, { ctx, zoneOpen, subject: l.id }) : [];

    let status: LevelStatus;
    if (missing.length > 0) status = 'locked';
    else if (p?.status === 'completed') status = 'completed';
    else if (p?.status === 'started') status = 'started';
    else status = 'available';
    levels[l.id] = { status, stars, missing };
  }
  return { zones, levels, starsTotal: totalStars(ctx.progress) };
}

/** Collects the level ids a requirement depends on (for cycle detection). */
function levelDeps(req: Requirement | undefined): string[] {
  if (!req) return [];
  if ('all' in req) return req.all.flatMap(levelDeps);
  if ('any' in req) return req.any.flatMap(levelDeps);
  if ('level' in req) return [req.level];
  return [];
}

/**
 * Validates the graph: unknown references and cycles. Returns a list of German error
 * messages (empty = valid). Zone requirements of levels are resolved through the zones.
 */
export function validateUnlockGraph(defs: UnlockDefinitions): string[] {
  const errors: string[] = [];
  const levelIds = new Set(defs.levels.map((l) => l.id));
  const zoneIds = new Set(defs.zones.map((z) => z.id));
  const zoneReq = new Map(defs.zones.map((z) => [z.id, z.requires]));

  const refs = (req: Requirement | undefined, owner: string) => {
    if (!req) return;
    if ('all' in req) req.all.forEach((r) => refs(r, owner));
    else if ('any' in req) req.any.forEach((r) => refs(r, owner));
    else if ('level' in req && !levelIds.has(req.level))
      errors.push(`${owner}: unbekanntes Level "${req.level}"`);
    else if ('zone' in req && !zoneIds.has(req.zone))
      errors.push(`${owner}: unbekannte Zone "${req.zone}"`);
  };
  defs.levels.forEach((l) => refs(l.requires, `Level ${l.id}`));
  defs.zones.forEach((z) => refs(z.requires, `Zone ${z.id}`));

  // Edges level → levels it depends on (directly or via zones).
  const zoneDepsOf = (req: Requirement | undefined, seen = new Set<string>()): string[] => {
    if (!req) return [];
    if ('all' in req) return req.all.flatMap((r) => zoneDepsOf(r, seen));
    if ('any' in req) return req.any.flatMap((r) => zoneDepsOf(r, seen));
    if ('zone' in req) {
      if (seen.has(req.zone)) {
        errors.push(`Zyklus in Zonen-Voraussetzungen bei "${req.zone}"`);
        return [];
      }
      seen.add(req.zone);
      const zr = zoneReq.get(req.zone);
      return [...levelDeps(zr), ...zoneDepsOf(zr, seen)];
    }
    return [];
  };
  const edges = new Map(
    defs.levels.map((l) => [l.id, [...levelDeps(l.requires), ...zoneDepsOf(l.requires)]]),
  );

  const state = new Map<string, 1 | 2>(); // 1 = in progress, 2 = done
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      errors.push(`Zyklus: ${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
      return;
    }
    state.set(id, 1);
    for (const dep of edges.get(id) ?? []) visit(dep, [...path, id]);
    state.set(id, 2);
  };
  defs.levels.forEach((l) => visit(l.id, []));
  return [...new Set(errors)];
}

/** German, learner-friendly description of a missing requirement. */
export function describeMissing(
  m: Missing,
  names: { level: (id: string) => string; zone: (id: string) => string },
): string {
  switch (m.kind) {
    case 'level':
      return m.status === 'started'
        ? `Beginne zuerst „${names.level(m.level)}“`
        : m.minStars
          ? `Schließe „${names.level(m.level)}“ mit mindestens ${m.minStars} ${m.minStars === 1 ? 'Stern' : 'Sternen'} ab`
          : `Schließe zuerst „${names.level(m.level)}“ ab`;
    case 'starsTotal':
      return `Sammle insgesamt ${m.needed} Sterne (du hast ${m.have})`;
    case 'zone':
      return `Erreiche zuerst das Gebiet „${names.zone(m.zone)}“`;
    case 'teacherUnlock':
      return 'Wird von deiner Lehrkraft freigegeben';
    case 'teacherLocked':
      return 'Von deiner Lehrkraft vorübergehend gesperrt';
  }
}
