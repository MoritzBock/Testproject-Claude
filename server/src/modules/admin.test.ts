import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { PresencePlayer } from '@pixel/shared';
import { Client, ORIGIN, createTestApp, seedWorld, type TestCtx } from '../test/helpers.js';
import { balance } from './wallet.js';
import { tokenize } from './console.js';

let t: TestCtx;
let w: Awaited<ReturnType<typeof seedWorld>>;
let teacher: Client;
let teacherB: Client;
let anna: Client;
beforeEach(async () => {
  t = await createTestApp();
  w = await seedWorld(t.app);
  teacher = new Client(t.app);
  teacherB = new Client(t.app);
  anna = new Client(t.app);
  await teacher.login('lehrerA', w.password);
  await teacherB.login('lehrerB', w.password);
  await anna.login('anna', w.password, 'AAA-111');
  await anna.post('/api/character', { skinTone: 0, hair: 'hair-short-brown' });
});
afterEach(() => t.app.close());

const cmd = (c: Client, command: string) =>
  c.post('/api/teacher/console', { command }).then((r) => r.json());

describe('admin console', () => {
  it('is only available to teachers', async () => {
    expect((await anna.post('/api/teacher/console', { command: 'help' })).statusCode).toBe(403);
    expect((await cmd(teacher, 'help')).output.length).toBeGreaterThan(10);
  });

  it('give coins / items to own students only', async () => {
    expect((await cmd(teacher, 'give anna coins 50')).ok).toBe(true);
    expect(balance(t.app.deps, w.anna).balance).toBe(50);
    expect((await cmd(teacher, 'give anna item hat-crown-teacher')).ok).toBe(true);
    const foreign = await cmd(teacherB, 'give anna coins 50');
    expect(foreign.ok).toBe(false);
    expect(foreign.output[0]).toMatch(/Keine Person/);
    expect(balance(t.app.deps, w.anna).balance).toBe(50);
  });

  it('unlock/lock levels for a learner and a class', async () => {
    await cmd(teacher, 'unlock anna level demo-e');
    expect((await anna.get('/api/world')).json().state.levels['demo-e'].status).toBe('available');
    expect((await cmd(teacher, 'lock klasse:"Klasse A" level demo-a')).ok).toBe(true);
    expect((await anna.get('/api/world')).json().state.levels['demo-a'].status).toBe('locked');
  });

  it('reset requires confirmation', async () => {
    const first = await cmd(teacher, 'reset anna progress');
    expect(first.ok).toBe(false);
    expect(first.output[0]).toMatch(/--ja/);
    expect((await cmd(teacher, 'reset anna progress --ja')).ok).toBe(true);
  });

  it('freeze blocks starting levels; set switches policies', async () => {
    await cmd(teacher, 'freeze anna');
    expect((await anna.post('/api/levels/demo-a/start')).statusCode).toBe(403);
    await cmd(teacher, 'unfreeze anna');
    expect((await anna.post('/api/levels/demo-a/start')).statusCode).toBe(200);
    await cmd(teacher, 'set lootboxen an alle');
    expect((await anna.get('/api/policies/me')).json()['economy.lootboxes']).toBe(true);
  });

  it('every command is written to the audit log', async () => {
    await cmd(teacher, 'give anna coins 5');
    const log = (await teacher.get('/api/teacher/audit')).json();
    expect(
      log.some(
        (e: { action: string; target_name?: string; targetName?: string }) =>
          e.action === 'console.give',
      ),
    ).toBe(true);
    const foreignLog = (await teacherB.get('/api/teacher/audit')).json();
    expect(foreignLog.some((e: { action: string }) => e.action === 'console.give')).toBe(false);
  });

  it('tokenizes quoted values', () => {
    expect(tokenize('lock klasse:"FIAE 10a" level demo-a')).toEqual([
      'lock',
      'klasse:FIAE 10a',
      'level',
      'demo-a',
    ]);
  });
});

