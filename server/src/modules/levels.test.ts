import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PublicTask, RunStartResponse } from '@pixel/shared';
import { Client, createTestApp, seedWorld, type TestCtx } from '../test/helpers.js';
import { balance, verifyLedger } from './wallet.js';

let t: TestCtx;
let w: Awaited<ReturnType<typeof seedWorld>>;
let anna: Client;
let teacher: Client;

beforeEach(async () => {
  t = await createTestApp();
  w = await seedWorld(t.app);
  anna = new Client(t.app);
  teacher = new Client(t.app);
  await anna.login('anna', w.password, 'AAA-111');
  await anna.post('/api/character', { skinTone: 0, hair: 'hair-short-brown' });
  await teacher.login('lehrerA', w.password);
});
afterEach(() => t.app.close());

/** Answers every task correctly using the solutions from the server-side content. */
async function solveLevel(c: Client, levelId: string, opts: { wrongFirst?: boolean } = {}) {
  const run = (await c.post(`/api/levels/${levelId}/start`)).json() as RunStartResponse;
  const def = t.app.deps.content.levels.get(levelId)!;
  for (const task of run.tasks) {
    await c.post(`/api/runs/${run.runId}/tasks/${task.id}/view`);
    if (opts.wrongFirst)
      await c.post(`/api/runs/${run.runId}/tasks/${task.id}/answer`, { answer: wrongAnswer(task) });
    const raw = def.tasks.find((x) => x.id === task.id)! as unknown as Record<string, unknown>;
    const res = await c.post(`/api/runs/${run.runId}/tasks/${task.id}/answer`, {
      answer: correctAnswer(task, raw),
    });
    expect(res.json().correct, `${levelId}/${task.id}`).toBe(true);
  }
  return (await c.post(`/api/runs/${run.runId}/finish`)).json();
}

function correctAnswer(task: PublicTask, raw: Record<string, unknown>): unknown {
  const v = task.view as Record<string, Array<{ id: string; text: string }>>;
  switch (task.type) {
    case 'choice': {
      const correct = (raw.options as Array<{ text: string; correct?: boolean }>)
        .filter((o) => o.correct)
        .map((o) => o.text);
      return { selected: v.options!.filter((o) => correct.includes(o.text)).map((o) => o.id) };
    }
    case 'cloze': {
      const gaps = raw.gaps as Record<string, { accepted: string[] }>;
      return { gaps: Object.fromEntries(Object.entries(gaps).map(([k, g]) => [k, g.accepted[0]])) };
    }
    case 'match': {
      const pairs = raw.pairs as Array<{ left: string; right: string }>;
      return {
        pairs: Object.fromEntries(
          v.left!.map((l) => [
            l.id,
            v.right!.find((r) => r.text === pairs.find((p) => p.left === l.text)!.right)!.id,
          ]),
        ),
      };
    }
    case 'order':
      return {
        order: (raw.items as string[]).map((txt) => v.items!.find((i) => i.text === txt)!.id),
      };
  }
  throw new Error(task.type);
}

function wrongAnswer(task: PublicTask): unknown {
  switch (task.type) {
    case 'choice':
      return { selected: [] };
    case 'cloze':
      return { gaps: {} };
    case 'match':
      return { pairs: {} };
    default:
      return { order: [] };
  }
}

