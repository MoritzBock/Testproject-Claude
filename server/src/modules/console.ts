import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { BOXES, BOX_BY_ID, ITEMS, getItem, type PolicyKey } from '@pixel/shared';
import type { Deps } from '../deps.js';
import {
  classes,
  groupMembers,
  groups,
  levelProgress,
  levelRuns,
  pendingBoxes,
  users,
} from '../db/schema.js';
import { requireRole, teacherClassIds } from '../auth/guards.js';
import type { AuthUser } from '../auth/types.js';
import { parse } from '../lib/http-error.js';
import { audit } from '../audit.js';
import { grantItem } from './character.js';
import { setPolicy } from './policies.js';
import { balance, book } from './wallet.js';
import { setLevelOverride, worldStateFor } from './world.js';
import { checkAchievements } from './achievements.js';

/** Console command reference (also used for help and autocompletion). */
export const COMMANDS = [
  {
    name: 'help',
    usage: 'help [befehl]',
    description: 'Zeigt alle Befehle oder die Hilfe zu einem Befehl.',
  },
  { name: 'who', usage: 'who', description: 'Liste der Online-Spielenden deiner Klassen.' },
  {
    name: 'give',
    usage: 'give <spieler> coins <n> | give <spieler> item <item-id>',
    description: 'Bytes oder einen Gegenstand vergeben.',
  },
  {
    name: 'unlock',
    usage: 'unlock <ziel> level <level-id>',
    description: 'Level freigeben (Ziel: Spieler, klasse:NAME, gruppe:NAME, alle).',
  },
  { name: 'lock', usage: 'lock <ziel> level <level-id>', description: 'Level sperren.' },
  {
    name: 'clear',
    usage: 'clear <ziel> level <level-id>',
    description: 'Freigabe/Sperre wieder entfernen.',
  },
  {
    name: 'reset',
    usage: 'reset <spieler> progress | reset <spieler> level <level-id>',
    description: 'Lernfortschritt zurücksetzen (mit --ja bestätigen).',
  },
  {
    name: 'tp',
    usage: 'tp <x> <y> | tp <spieler>',
    description: 'Dich zu Kachel-Koordinaten oder zu einer Person teleportieren.',
  },
  { name: 'summon', usage: 'summon <spieler>', description: 'Eine Person zu dir holen.' },
  {
    name: 'spawnbox',
    usage: 'spawnbox <spieler> <box-id>',
    description: 'Eine Lootbox verschenken.',
  },
  { name: 'freeze', usage: 'freeze <ziel>', description: 'Bewegung und Levelstart anhalten.' },
  { name: 'unfreeze', usage: 'unfreeze <ziel>', description: 'Einfrieren aufheben.' },
  {
    name: 'announce',
    usage: 'announce <text>',
    description: 'Nachricht an alle Online-Spielenden deiner Klassen.',
  },
  { name: 'invisible', usage: 'invisible on|off', description: 'Für Lernende unsichtbar werden.' },
  { name: 'stats', usage: 'stats <spieler>', description: 'Kurzübersicht einer Person.' },
  {
    name: 'set',
    usage: 'set <einstellung> an|aus <ziel>',
    description: 'Funktion schalten: multiplayer, emotes, shop, lootboxen, rangliste.',
  },
] as const;

const POLICY_ALIASES: Record<string, PolicyKey> = {
  multiplayer: 'multiplayer.visible',
  emotes: 'multiplayer.emotes',
  shop: 'economy.shop',
  lootboxen: 'economy.lootboxes',
  rangliste: 'leaderboard.enabled',
};

export interface ConsoleResult {
  ok: boolean;
  output: string[];
  action?: { type: 'teleport'; x: number; y: number } | { type: 'invisible'; on: boolean };
}

