import { describe, expect, it } from 'vitest';
import { getTaskType } from './index.js';

const rand = (() => {
  let s = 42;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
})();

function setup(raw: unknown) {
  const type = getTaskType((raw as { type: string }).type);
  const task = type.schema.parse(raw);
  const { view, secret } = type.toPublic(task, rand);
  return { type, task, view: view as Record<string, unknown>, secret };
}

describe('choice', () => {
  const raw = {
    id: 't1',
    type: 'choice',
    prompt: 'Welche sind Eingabegeräte?',
    options: [
      { text: 'Tastatur', correct: true },
      { text: 'Monitor' },
      { text: 'Maus', correct: true },
    ],
  };
  it('does not leak the solution', () => {
    const { view } = setup(raw);
    expect(JSON.stringify(view)).not.toMatch(/correct/);
    expect(view.multiple).toBe(true);
  });
  it('scores exact selections only', () => {
    const { type, task, view, secret } = setup(raw);
    const opts = view.options as Array<{ id: string; text: string }>;
    const id = (t: string) => opts.find((o) => o.text === t)!.id;
    expect(type.evaluate(task, { selected: [id('Tastatur'), id('Maus')] }, secret).score).toBe(1);
    const wrong = type.evaluate(task, { selected: [id('Tastatur')] }, secret);
    expect(wrong.score).toBe(0);
    expect(wrong.wrongKey).toBeDefined();
    expect(type.evaluate(task, { selected: ['o99'] }, secret).score).toBe(0);
  });
  it('rejects tasks without a correct option', () => {
    expect(() =>
      getTaskType('choice').schema.parse({ ...raw, options: [{ text: 'a' }, { text: 'b' }] }),
    ).toThrow();
  });
});

describe('cloze', () => {
  const raw = {
    id: 't2',
    type: 'cloze',
    prompt: 'Ergänze.',
    text: 'HTTPS nutzt Port {{p}} und HTTP Port {{q}}.',
    gaps: { p: { accepted: ['443'] }, q: { accepted: ['80'], options: ['21', '25', '80'] } },
  };
  it('splits the text into segments without answers in free gaps', () => {
    const { view } = setup(raw);
    const segs = view.segments as Array<{ t: string; options?: string[] }>;
    expect(segs.filter((s) => s.t === 'gap')).toHaveLength(2);
    expect(JSON.stringify(segs.find((s) => s.t === 'gap' && !s.options))).not.toContain('443');
  });
  it('gives partial score and normalises input', () => {
    const { type, task, secret } = setup(raw);
    expect(type.evaluate(task, { gaps: { p: ' 443 ', q: '80' } }, secret).score).toBe(1);
    const half = type.evaluate(task, { gaps: { p: '443', q: '21' } }, secret);
    expect(half.score).toBe(0.5);
    expect(half.detail).toBe('1 von 2 Lücken richtig');
  });
  it('requires every gap to be defined', () => {
    expect(() =>
      getTaskType('cloze').schema.parse({ ...raw, gaps: { p: { accepted: ['1'] } } }),
    ).toThrow();
  });
});

describe('match', () => {
  const raw = {
    id: 't3',
    type: 'match',
    prompt: 'Ordne zu.',
    pairs: [
      { left: '22', right: 'SSH' },
      { left: '80', right: 'HTTP' },
      { left: '443', right: 'HTTPS' },
    ],
  };
  it('uses opaque ids and scores pairs', () => {
    const { type, task, view, secret } = setup(raw);
    const left = view.left as Array<{ id: string; text: string }>;
    const right = view.right as Array<{ id: string; text: string }>;
    const r = (t: string) => right.find((x) => x.text === t)!.id;
    const pairs = { [left[0]!.id]: r('SSH'), [left[1]!.id]: r('HTTP'), [left[2]!.id]: r('HTTPS') };
    expect(type.evaluate(task, { pairs }, secret).score).toBe(1);
    expect(
      type.evaluate(task, { pairs: { ...pairs, [left[0]!.id]: r('HTTP') } }, secret).score,
    ).toBeCloseTo(2 / 3);
  });
});

describe('order', () => {
  const raw = {
    id: 't4',
    type: 'order',
    prompt: 'Sortiere.',
    items: ['Eingabe', 'Verarbeitung', 'Ausgabe'],
  };
  it('never starts solved and scores positions', () => {
    for (let i = 0; i < 20; i++) {
      const { type, task, view, secret } = setup(raw);
      const items = view.items as Array<{ id: string; text: string }>;
      expect(items.map((x) => x.text)).not.toEqual(raw.items);
      const correct = raw.items.map((t) => items.find((x) => x.text === t)!.id);
      expect(type.evaluate(task, { order: correct }, secret).score).toBe(1);
      expect(type.evaluate(task, { order: [correct[0]!] }, secret).score).toBe(0);
    }
  });
});