describe('level runs', () => {
  it('delivers tasks without solutions', async () => {
    const run = (await anna.post('/api/levels/demo-a/start')).json();
    const text = JSON.stringify(run);
    expect(text).not.toMatch(/"correct"|accepted|"items":\["Eingabe","Verarbeitung"/);
  });

  it('locked levels cannot be started (server-side check)', async () => {
    expect((await anna.post('/api/levels/demo-b/start')).statusCode).toBe(403);
    expect((await anna.post('/api/levels/demo-e/start')).statusCode).toBe(403);
  });

  it('chain A → B → C unlocks step by step, zones follow', async () => {
    const s = await solveLevel(anna, 'demo-a');
    expect(s.stars).toBe(3);
    expect(s.passed).toBe(true);
    let world = (await anna.get('/api/world')).json();
    expect(world.state.levels['demo-b'].status).toBe('available');
    expect(world.state.levels['demo-c'].status).toBe('locked');
    expect(world.state.zones.datenstrand.open).toBe(true); // 3 stars
    await solveLevel(anna, 'demo-b');
    await solveLevel(anna, 'demo-c');
    world = (await anna.get('/api/world')).json();
    expect(world.state.zones.serverberg.open).toBe(true);
    expect(world.state.levels['demo-e'].status).toBe('available');
  });

  it('pays rewards once; a replay pays only newly reached stars', async () => {
    const first = await solveLevel(anna, 'demo-a', { wrongFirst: true });
    expect(first.stars).toBeLessThan(3);
    const after1 = balance(t.app.deps, w.anna).balance;
    expect(first.currency).toBeGreaterThan(0);
    const second = await solveLevel(anna, 'demo-a');
    expect(second.stars).toBe(3);
    expect(second.newStars).toBe(3 - first.stars);
    const third = await solveLevel(anna, 'demo-a');
    expect(third.currency).toBe(0);
    expect(third.items).toEqual([]);
    expect(balance(t.app.deps, w.anna).balance).toBeGreaterThan(after1);
    expect(verifyLedger(t.app.deps, w.anna)).toBe(true);
  });

  it('grants level items and achievements exactly once', async () => {
    const s = await solveLevel(anna, 'demo-a');
    expect(s.items.map((i: { itemId: string }) => i.itemId)).toContain('hair-long-blond');
    expect(s.achievements).toContain('first-level');
    expect(s.achievements).toContain('perfect-level');
    const again = await solveLevel(anna, 'demo-a');
    expect(again.achievements).toEqual([]);
  });

  it('records attempts with server-side timing and hints', async () => {
    const run = (await anna.post('/api/levels/demo-a/start')).json() as RunStartResponse;
    const task = run.tasks.find((x) => x.id === 'byte')!;
    await anna.post(`/api/runs/${run.runId}/tasks/byte/view`);
    const hint = (await anna.post(`/api/runs/${run.runId}/tasks/byte/hint`)).json();
    expect(hint.hint).toMatch(/256/);
    expect((await anna.post(`/api/runs/${run.runId}/tasks/byte/hint`)).statusCode).toBe(409);
    t.clock.advance(30_000);
    const res = (
      await anna.post(`/api/runs/${run.runId}/tasks/byte/answer`, { answer: wrongAnswer(task) })
    ).json();
    expect(res.correct).toBe(false);
    expect(res.attemptsLeft).toBe(2);
    expect(res.timeMs).toBe(30_000);
    expect(res.hintsUsed).toBe(1);
    const row = t.app.deps.sqlite.prepare('select * from task_attempts').get() as {
      duration_ms: number;
      hints_used: number;
    };
    expect(row.duration_ms).toBe(30_000);
    expect(row.hints_used).toBe(1);
  });

  it('a task is closed after the maximum attempts', async () => {
    const run = (await anna.post('/api/levels/demo-a/start')).json() as RunStartResponse;
    const task = run.tasks[0]!;
    for (let i = 0; i < 3; i++)
      await anna.post(`/api/runs/${run.runId}/tasks/${task.id}/answer`, {
        answer: wrongAnswer(task),
      });
    const last = await anna.post(`/api/runs/${run.runId}/tasks/${task.id}/answer`, {
      answer: wrongAnswer(task),
    });
    expect(last.statusCode).toBe(409);
  });

  it('other users cannot use someone else’s run', async () => {
    const run = (await anna.post('/api/levels/demo-a/start')).json() as RunStartResponse;
    const ben = new Client(t.app);
    await ben.login('ben', w.password, 'AAA-111');
    expect((await ben.post(`/api/runs/${run.runId}/finish`)).statusCode).toBe(404);
  });

  it('teacher unlock/lock overrides the graph', async () => {
    await teacher.post('/api/teacher/levels/overrides', {
      targets: [{ scopeType: 'user', scopeId: w.anna }],
      levelId: 'demo-e',
      mode: 'unlock',
    });
    expect((await anna.get('/api/world')).json().state.levels['demo-e'].status).toBe('available');
    await teacher.post('/api/teacher/levels/overrides', {
      targets: [{ scopeType: 'class', scopeId: w.classA }],
      levelId: 'demo-a',
      mode: 'lock',
    });
    expect((await anna.post('/api/levels/demo-a/start')).statusCode).toBe(403);
    const foreign = await teacher.post('/api/teacher/levels/overrides', {
      targets: [{ scopeType: 'user', scopeId: w.bea }],
      levelId: 'demo-a',
      mode: 'unlock',
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('teachers play in preview mode without stored progress', async () => {
    const run = (await teacher.post('/api/levels/demo-e/start')).json();
    expect(run.preview).toBe(true);
    const s = (await teacher.post(`/api/runs/${run.runId}/finish`)).json();
    expect(s.preview).toBe(true);
    const n = t.app.deps.sqlite.prepare('select count(*) n from level_progress').get() as {
      n: number;
    };
    expect(n.n).toBe(0);
  });
});
