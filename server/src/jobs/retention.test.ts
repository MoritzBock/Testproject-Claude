import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, seedWorld, type TestCtx } from '../test/helpers.js';
import { DAY } from '../lib/clock.js';
import { runRetention } from './retention.js';

let t: TestCtx;
let w: Awaited<ReturnType<typeof seedWorld>>;
let anna: Client;
const count = (table: string, where = '1=1') =>
  (
    t.app.deps.sqlite.prepare(`select count(*) n from ${table} where ${where}`).get() as {
      n: number;
    }
  ).n;

beforeEach(async () => {
  t = await createTestApp();
  w = await seedWorld(t.app);
  anna = new Client(t.app);
  await anna.login('anna', w.password, 'AAA-111');
  await anna.post('/api/character', { skinTone: 0, hair: 'hair-short-brown' });
});
afterEach(() => t.app.close());

async function wrongAttempt() {
  const run = (await anna.post('/api/levels/demo-a/start')).json();
  await anna.post(`/api/runs/${run.runId}/tasks/byte/answer`, { answer: { selected: [] } });
}

describe('retention job', () => {
  it('aggregates attempts after 8 weeks into anonymous statistics and deletes the details', async () => {
    await wrongAttempt();
    expect(count('task_attempts')).toBe(1);
    t.clock.advance(55 * DAY);
    await anna.post('/api/heartbeat'); // keep anna active
    expect(runRetention(t.app.deps).attemptsAggregated).toBe(0);
    t.clock.advance(2 * DAY);
    const r = runRetention(t.app.deps);
    expect(r.attemptsAggregated).toBe(1);
    expect(count('task_attempts')).toBe(0);
    const anon = t.app.deps.sqlite.prepare('select * from task_stats_anon').get() as Record<
      string,
      unknown
    >;
    expect(anon.attempts).toBe(1);
    expect(anon.errors).toBe(1);
    expect(anon).not.toHaveProperty('user_id'); // no person reference
    expect(count('task_stats_user')).toBe(1); // per-person summary stays while the account exists
  });

  it('deletes learner accounts after 6 months of inactivity (with all their data)', async () => {
    await wrongAttempt();
    t.clock.advance(182 * DAY);
    runRetention(t.app.deps);
    expect(count('users', `id='${w.anna}'`)).toBe(1);
    t.clock.advance(2 * DAY);
    const r = runRetention(t.app.deps);
    expect(r.accountsDeletedInactive).toBeGreaterThanOrEqual(1);
    expect(count('users', `id='${w.anna}'`)).toBe(0);
    for (const table of [
      'inventory',
      'characters',
      'task_stats_user',
      'level_progress',
      'transactions',
    ])
      expect(count(table, `user_id='${w.anna}'`), table).toBe(0);
    expect(count('users', "role='teacher'")).toBe(2); // teachers are not auto-deleted
  });

  it('removes old online minutes, audit entries and level runs', async () => {
    await anna.post('/api/heartbeat');
    await wrongAttempt();
    const teacher = new Client(t.app);
    await teacher.login('lehrerA', w.password);
    await teacher.post(`/api/teacher/students/${w.ben}/reset-password`);
    t.clock.advance(366 * DAY);
    const r = runRetention(t.app.deps);
    expect(r.activityDeleted).toBe(1);
    expect(r.auditDeleted).toBeGreaterThanOrEqual(1);
    expect(r.runsDeleted).toBe(1);
  });
});

describe('data subject rights', () => {
  it('"Meine Daten" returns all own data without password hashes', async () => {
    await wrongAttempt();
    const data = (await anna.get('/api/me/data')).json();
    expect(data.account.username).toBe('anna');
    expect(data.whoCanSee.teachersOfYourClass).toEqual(['lehrerA']);
    expect(data.taskAttempts).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/argon2|password_hash|passwordHash/);
  });

  it('self-deletion has a grace period and can be cancelled', async () => {
    expect((await anna.post('/api/me/delete-request', { password: 'falsch' })).statusCode).toBe(
      400,
    );
    const r = (await anna.post('/api/me/delete-request', { password: w.password })).json();
    expect(r.deleted).toBe(false);
    expect((await anna.get('/api/auth/me')).json().deletionRequestedFor).toBe(r.executeAt);
    await anna.del('/api/me/delete-request');
    t.clock.advance(8 * DAY);
    await anna.login('anna', w.password, 'AAA-111');
    runRetention(t.app.deps);
    expect(count('users', `id='${w.anna}'`)).toBe(1);
    await anna.post('/api/me/delete-request', { password: w.password });
    t.clock.advance(8 * DAY);
    expect(runRetention(t.app.deps).accountsDeletedOnRequest).toBe(1);
    expect(count('users', `id='${w.anna}'`)).toBe(0);
  });

  it('self-archiving disables the login', async () => {
    await anna.post('/api/me/archive', { password: w.password });
    expect((await new Client(t.app).login('anna', w.password, 'AAA-111')).statusCode).toBe(403);
  });
});
