import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { FakeClock } from '../lib/clock.js';
import { classTeachers, classes, users } from '../db/schema.js';
import { hashPassword } from '../lib/passwords.js';

export const ORIGIN = 'http://localhost:5173';

export interface TestCtx {
  app: FastifyInstance;
  clock: FakeClock;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestCtx> {
  const clock = new FakeClock();
  const app = await buildApp(loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: ORIGIN, ...env }), {
    clock,
  });
  return { app, clock };
}

/** A logged-in client that keeps its session cookie. */
export class Client {
  cookie = '';
  constructor(private app: FastifyInstance) {}

  async req(method: InjectOptions['method'], url: string, payload?: unknown) {
    const res = await this.app.inject({
      method,
      url,
      payload: payload as InjectOptions['payload'],
      headers: { origin: ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) },
    });
    const set = res.headers['set-cookie'];
    const raw = Array.isArray(set) ? set[0] : set;
    if (raw) {
      const pair = raw.split(';')[0]!;
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    return res;
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body?: unknown) => this.req('POST', url, body ?? {});
  put = (url: string, body?: unknown) => this.req('PUT', url, body ?? {});
  patch = (url: string, body?: unknown) => this.req('PATCH', url, body ?? {});
  del = (url: string, body?: unknown) => this.req('DELETE', url, body ?? {});

  async login(username: string, password: string, classCode?: string, totp?: string) {
    return this.post('/api/auth/login', { username, password, classCode, totp });
  }
}

/** Seeds teacher(s), classes and students with known passwords (no forced change, privacy confirmed). */
export async function seedWorld(app: FastifyInstance, opts: { ready?: boolean } = {}) {
  const { db, clock, cfg } = app.deps;
  const now = clock.now();
  const ready = opts.ready ?? true;
  const pw = await hashPassword('Passwort-123');
  const mk = (
    role: 'student' | 'teacher' | 'superadmin',
    username: string,
    classId: string | null,
  ) => {
    const id = crypto.randomUUID();
    db.insert(users)
      .values({
        id,
        role,
        username,
        usernameKey: username.toLowerCase(),
        classId,
        passwordHash: pw,
        mustChangePassword: !ready,
        privacyAckVersion: ready ? cfg.PRIVACY_VERSION : null,
        lastActiveAt: now,
        createdAt: now,
      })
      .run();
    return id;
  };
  const mkClass = (name: string, code: string, teacherId: string) => {
    const id = crypto.randomUUID();
    db.insert(classes)
      .values({ id, name, schoolYear: '2026/27', joinCode: code, createdAt: now })
      .run();
    db.insert(classTeachers).values({ classId: id, teacherId }).run();
    return id;
  };
  const admin = mk('superadmin', 'admin', null);
  const teacherA = mk('teacher', 'lehrerA', null);
  const teacherB = mk('teacher', 'lehrerB', null);
  const classA = mkClass('Klasse A', 'AAA-111', teacherA);
  const classB = mkClass('Klasse B', 'BBB-222', teacherB);
  const anna = mk('student', 'anna', classA);
  const ben = mk('student', 'ben', classA);
  const bea = mk('student', 'bea', classB);
  return { admin, teacherA, teacherB, classA, classB, anna, ben, bea, password: 'Passwort-123' };
}
