import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONTENT_DIR, loadContent } from './loader.js';

describe('content loader', () => {
  it('loads the shipped placeholder levels incl. the chain A → B → C', () => {
    const c = loadContent();
    expect(c.levelList.map((l) => l.id)).toEqual([
      'demo-a',
      'demo-b',
      'demo-c',
      'demo-d',
      'demo-e',
    ]);
    expect(c.levels.get('demo-c')!.requires).toEqual({ level: 'demo-b' });
  });

  it('reports broken levels with readable messages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lvl-'));
    cpSync(DEFAULT_CONTENT_DIR, dir, { recursive: true });
    writeFileSync(
      join(dir, 'levels', 'kaputt.json'),
      JSON.stringify({
        id: 'kaputt',
        title: 'X',
        requires: { level: 'gibtsnicht' },
        tasks: [{ type: 'choice', id: 'a', prompt: 'p', options: [{ text: 'x' }, { text: 'y' }] }],
      }),
    );
    expect(() => loadContent(dir)).toThrow(/Mindestens eine Antwort|unbekanntes Level/);
  });

  it('detects cycles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lvl-'));
    mkdirSync(join(dir, 'levels'));
    writeFileSync(join(dir, 'world.json'), JSON.stringify({ zones: [] }));
    const task = { type: 'order', id: 'o', prompt: 'p', items: ['a', 'b'] };
    writeFileSync(
      join(dir, 'levels', 'x.json'),
      JSON.stringify({ id: 'x', title: 'X', requires: { level: 'y' }, tasks: [task] }),
    );
    writeFileSync(
      join(dir, 'levels', 'y.json'),
      JSON.stringify({ id: 'y', title: 'Y', requires: { level: 'x' }, tasks: [task] }),
    );
    expect(() => loadContent(dir)).toThrow(/Zyklus/);
  });
});