/** Splits a command line; supports "quoted values" and klasse:"FIAE 10a". */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /([^\s"]*"[^"]*"[^\s"]*|[^\s"]+)/g;
  for (const m of line.matchAll(re)) out.push(m[0].replace(/"/g, ''));
  return out;
}

class ConsoleError extends Error {}
const fail = (msg: string): never => {
  throw new ConsoleError(msg);
};

type Target =
  | { kind: 'user'; id: string; name: string; classId: string }
  | { kind: 'class'; id: string; name: string }
  | { kind: 'group'; id: string; name: string; memberIds: string[] }
  | { kind: 'all'; classIds: string[] };

export function runCommand(deps: Deps, actor: AuthUser, line: string): ConsoleResult {
  const { db, clock } = deps;
  const classIds = teacherClassIds(deps, actor.id);
  const tokens = tokenize(line.trim());
  const [cmd, ...args] = tokens;
  const confirmed = args.includes('--ja');
  const a = args.filter((x) => x !== '--ja');

  const students = () =>
    classIds.length
      ? db
          .select()
          .from(users)
          .where(and(inArray(users.classId, classIds), eq(users.role, 'student')))
          .all()
      : [];

  const student = (ref: string | undefined) => {
    if (!ref) fail('Bitte eine Person angeben.');
    const [name, code] = ref!.split('@');
    let matches = students().filter((s) => s.usernameKey === name!.toLowerCase());
    if (code) {
      const cls = db.select().from(classes).where(eq(classes.joinCode, code.toUpperCase())).get();
      matches = matches.filter((s) => s.classId === cls?.id);
    }
    if (matches.length === 0) fail(`Keine Person „${ref}“ in deinen Klassen.`);
    if (matches.length > 1) fail(`„${ref}“ ist mehrdeutig – bitte als name@KLASSENCODE angeben.`);
    return matches[0]!;
  };

  const target = (ref: string | undefined): Target => {
    if (!ref) return fail('Bitte ein Ziel angeben (Spieler, klasse:NAME, gruppe:NAME oder alle).');
    if (ref === 'alle') return { kind: 'all', classIds };
    if (ref.startsWith('klasse:')) {
      const name = ref.slice(7).toLowerCase();
      const c = classIds.length
        ? db
            .select()
            .from(classes)
            .where(inArray(classes.id, classIds))
            .all()
            .find((x) => x.name.toLowerCase() === name)
        : undefined;
      return c
        ? { kind: 'class', id: c.id, name: c.name }
        : fail(`Keine eigene Klasse „${ref.slice(7)}“.`);
    }
    if (ref.startsWith('gruppe:')) {
      const name = ref.slice(7).toLowerCase();
      const g = db
        .select()
        .from(groups)
        .where(eq(groups.ownerId, actor.id))
        .all()
        .find((x) => x.name.toLowerCase() === name);
      if (!g) return fail(`Keine eigene Gruppe „${ref.slice(7)}“.`);
      const memberIds = db
        .select({ id: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, g.id))
        .all()
        .map((m) => m.id);
      return { kind: 'group', id: g.id, name: g.name, memberIds };
    }
    const s = student(ref);
    return { kind: 'user', id: s.id, name: s.username, classId: s.classId! };
  };

  /** Scopes for policies/overrides and the affected user ids. */
  const scopesOf = (t: Target) => {
    switch (t.kind) {
      case 'user':
        return {
          scopes: [{ scopeType: 'user' as const, scopeId: t.id }],
          users: [t.id],
          label: t.name,
        };
      case 'class':
        return {
          scopes: [{ scopeType: 'class' as const, scopeId: t.id }],
          users: deps.presence.studentsOf([t.id]),
          label: `Klasse ${t.name}`,
        };
      case 'group':
        return {
          scopes: [{ scopeType: 'group' as const, scopeId: t.id }],
          users: t.memberIds,
          label: `Gruppe ${t.name}`,
        };
      case 'all':
        return {
          scopes: t.classIds.map((id) => ({ scopeType: 'class' as const, scopeId: id })),
          users: deps.presence.studentsOf(t.classIds),
          label: 'alle eigenen Klassen',
        };
    }
  };

  const level = (id: string | undefined) =>
    id && deps.content.levels.has(id) ? id : fail(`Unbekanntes Level „${id ?? ''}“.`);
  const log = (
    action: string,
    t: { userId?: string | null; name?: string; classId?: string | null } = {},
    params: Record<string, unknown> = {},
  ) => audit(deps, actor, `console.${action}`, t, { command: line.slice(0, 300), ...params });

  switch (cmd?.toLowerCase()) {
    case undefined:
      return { ok: true, output: [] };
    case 'help': {
      if (a[0]) {
        const c = COMMANDS.find((x) => x.name === a[0]);
        return c
          ? { ok: true, output: [c.usage, c.description] }
          : fail(`Unbekannter Befehl „${a[0]}“.`);
      }
      return { ok: true, output: COMMANDS.map((c) => `${c.usage.padEnd(48)} ${c.description}`) };
    }
    case 'who': {
      const online = deps.presence.onlineUsers(classIds).filter((u) => u.role === 'student');
      return {
        ok: true,
        output: online.length ? online.map((u) => `● ${u.name}`) : ['Niemand online.'],
      };
    }
    case 'give': {
      const s = student(a[0]);
      if (a[1] === 'coins') {
        const n = Number(a[2]);
        if (!Number.isInteger(n) || n < 1 || n > 10000) fail('Anzahl: ganze Zahl von 1 bis 10000.');
        book(deps, s.id, n, 'teacher:give', null, actor.id);
        log('give', { userId: s.id, name: s.username, classId: s.classId }, { coins: n });
        deps.presence.refresh([s.id], ['wallet']);
        return {
          ok: true,
          output: [`${s.username} erhält ${n} Bytes (Kontostand: ${balance(deps, s.id).balance}).`],
        };
      }
      if (a[1] === 'item') {
        const item = getItem(a[2] ?? '') ?? fail(`Unbekannter Gegenstand „${a[2] ?? ''}“.`);
        const r = db.transaction(() => {
          const g = grantItem(deps, s.id, item.id, `teacher:${actor.username}`, null);
          checkAchievements(deps, s.id);
          return g;
        });
        log('give', { userId: s.id, name: s.username, classId: s.classId }, { item: item.id });
        deps.presence.refresh([s.id], ['character', 'wallet']);
        return {
          ok: true,
          output: [
            r.duplicate
              ? `${s.username} hatte „${item.name}“ schon – umgewandelt in ${r.converted} Bytes.`
              : `${s.username} erhält „${item.name}“.`,
          ],
        };
      }
      return fail('Verwendung: give <spieler> coins <n> | give <spieler> item <item-id>');
    }
    case 'unlock':
    case 'lock':
    case 'clear': {
      const t = target(a[0]);
      if (a[1] !== 'level') fail(`Verwendung: ${cmd} <ziel> level <level-id>`);
      const id = level(a[2]);
      const s = scopesOf(t);
      for (const sc of s.scopes)
        setLevelOverride(
          deps,
          sc,
          id,
          cmd === 'clear' ? null : (cmd as 'unlock' | 'lock'),
          actor.id,
        );
      log(
        cmd,
        {
          userId: t.kind === 'user' ? t.id : null,
          name: s.label,
          classId: t.kind === 'class' ? t.id : null,
        },
        { levelId: id },
      );
      deps.presence.refresh(s.users, ['world']);
      const verb =
        cmd === 'unlock'
          ? 'freigegeben'
          : cmd === 'lock'
            ? 'gesperrt'
            : 'auf Standard zurückgesetzt';
      return { ok: true, output: [`Level ${id} für ${s.label} ${verb}.`] };
    }
    case 'reset': {
      const s = student(a[0]);
      if (a[1] !== 'progress' && a[1] !== 'level')
        fail('Verwendung: reset <spieler> progress | reset <spieler> level <level-id>');
      const levelId = a[1] === 'level' ? level(a[2]) : null;
      if (!confirmed)
        return {
          ok: false,
          output: [
            `Achtung, das kann nicht rückgängig gemacht werden. Zum Bestätigen: ${line.trim()} --ja`,
          ],
        };
      db.transaction(() => {
        const where = levelId
          ? and(eq(levelProgress.userId, s.id), eq(levelProgress.levelId, levelId))
          : eq(levelProgress.userId, s.id);
        db.delete(levelProgress).where(where).run();
        db.delete(levelRuns)
          .where(
            levelId
              ? and(eq(levelRuns.userId, s.id), eq(levelRuns.levelId, levelId))
              : eq(levelRuns.userId, s.id),
          )
          .run();
      });
      log('reset', { userId: s.id, name: s.username, classId: s.classId }, { levelId });
      deps.presence.refresh([s.id], ['world']);
      return {
        ok: true,
        output: [
          `Fortschritt von ${s.username} ${levelId ? `in ${levelId} ` : ''}zurückgesetzt. Bytes und Gegenstände bleiben erhalten.`,
        ],
      };
    }
    case 'tp': {
      if (a.length === 2 && a.every((x) => /^\d+$/.test(x))) {
        const x = Number(a[0]) * 16 + 8;
        const y = Number(a[1]) * 16 + 16;
        return {
          ok: true,
          output: [`Teleport zu ${a[0]}/${a[1]}.`],
          action: { type: 'teleport', x, y },
        };
      }
      const s = student(a[0]);
      const pos =
        deps.presence.positionOf(s.id) ?? fail(`${s.username} ist gerade nicht in der Welt.`);
      return {
        ok: true,
        output: [`Teleport zu ${s.username}.`],
        action: { type: 'teleport', x: pos!.x, y: pos!.y + 4 },
      };
    }
    case 'summon': {
      const s = student(a[0]);
      const me = deps.presence.positionOf(actor.id) ?? fail('Du bist nicht in der Spielwelt.');
      if (!deps.presence.teleport(s.id, me!.x + 16, me!.y)) fail(`${s.username} ist nicht online.`);
      log('summon', { userId: s.id, name: s.username, classId: s.classId });
      return { ok: true, output: [`${s.username} wurde zu dir geholt.`] };
    }
    case 'spawnbox': {
      const s = student(a[0]);
      const box =
        BOX_BY_ID.get(a[1] ?? '') ??
        fail(`Unbekannte Box. Verfügbar: ${BOXES.map((b) => b.id).join(', ')}`);
      db.insert(pendingBoxes).values({ userId: s.id, boxId: box.id, createdAt: clock.now() }).run();
      log('spawnbox', { userId: s.id, name: s.username, classId: s.classId }, { box: box.id });
      return {
        ok: true,
        output: [`${s.username} hat eine ${box.name} geschenkt bekommen (im Shop zu öffnen).`],
      };
    }
    case 'freeze':
    case 'unfreeze': {
      const t = target(a[0]);
      const s = scopesOf(t);
      for (const sc of s.scopes)
        setPolicy(deps, sc, 'frozen', cmd === 'freeze' ? true : null, actor);
      log(cmd, {
        userId: t.kind === 'user' ? t.id : null,
        name: s.label,
        classId: t.kind === 'class' ? t.id : null,
      });
      deps.presence.refresh(s.users, ['policies']);
      return {
        ok: true,
        output: [`${s.label}: ${cmd === 'freeze' ? 'eingefroren' : 'wieder freigegeben'}.`],
      };
    }
    case 'announce': {
      const text = line.trim().slice(cmd!.length).trim();
      if (!text || text.length > 200) fail('Text: 1–200 Zeichen.');
      const n = deps.presence.announce(classIds, text, actor.username);
      log('announce', {}, { length: text.length });
      return { ok: true, output: [`Nachricht an ${n} Online-Spielende gesendet.`] };
    }
    case 'invisible': {
      if (a[0] !== 'on' && a[0] !== 'off') fail('Verwendung: invisible on|off');
      deps.presence.setInvisible(actor.id, a[0] === 'on');
      log('invisible', {}, { on: a[0] === 'on' });
      return {
        ok: true,
        output: [a[0] === 'on' ? 'Du bist jetzt unsichtbar.' : 'Du bist wieder sichtbar.'],
        action: { type: 'invisible', on: a[0] === 'on' },
      };
    }
    case 'stats': {
      const s = student(a[0]);
      const w = worldStateFor(deps, { id: s.id, role: 'student' });
      const done = Object.values(w.levels).filter((l) => l.status === 'completed').length;
      return {
        ok: true,
        output: [
          `${s.username} (${s.status === 'active' ? 'aktiv' : s.status})`,
          `Level abgeschlossen: ${done}/${Object.keys(w.levels).length} · Sterne: ${w.starsTotal}`,
          `Bytes: ${balance(deps, s.id).balance} · Online: ${deps.presence.isOnline(s.id) ? 'ja' : 'nein'}`,
          `Letzte Aktivität: ${new Date(s.lastActiveAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
        ],
      };
    }
    case 'set': {
      const key =
        POLICY_ALIASES[a[0] ?? ''] ??
        fail(`Einstellung: ${Object.keys(POLICY_ALIASES).join(', ')}`);
      const v = (a[1] ?? '').toLowerCase();
      const value = ['an', 'on', 'true', 'ja'].includes(v)
        ? true
        : ['aus', 'off', 'false', 'nein'].includes(v)
          ? false
          : fail('Wert: an oder aus');
      const t = target(a[2]);
      const s = scopesOf(t);
      for (const sc of s.scopes) setPolicy(deps, sc, key, value, actor);
      log(
        'set',
        {
          userId: t.kind === 'user' ? t.id : null,
          name: s.label,
          classId: t.kind === 'class' ? t.id : null,
        },
        { key, value },
      );
      deps.presence.refresh(s.users, ['policies']);
      return { ok: true, output: [`${a[0]} für ${s.label}: ${value ? 'an' : 'aus'}.`] };
    }
    default:
      return fail(`Unbekannter Befehl „${cmd}“. Tippe help.`);
  }
}

export function registerConsoleRoutes(app: FastifyInstance, deps: Deps): void {
  app.post(
    '/api/teacher/console',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const u = requireRole(req, deps, 'teacher');
      const { command } = parse(z.object({ command: z.string().max(500) }), req.body);
      try {
        return runCommand(deps, u, command);
      } catch (e) {
        if (e instanceof ConsoleError)
          return { ok: false, output: [e.message] } satisfies ConsoleResult;
        throw e;
      }
    },
  );

  /** Data for autocompletion (own classes only). */
  app.get('/api/teacher/console/meta', async (req) => {
    const u = requireRole(req, deps, 'teacher');
    const ids = teacherClassIds(deps, u.id);
    const cls = ids.length
      ? deps.db.select().from(classes).where(inArray(classes.id, ids)).all()
      : [];
    return {
      commands: COMMANDS,
      players: ids.length
        ? deps.db
            .select({ n: users.username })
            .from(users)
            .where(and(inArray(users.classId, ids), eq(users.role, 'student')))
            .all()
            .map((r) => r.n)
        : [],
      classes: cls.map((c) => c.name),
      groups: deps.db
        .select({ n: groups.name })
        .from(groups)
        .where(eq(groups.ownerId, u.id))
        .all()
        .map((g) => g.n),
      levels: deps.content.levelList.map((l) => l.id),
      items: ITEMS.map((i) => i.id),
      boxes: BOXES.map((b) => b.id),
      settings: Object.keys(POLICY_ALIASES),
    };
  });
}
