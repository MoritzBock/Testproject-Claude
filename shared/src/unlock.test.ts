import { describe, expect, it } from 'vitest';
import {
  computeWorldState,
  describeMissing,
  validateUnlockGraph,
  type LevelProgress,
  type UnlockDefinitions,
} from './unlock.js';

const defs: UnlockDefinitions = {
  zones: [
    { id: 'campus' },
    { id: 'beach', requires: { starsTotal: 3 } },
    {
      id: 'mountain',
      requires: { all: [{ level: 'a' }, { level: 'b' }, { level: 'c' }] },
    },
  ],
  levels: [
    { id: 'a' },
    { id: 'b', requires: { level: 'a' } },
    { id: 'c', requires: { level: 'b' } },
    { id: 'd', requires: { zone: 'beach' } },
    { id: 'e', requires: { zone: 'mountain' } },
    { id: 'f', requires: { teacherUnlock: true } },
    { id: 'g', requires: { any: [{ level: 'a', minStars: 3 }, { starsTotal: 5 }] } },
  ],
};

const ctx = (
  progress: Record<string, LevelProgress>,
  teacherUnlocked: string[] = [],
  teacherLocked: string[] = [],
) => ({
  progress,
  teacherUnlocked: new Set(teacherUnlocked),
  teacherLocked: new Set(teacherLocked),
});

describe('unlock graph', () => {
  it('fresh learner: only roots are available', () => {
    const w = computeWorldState(defs, ctx({}));
    expect(w.levels.a!.status).toBe('available');
    expect(w.levels.b!.status).toBe('locked');
    expect(w.levels.b!.missing).toEqual([{ kind: 'level', level: 'a', status: 'completed' }]);
    expect(w.zones.beach).toEqual({
      open: false,
      missing: [{ kind: 'starsTotal', needed: 3, have: 0 }],
    });
    expect(w.levels.d!.missing).toEqual([{ kind: 'zone', zone: 'beach' }]);
  });

  it('chain A → B → C unlocks step by step', () => {
    let w = computeWorldState(defs, ctx({ a: { status: 'started', stars: 0 } }));
    expect(w.levels.a!.status).toBe('started');
    expect(w.levels.b!.status).toBe('locked');
    w = computeWorldState(defs, ctx({ a: { status: 'completed', stars: 1 } }));
    expect(w.levels.b!.status).toBe('available');
    expect(w.levels.c!.status).toBe('locked');
    w = computeWorldState(
      defs,
      ctx({ a: { status: 'completed', stars: 1 }, b: { status: 'completed', stars: 1 } }),
    );
    expect(w.levels.c!.status).toBe('available');
  });

  it('zones open via total stars and completed chains', () => {
    const done = { status: 'completed', stars: 1 } as const;
    let w = computeWorldState(defs, ctx({ a: done, b: done }));
    expect(w.zones.beach!.open).toBe(false);
    w = computeWorldState(defs, ctx({ a: done, b: done, c: done }));
    expect(w.starsTotal).toBe(3);
    expect(w.zones.beach!.open).toBe(true);
    expect(w.zones.mountain!.open).toBe(true);
    expect(w.levels.d!.status).toBe('available');
    expect(w.levels.e!.status).toBe('available');
  });

  it('teacher unlock and lock override requirements', () => {
    let w = computeWorldState(defs, ctx({}));
    expect(w.levels.f!.missing).toEqual([{ kind: 'teacherUnlock' }]);
    w = computeWorldState(defs, ctx({}, ['f', 'c']));
    expect(w.levels.f!.status).toBe('available');
    expect(w.levels.c!.status).toBe('available');
    w = computeWorldState(defs, ctx({}, [], ['a']));
    expect(w.levels.a!.status).toBe('locked');
    expect(w.levels.a!.missing).toEqual([{ kind: 'teacherLocked' }]);
  });

  it('any: satisfied by either alternative, reports the closest one', () => {
    let w = computeWorldState(defs, ctx({ a: { status: 'completed', stars: 2 } }));
    expect(w.levels.g!.status).toBe('locked');
    expect(w.levels.g!.missing).toHaveLength(1);
    w = computeWorldState(defs, ctx({ a: { status: 'completed', stars: 3 } }));
    expect(w.levels.g!.status).toBe('available');
  });

  it('a completed level stays completed and keeps its stars', () => {
    const w = computeWorldState(defs, ctx({ a: { status: 'completed', stars: 2 } }));
    expect(w.levels.a).toEqual({ status: 'completed', stars: 2, missing: [] });
  });
});

describe('validateUnlockGraph', () => {
  it('accepts the demo graph', () => {
    expect(validateUnlockGraph(defs)).toEqual([]);
  });

  it('detects unknown references', () => {
    expect(
      validateUnlockGraph({ zones: [], levels: [{ id: 'x', requires: { level: 'nope' } }] }),
    ).toEqual(['Level x: unbekanntes Level "nope"']);
  });

  it('detects direct and zone-mediated cycles', () => {
    const direct = validateUnlockGraph({
      zones: [],
      levels: [
        { id: 'x', requires: { level: 'y' } },
        { id: 'y', requires: { level: 'x' } },
      ],
    });
    expect(direct.some((e) => e.startsWith('Zyklus'))).toBe(true);
    const viaZone = validateUnlockGraph({
      zones: [{ id: 'z', requires: { level: 'x' } }],
      levels: [{ id: 'x', requires: { zone: 'z' } }],
    });
    expect(viaZone.some((e) => e.startsWith('Zyklus'))).toBe(true);
  });
});

describe('describeMissing', () => {
  const names = {
    level: (id: string) => `Level ${id.toUpperCase()}`,
    zone: (id: string) => `Zone ${id}`,
  };
  it('produces readable German hints', () => {
    expect(describeMissing({ kind: 'level', level: 'a', status: 'completed' }, names)).toBe(
      'Schließe zuerst „Level A“ ab',
    );
    expect(describeMissing({ kind: 'starsTotal', needed: 3, have: 1 }, names)).toBe(
      'Sammle insgesamt 3 Sterne (du hast 1)',
    );
    expect(describeMissing({ kind: 'teacherUnlock' }, names)).toBe(
      'Wird von deiner Lehrkraft freigegeben',
    );
  });
});
