import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, type ZodType } from 'zod';
import {
  ITEMS,
  validateUnlockGraph,
  type LevelMeta,
  type Requirement,
  type UnlockDefinitions,
} from '@pixel/shared';
import { getTaskType, type TaskBase } from '../tasks/index.js';

export const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('../../content', import.meta.url));

const RequirementSchema: ZodType<Requirement> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(RequirementSchema) }),
    z.object({ any: z.array(RequirementSchema) }),
    z.object({
      level: z.string(),
      status: z.enum(['completed', 'started']).optional(),
      minStars: z.number().int().min(1).max(3).optional(),
    }),
    z.object({ starsTotal: z.number().int().min(1) }),
    z.object({ zone: z.string() }),
    z.object({ teacherUnlock: z.literal(true) }),
  ]),
) as ZodType<Requirement>;

const LevelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().min(1).max(80),
  subject: z.string().max(80).default(''),
  description: z.string().max(500).default(''),
  icon: z.enum(['terminal', 'rack', 'cave', 'frame']).default('terminal'),
  portal: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).optional(),
  requires: RequirementSchema.optional(),
  stars: z.tuple([z.number(), z.number(), z.number()]).default([0.5, 0.75, 0.95]),
  rewards: z
    .object({
      currencyPerStar: z.number().int().min(0).max(500).optional(),
      completionBonus: z.number().int().min(0).max(1000).optional(),
    })
    .default({}),
  tasks: z
    .array(z.object({ type: z.string() }).passthrough())
    .min(1)
    .max(30),
});

export interface LevelDef extends Omit<z.infer<typeof LevelSchema>, 'tasks'> {
  tasks: TaskBase[];
}

const WorldSchema = z.object({
  zones: z.array(
    z.object({ id: z.string(), label: z.string(), requires: RequirementSchema.optional() }),
  ),
});

export interface Content {
  levels: Map<string, LevelDef>;
  levelList: LevelDef[];
  zones: Array<{ id: string; label: string; requires?: Requirement }>;
  unlockDefs: UnlockDefinitions;
}

/** Loads and validates all level files. Throws with readable German messages on errors. */
export function loadContent(dir = DEFAULT_CONTENT_DIR): Content {
  const errors: string[] = [];
  const world = WorldSchema.parse(JSON.parse(readFileSync(join(dir, 'world.json'), 'utf8')));
  const levels = new Map<string, LevelDef>();
  const files = readdirSync(join(dir, 'levels'))
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, 'levels', file), 'utf8'));
    } catch (e) {
      errors.push(`${file}: kein gültiges JSON (${(e as Error).message})`);
      continue;
    }
    const r = LevelSchema.safeParse(raw);
    if (!r.success) {
      errors.push(
        `${file}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
      continue;
    }
    const tasks: TaskBase[] = [];
    const taskIds = new Set<string>();
    r.data.tasks.forEach((t, i) => {
      try {
        const parsed = getTaskType(t.type).schema.safeParse(t);
        if (!parsed.success) {
          errors.push(
            `${file} Aufgabe ${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`,
          );
          return;
        }
        if (taskIds.has(parsed.data.id))
          errors.push(`${file}: Aufgaben-ID "${parsed.data.id}" doppelt`);
        taskIds.add(parsed.data.id);
        tasks.push(parsed.data);
      } catch (e) {
        errors.push(`${file} Aufgabe ${i + 1}: ${(e as Error).message}`);
      }
    });
    if (levels.has(r.data.id)) errors.push(`${file}: Level-ID "${r.data.id}" doppelt`);
    levels.set(r.data.id, { ...r.data, tasks });
  }
  const unlockDefs: UnlockDefinitions = {
    levels: [...levels.values()].map((l) => ({ id: l.id, requires: l.requires })),
    zones: world.zones.map((z) => ({ id: z.id, requires: z.requires })),
  };
  errors.push(...validateUnlockGraph(unlockDefs));
  for (const item of ITEMS)
    for (const s of item.sources)
      if (s.type === 'level' && !levels.has(s.levelId))
        errors.push(`Item ${item.id}: unbekanntes Level "${s.levelId}"`);
  if (errors.length) throw new Error(`Fehler in den Lerninhalten:\n- ${errors.join('\n- ')}`);
  return { levels, levelList: [...levels.values()], zones: world.zones, unlockDefs };
}

export function levelMeta(l: LevelDef): LevelMeta {
  return {
    id: l.id,
    title: l.title,
    subject: l.subject,
    description: l.description,
    icon: l.icon,
    ...(l.portal ? { portal: l.portal } : {}),
    ...(l.requires ? { requires: l.requires } : {}),
    taskCount: l.tasks.length,
    starThresholds: l.stars,
  };
}
