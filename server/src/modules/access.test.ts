import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, seedWorld, type TestCtx } from '../test/helpers.js';

let t: TestCtx;
let w: Awaited<ReturnType<typeof seedWorld>>;
let teacherA: Client;
let teacherB: Client;
let anna: Client;
let admin: Client;

beforeEach(async () => {
  t = await createTestApp();
  w = await seedWorld(t.app);
  teacherA = new Client(t.app);
  teacherB = new Client(t.app);
  anna = new Client(t.app);
  admin = new Client(t.app);
  await teacherA.login('lehrerA', w.password);
  await teacherB.login('lehrerB', w.password);
  await anna.login('anna', w.password, 'AAA-111');
  await admin.login('admin', w.password);
});
afterEach(() => t.app.close());

describe('role and class based access control', () => {
  it('teachers only see their own classes', async () => {
    const list = (await teacherA.get('/api/teacher/classes')).json();
    expect(list.map((c: { name: string }) => c.name)).toEqual(['Klasse A']);
  });

  it('teachers cannot touch students or classes of other teachers', async () => {
    expect((await teacherB.post(`/api/teacher/students/${w.anna}/reset-password`)).statusCode).toBe(
      404,
    );
    expect(
      (await teacherB.patch(`/api/teacher/students/${w.anna}`, { status: 'locked' })).statusCode,
    ).toBe(404);
    expect((await teacherB.del(`/api/teacher/students/${w.anna}`)).statusCode).toBe(404);
    expect(
      (
        await teacherB.post(`/api/teacher/classes/${w.classA}/students`, {
          count: 1,
          mode: 'random',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await teacherB.patch(`/api/teacher/classes/${w.classA}`, { archived: true })).statusCode,
    ).toBe(404);
  });

  it('students cannot use teacher or admin endpoints', async () => {
    expect((await anna.get('/api/teacher/classes')).statusCode).toBe(403);
    expect((await anna.post(`/api/teacher/students/${w.ben}/reset-password`)).statusCode).toBe(403);
    expect((await anna.get('/api/admin/teachers')).statusCode).toBe(403);
  });

  it('the superadmin manages teachers but not classes or learners', async () => {
    expect((await admin.get('/api/admin/teachers')).statusCode).toBe(200);
    expect((await admin.get('/api/teacher/classes')).statusCode).toBe(403);
    expect((await admin.post(`/api/teacher/students/${w.anna}/reset-password`)).statusCode).toBe(
      403,
    );
  });

  it('unauthenticated requests are rejected', async () => {
    expect((await new Client(t.app).get('/api/teacher/classes')).statusCode).toBe(401);
  });
});

describe('class management', () => {
  it('bulk-creates accounts with printable start passwords (hashed in the DB)', async () => {
    const res = await teacherA.post(`/api/teacher/classes/${w.classA}/students`, {
      count: 3,
      mode: 'prefix',
      prefix: 'fiae',
    });
    const body = res.json();
    expect(body.accounts.map((a: { username: string }) => a.username)).toEqual([
      'fiae01',
      'fiae02',
      'fiae03',
    ]);
    expect(body.accounts[0].startPassword.length).toBeGreaterThanOrEqual(10);
    const login = await new Client(t.app).login(
      'fiae01',
      body.accounts[0].startPassword,
      'AAA-111',
    );
    expect(login.json().mustChangePassword).toBe(true);
  });

  it('password reset forces a new password and ends sessions', async () => {
    const res = (await teacherA.post(`/api/teacher/students/${w.anna}/reset-password`)).json();
    expect((await anna.get('/api/auth/me')).statusCode).toBe(401);
    const c = new Client(t.app);
    expect((await c.login('anna', res.startPassword, 'AAA-111')).json().mustChangePassword).toBe(
      true,
    );
  });

  it('locking an account blocks login', async () => {
    await teacherA.patch(`/api/teacher/students/${w.anna}`, { status: 'locked' });
    expect((await new Client(t.app).login('anna', w.password, 'AAA-111')).statusCode).toBe(403);
  });

  it('deleting a class requires its name and removes all accounts', async () => {
    expect(
      (await teacherA.del(`/api/teacher/classes/${w.classA}`, { confirmName: 'falsch' }))
        .statusCode,
    ).toBe(400);
    const ok = await teacherA.del(`/api/teacher/classes/${w.classA}`, { confirmName: 'Klasse A' });
    expect(ok.json().deletedAccounts).toBe(2);
    const left = t.app.deps.sqlite
      .prepare('select count(*) n from users where class_id is not null')
      .get() as { n: number };
    expect(left.n).toBe(1); // only bea in class B
  });

  it('teacher notes are limited to 200 characters', async () => {
    expect(
      (await teacherA.put(`/api/teacher/students/${w.anna}/note`, { text: 'x'.repeat(201) }))
        .statusCode,
    ).toBe(400);
    expect(
      (await teacherA.put(`/api/teacher/students/${w.anna}/note`, { text: 'Sitzplatz 4' }))
        .statusCode,
    ).toBe(200);
  });

  it('every admin action is audited', async () => {
    await teacherA.post(`/api/teacher/students/${w.anna}/reset-password`);
    const row = t.app.deps.sqlite
      .prepare("select * from audit_log where action='student.resetPassword'")
      .get() as {
      actor_name: string;
      target_name: string;
    };
    expect(row.actor_name).toBe('lehrerA');
    expect(row.target_name).toBe('anna');
  });
});

describe('policies', () => {
  it('teacher sets switches for one learner, a group and the class – resolved per learner', async () => {
    const g = (await teacherA.post('/api/teacher/groups', { name: 'FISI' })).json();
    await teacherA.put(`/api/teacher/groups/${g.id}/members`, { userIds: [w.anna] });
    await teacherA.post('/api/teacher/policies', {
      targets: [{ scopeType: 'class', scopeId: w.classA }],
      key: 'multiplayer.visible',
      value: true,
    });
    await teacherA.post('/api/teacher/policies', {
      targets: [{ scopeType: 'group', scopeId: g.id }],
      key: 'multiplayer.visible',
      value: false,
    });
    expect((await anna.get('/api/policies/me')).json()['multiplayer.visible']).toBe(false);
    const ben = new Client(t.app);
    await ben.login('ben', w.password, 'AAA-111');
    expect((await ben.get('/api/policies/me')).json()['multiplayer.visible']).toBe(true);
    await teacherA.post('/api/teacher/policies', {
      targets: [{ scopeType: 'user', scopeId: w.anna }],
      key: 'multiplayer.visible',
      value: true,
    });
    expect((await anna.get('/api/policies/me')).json()['multiplayer.visible']).toBe(true);
  });

  it('teachers cannot set policies for foreign scopes or globally', async () => {
    expect(
      (
        await teacherA.post('/api/teacher/policies', {
          targets: [{ scopeType: 'user', scopeId: w.bea }],
          key: 'economy.lootboxes',
          value: true,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await teacherA.post('/api/teacher/policies', {
          targets: [{ scopeType: 'global', scopeId: '*' }],
          key: 'economy.lootboxes',
          value: true,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('only own students can be added to groups', async () => {
    const g = (await teacherA.post('/api/teacher/groups', { name: 'Mix' })).json();
    expect(
      (await teacherA.put(`/api/teacher/groups/${g.id}/members`, { userIds: [w.bea] })).statusCode,
    ).toBe(404);
  });
});

describe('settings per account', () => {
  it('stores validated settings', async () => {
    const s = (await anna.get('/api/me/settings')).json();
    s.audio.master = 0.2;
    expect((await anna.put('/api/me/settings', s)).json().audio.master).toBe(0.2);
    expect((await anna.get('/api/me/settings')).json().audio.master).toBe(0.2);
  });
});
