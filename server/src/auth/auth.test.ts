import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as OTPAuth from 'otpauth';
import { Client, createTestApp, seedWorld, type TestCtx } from '../test/helpers.js';
import { MINUTE } from '../lib/clock.js';

let t: TestCtx;
let w: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  t = await createTestApp();
  w = await seedWorld(t.app);
});
afterEach(() => t.app.close());

describe('login', () => {
  it('students log in with class code, pseudonym and password', async () => {
    const c = new Client(t.app);
    const res = await c.login('Anna', w.password, 'aaa-111');
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe('anna');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/__Host-sid=/);
    expect((await c.get('/api/auth/me')).json().role).toBe('student');
  });

  it('wrong class code or password gives the same generic error', async () => {
    const c = new Client(t.app);
    const a = await c.login('anna', w.password, 'BBB-222');
    const b = await c.login('anna', 'falsch-falsch', 'AAA-111');
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().message).toBe(b.json().message);
  });

  it('staff log in without class code; students cannot log in as staff', async () => {
    const c = new Client(t.app);
    expect((await c.login('lehrerA', w.password)).statusCode).toBe(200);
    expect((await new Client(t.app).login('anna', w.password)).statusCode).toBe(401);
  });

  it('locks the account temporarily after repeated failures', async () => {
    const c = new Client(t.app);
    for (let i = 0; i < 5; i++) await c.login('anna', 'falsch-falsch', 'AAA-111');
    const locked = await c.login('anna', w.password, 'AAA-111');
    expect(locked.statusCode).toBe(423);
    t.clock.advance(16 * MINUTE);
    expect((await c.login('anna', w.password, 'AAA-111')).statusCode).toBe(200);
  });

  it('never stores the plain password', async () => {
    const rows = t.app.deps.sqlite.prepare('select password_hash from users').all() as Array<{
      password_hash: string;
    }>;
    for (const r of rows) {
      expect(r.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(r.password_hash).not.toContain(w.password);
    }
  });

  it('logout invalidates the session server-side', async () => {
    const c = new Client(t.app);
    await c.login('anna', w.password, 'AAA-111');
    const cookie = c.cookie;
    await c.post('/api/auth/logout');
    const stale = new Client(t.app);
    stale.cookie = cookie;
    expect((await stale.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('sessions expire after idle time', async () => {
    const c = new Client(t.app);
    await c.login('anna', w.password, 'AAA-111');
    t.clock.advance(121 * MINUTE);
    expect((await c.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('rejects state-changing requests from a foreign origin (CSRF)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'anna', password: w.password, classCode: 'AAA-111' },
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('first steps', () => {
  it('requires a password change and the privacy notice before using the game', async () => {
    const t2 = await createTestApp();
    const w2 = await seedWorld(t2.app, { ready: false });
    const c = new Client(t2.app);
    const me = (await c.login('anna', w2.password, 'AAA-111')).json();
    expect(me.mustChangePassword).toBe(true);
    expect(me.privacyAckRequired).toBe(true);
    expect((await c.get('/api/policies/me')).json().error).toBe('password_change_required');
    const short = await c.post('/api/auth/change-password', {
      currentPassword: w2.password,
      newPassword: 'kurz',
    });
    expect(short.statusCode).toBe(400);
    const ok = await c.post('/api/auth/change-password', {
      currentPassword: w2.password,
      newPassword: 'Ein-neues-Passwort',
    });
    expect(ok.json().mustChangePassword).toBe(false);
    expect((await c.get('/api/policies/me')).json().error).toBe('privacy_ack_required');
    await c.post('/api/auth/privacy-ack', { version: 1 });
    expect((await c.get('/api/policies/me')).statusCode).toBe(200);
    await t2.app.close();
  });
});

describe('two-factor authentication', () => {
  it('teachers can enable TOTP; login then requires the code', async () => {
    const c = new Client(t.app);
    await c.login('lehrerA', w.password);
    const setup = (await c.post('/api/auth/totp/setup')).json();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.secret) });
    const code = totp.generate({ timestamp: Date.now() });
    expect((await c.post('/api/auth/totp/enable', { code })).json().totpEnabled).toBe(true);
    // secret is stored encrypted, not in plain text
    const row = t.app.deps.sqlite
      .prepare("select totp_secret_enc s from users where username='lehrerA'")
      .get() as { s: string };
    expect(row.s).not.toContain(setup.secret);

    const c2 = new Client(t.app);
    expect((await c2.login('lehrerA', w.password)).json().error).toBe('totp_required');
    expect((await c2.login('lehrerA', w.password, undefined, totp.generate())).statusCode).toBe(
      200,
    );
  });

  it('students cannot set up TOTP', async () => {
    const c = new Client(t.app);
    await c.login('anna', w.password, 'AAA-111');
    expect((await c.post('/api/auth/totp/setup')).statusCode).toBe(403);
  });
});

describe('setup', () => {
  it('creates the superadmin only with the one-time token', async () => {
    const t3 = await createTestApp({ SETUP_TOKEN: 'ein-sehr-geheimes-token' });
    const { prepareSetupToken } = await import('./routes.js');
    prepareSetupToken(t3.app.deps);
    const c = new Client(t3.app);
    expect((await c.get('/api/setup/status')).json().needsSetup).toBe(true);
    const bad = await c.post('/api/setup', {
      token: 'falsch',
      username: 'chef',
      password: 'Chef-Passwort-1',
    });
    expect(bad.statusCode).toBe(403);
    const ok = await c.post('/api/setup', {
      token: 'ein-sehr-geheimes-token',
      username: 'chef',
      password: 'Chef-Passwort-1',
    });
    expect(ok.json().role).toBe('superadmin');
    const again = await new Client(t3.app).post('/api/setup', {
      token: 'ein-sehr-geheimes-token',
      username: 'chef2',
      password: 'Chef-Passwort-1',
    });
    expect(again.statusCode).toBe(403);
    await t3.app.close();
  });
});