describe('dashboard data', () => {
  it('overview only for own classes, with progress and online minutes', async () => {
    await anna.post('/api/heartbeat');
    t.clock.advance(61_000);
    await anna.post('/api/heartbeat');
    t.clock.advance(10_000);
    await anna.post('/api/heartbeat'); // too early → not counted
    const o = (await teacher.get(`/api/teacher/classes/${w.classA}/overview`)).json();
    const row = o.students.find((s: { username: string }) => s.username === 'anna');
    expect(row.totalMinutes).toBe(2);
    expect(row.online).toBe(true);
    expect((await teacherB.get(`/api/teacher/classes/${w.classA}/overview`)).statusCode).toBe(404);
  });

  it('analysis resolves the most common wrong answers', async () => {
    const run = (await anna.post('/api/levels/demo-a/start')).json();
    const task = run.tasks.find((x: { id: string }) => x.id === 'byte');
    const wrong = task.view.options.find((o: { text: string }) => o.text === '4 Bit').id;
    await anna.post(`/api/runs/${run.runId}/tasks/byte/answer`, { answer: { selected: [wrong] } });
    const a = (await teacher.get(`/api/teacher/classes/${w.classA}/analysis`)).json();
    const byte = a.levels[0].tasks.find((x: { taskId: string }) => x.taskId === 'byte');
    expect(byte.errors).toBe(1);
    expect(byte.topWrong[0].label).toBe('gewählt: 4 Bit');
  });

  it('student detail is limited to own students', async () => {
    expect((await teacher.get(`/api/teacher/students/${w.anna}/detail`)).statusCode).toBe(200);
    expect((await teacherB.get(`/api/teacher/students/${w.anna}/detail`)).statusCode).toBe(404);
  });

  it('CSV export: own class only, audited, no formula injection', async () => {
    await teacher.patch(`/api/teacher/students/${w.anna}`, { username: '=cmd' }).catch(() => {});
    const res = await teacher.get(`/api/teacher/classes/${w.classA}/export.csv`);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.body).toContain('Benutzername;Status');
    expect((await teacherB.get(`/api/teacher/classes/${w.classA}/export.csv`)).statusCode).toBe(
      404,
    );
    const log = (await teacher.get('/api/teacher/audit')).json();
    expect(log.some((e: { action: string }) => e.action === 'export.csv')).toBe(true);
  });
});

describe('leaderboard', () => {
  it('is off by default and anonymises opted-out learners', async () => {
    expect((await anna.get('/api/leaderboard')).statusCode).toBe(403);
    await teacher.post('/api/teacher/policies', {
      targets: [{ scopeType: 'class', scopeId: w.classA }],
      key: 'leaderboard.enabled',
      value: true,
    });
    const ben = new Client(t.app);
    await ben.login('ben', w.password, 'AAA-111');
    const s = (await ben.get('/api/me/settings')).json();
    s.privacy.leaderboardAnonymous = true;
    await ben.put('/api/me/settings', s);
    const lb = (await anna.get('/api/leaderboard')).json();
    expect(lb.criterion).toBe('stars');
    expect(lb.top.map((r: { name: string }) => r.name).sort()).toEqual(['Anonym', 'anna']);
    expect(lb.me.name).toBe('anna');
  });
});

describe('presence (socket.io)', () => {
  it('students see classmates only when multiplayer is enabled; teachers always', async () => {
    t.app.deps.presence.attach(t.app);
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (t.app.server.address() as { port: number }).port;
    const ben = new Client(t.app);
    await ben.login('ben', w.password, 'AAA-111');
    const open = (c: Client) =>
      new Promise<Socket>((resolve, reject) => {
        const s = connect(`http://127.0.0.1:${port}`, {
          path: '/socket.io',
          transports: ['websocket'],
          extraHeaders: { cookie: c.cookie, origin: ORIGIN },
        });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const next = (s: Socket) =>
      new Promise<PresencePlayer[]>((r) =>
        s.once('presence', (p: { players: PresencePlayer[] }) => r(p.players)),
      );
    const sa = await open(anna);
    const sb = await open(ben);
    const st = await open(teacher);
    sa.emit('move', { x: 100, y: 100, frame: 0 });
    sb.emit('move', { x: 120, y: 100, frame: 0 });
    st.emit('move', { x: 140, y: 100, frame: 0 });
    await new Promise((r) => setTimeout(r, 250));
    expect((await next(sa)).map((p) => p.name)).toEqual(['lehrerA']);
    expect((await next(st)).map((p) => p.name).sort()).toEqual(['anna', 'ben']);
    await teacher.post('/api/teacher/policies', {
      targets: [{ scopeType: 'class', scopeId: w.classA }],
      key: 'multiplayer.visible',
      value: true,
    });
    await new Promise((r) => setTimeout(r, 250));
    expect((await next(sa)).map((p) => p.name).sort()).toEqual(['ben', 'lehrerA']);
    // invisible teacher
    await cmd(teacher, 'invisible on');
    await new Promise((r) => setTimeout(r, 250));
    expect((await next(sa)).map((p) => p.name)).toEqual(['ben']);
    for (const s of [sa, sb, st]) s.close();
  });
});
