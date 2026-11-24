import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import {
  EMOTES,
  type ClientEvents,
  type PolicyMap,
  type PresencePlayer,
  type ServerEvents,
} from '@pixel/shared';
import type { Deps } from '../deps.js';
import { cookieName, resolveSession } from '../auth/session.js';
import { teacherClassIds } from '../auth/guards.js';
import { users } from '../db/schema.js';
import { effectivePolicies } from '../modules/policies.js';
import { getCharacter } from '../modules/character.js';

interface Conn {
  socket: Socket;
  userId: string;
  name: string;
  role: 'student' | 'teacher' | 'superadmin';
  classIds: string[];
  x: number;
  y: number;
  frame: number;
  invisible: boolean;
  emote?: { id: (typeof EMOTES)[number]['id']; at: number };
  policies: PolicyMap;
  appearance: PresencePlayer['appearance'];
  bucket: number;
}

/**
 * Live presence in the hub world. Positions exist ONLY in memory and are never stored.
 * Students see classmates only if the teacher enabled it; teachers see their classes.
 */
export class Presence {
  private io: Server | null = null;
  private conns = new Map<string, Conn>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private deps: Deps) {}

  attach(app: FastifyInstance): void {
    const { cfg } = this.deps;
    this.io = new Server(app.server, {
      path: '/socket.io',
      serveClient: false,
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 4096,
      allowRequest: (req, cb) => {
        const origin = req.headers.origin;
        let ok: boolean;
        try {
          ok = !origin || origin === cfg.PUBLIC_ORIGIN || new URL(origin).host === req.headers.host;
        } catch {
          ok = false;
        }
        cb(null, ok);
      },
    });
    this.io.use((socket, next) => {
      const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '');
      const s = resolveSession(this.deps, cookies[cookieName(this.deps)]);
      if (
        !s ||
        s.user.mustChangePassword ||
        (s.user.privacyAckVersion ?? 0) < cfg.PRIVACY_VERSION ||
        s.user.role === 'superadmin'
      )
        return next(new Error('unauthorized'));
      socket.data.user = s.user;
      next();
    });
    this.io.on('connection', (socket) => this.onConnect(socket));
    this.timer = setInterval(() => this.tick(), 200);
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const c of this.conns.values()) c.socket.disconnect(true);
    this.conns.clear();
    await new Promise<void>((r) => (this.io ? this.io.close(() => r()) : r()));
    this.io = null;
  }

  private onConnect(socket: Socket): void {
    const u = socket.data.user as {
      id: string;
      username: string;
      role: Conn['role'];
      classId: string | null;
    };
    const classIds =
      u.role === 'teacher' ? teacherClassIds(this.deps, u.id) : u.classId ? [u.classId] : [];
    const conn: Conn = {
      socket,
      userId: u.id,
      name: u.username,
      role: u.role,
      classIds,
      x: -1,
      y: -1,
      frame: 0,
      invisible: false,
      policies: effectivePolicies(this.deps, u.id),
      appearance: getCharacter(this.deps, u.id, u.role),
      bucket: 20,
    };
    this.conns.set(socket.id, conn);
    socket.emit('frozen', { frozen: conn.policies.frozen } satisfies ServerEvents['frozen']);

    socket.on('move', (m: ClientEvents['move']) => {
      if (!this.allow(conn) || !m || typeof m.x !== 'number' || typeof m.y !== 'number') return;
      if (conn.policies.frozen) return;
      conn.x = Math.max(0, Math.min(5000, Math.round(m.x)));
      conn.y = Math.max(0, Math.min(5000, Math.round(m.y)));
      conn.frame = Number.isInteger(m.frame) ? Math.max(0, Math.min(15, m.frame)) : 0;
    });
    socket.on('emote', (e: ClientEvents['emote']) => {
      if (!this.allow(conn) || !EMOTES.some((x) => x.id === e?.id)) return;
      if (conn.role === 'student' && !conn.policies['multiplayer.emotes']) return;
      conn.emote = { id: e.id, at: this.deps.clock.now() };
    });
    socket.on('disconnect', () => this.conns.delete(socket.id));
  }

  /** Simple rate limit: ~20 events/s per socket. */
  private allow(c: Conn): boolean {
    c.bucket = Math.min(40, c.bucket + 1);
    if (c.bucket <= 0) return false;
    c.bucket -= 2;
    return true;
  }

  private visibleTo(viewer: Conn, other: Conn): boolean {
    if (viewer === other || other.x < 0) return false;
    if (!viewer.classIds.some((id) => other.classIds.includes(id))) return false;
    if (viewer.role === 'teacher') return true;
    if (other.role === 'teacher') return !other.invisible;
    return viewer.policies['multiplayer.visible'] && other.policies['multiplayer.visible'];
  }

  private tick(): void {
    const now = this.deps.clock.now();
    const all = [...this.conns.values()];
    for (const viewer of all) {
      viewer.bucket = Math.min(40, viewer.bucket + 4);
      const players: PresencePlayer[] = all
        .filter((o) => this.visibleTo(viewer, o))
        .map((o) => ({
          id: o.userId,
          name: o.name,
          teacher: o.role === 'teacher',
          appearance: o.appearance,
          x: o.x,
          y: o.y,
          frame: o.frame,
          ...(o.emote && now - o.emote.at < 4000 ? { emote: o.emote } : {}),
        }));
      viewer.socket.volatile.emit('presence', { players });
    }
  }

  // --- API used by routes / console ------------------------------------------------------
  private connsOf(userId: string) {
    return [...this.conns.values()].filter((c) => c.userId === userId);
  }

  isOnline(userId: string): boolean {
    return this.connsOf(userId).length > 0;
  }

  onlineUsers(classIds: string[]): Array<{ userId: string; name: string; role: string }> {
    const seen = new Map<string, { userId: string; name: string; role: string }>();
    for (const c of this.conns.values())
      if (c.classIds.some((id) => classIds.includes(id)))
        seen.set(c.userId, { userId: c.userId, name: c.name, role: c.role });
    return [...seen.values()];
  }

  positionOf(userId: string): { x: number; y: number } | null {
    const c = this.connsOf(userId).find((x) => x.x >= 0);
    return c ? { x: c.x, y: c.y } : null;
  }

  teleport(userId: string, x: number, y: number): boolean {
    const cs = this.connsOf(userId);
    for (const c of cs) {
      c.x = x;
      c.y = y;
      c.socket.emit('teleport', { x, y });
    }
    return cs.length > 0;
  }

  setInvisible(userId: string, on: boolean): void {
    for (const c of this.connsOf(userId)) c.invisible = on;
  }

  announce(classIds: string[], text: string, from: string): number {
    let n = 0;
    for (const c of this.conns.values())
      if (c.role === 'student' && c.classIds.some((id) => classIds.includes(id))) {
        c.socket.emit('announce', { text, from });
        n++;
      }
    return n;
  }

  /** Re-reads policies/appearance and tells clients to refresh data. */
  refresh(userIds: string[] | 'all', what: ServerEvents['refresh']['what']): void {
    for (const c of this.conns.values()) {
      if (userIds !== 'all' && !userIds.includes(c.userId)) continue;
      const wasFrozen = c.policies.frozen;
      c.policies = effectivePolicies(this.deps, c.userId);
      c.appearance = getCharacter(this.deps, c.userId, c.role);
      if (wasFrozen !== c.policies.frozen) c.socket.emit('frozen', { frozen: c.policies.frozen });
      c.socket.emit('refresh', { what });
    }
  }

  kick(userId: string, reason: string): void {
    for (const c of this.connsOf(userId)) {
      c.socket.emit('kicked', { reason });
      c.socket.disconnect(true);
    }
  }

  /** Students of the given classes (for refreshing after class-wide changes). */
  studentsOf(classIds: string[]): string[] {
    return classIds.flatMap((cid) =>
      this.deps.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.classId, cid))
        .all()
        .map((r) => r.id),
    );
  }
}
