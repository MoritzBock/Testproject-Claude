import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  DEFAULT_EQUIPMENT,
  ITEMS,
  SKIN_TONES,
  SLOTS,
  STARTER_HAIR,
  STARTER_ITEMS,
  getItem,
  validateEquipment,
  type Equipment,
} from '@pixel/shared';
import type { Deps } from '../deps.js';
import { characters, inventory } from '../db/schema.js';
import { requireReady, requireUser } from '../auth/guards.js';
import { HttpError, conflict, parse } from '../lib/http-error.js';
import { book } from './wallet.js';

export interface GrantResult {
  itemId: string;
  duplicate: boolean;
  converted: number;
}

/**
 * Gives an item to a user. Duplicates are converted into currency automatically.
 * Call inside a transaction together with the action that caused the grant.
 */
export function grantItem(
  deps: Deps,
  userId: string,
  itemId: string,
  source: string,
  ref: string | null,
): GrantResult {
  const item = getItem(itemId);
  if (!item) throw new HttpError(400, 'validation', 'Unbekannter Gegenstand.');
  const owned = deps.db
    .select()
    .from(inventory)
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)))
    .get();
  if (owned) {
    const paid = book(deps, userId, item.value, `duplicate:${itemId}`, ref ? `${ref}:dup` : null);
    return { itemId, duplicate: true, converted: paid ? item.value : 0 };
  }
  deps.db.insert(inventory).values({ userId, itemId, source, acquiredAt: deps.clock.now() }).run();
  return { itemId, duplicate: false, converted: 0 };
}

export function ownedItems(deps: Deps, userId: string, role: string): Set<string> {
  if (role !== 'student') return new Set(ITEMS.map((i) => i.id)); // staff may wear everything
  return new Set(
    deps.db
      .select({ id: inventory.itemId })
      .from(inventory)
      .where(eq(inventory.userId, userId))
      .all()
      .map((r) => r.id),
  );
}

export function getCharacter(deps: Deps, userId: string, role: string) {
  let c = deps.db.select().from(characters).where(eq(characters.userId, userId)).get();
  if (!c && role !== 'student') {
    // Staff get a recognisable default look (teacher badge) on first use.
    const equipped: Equipment = {
      ...DEFAULT_EQUIPMENT,
      accessory: 'acc-badge-teacher',
      back: 'back-wings-teacher',
    };
    deps.db
      .insert(characters)
      .values({
        userId,
        skinTone: 2,
        equipped: JSON.stringify(equipped),
        createdAt: deps.clock.now(),
      })
      .run();
    c = deps.db.select().from(characters).where(eq(characters.userId, userId)).get();
  }
  if (!c) return null;
  return { skinTone: c.skinTone, equipped: JSON.parse(c.equipped) as Equipment };
}

export function registerCharacterRoutes(app: FastifyInstance, deps: Deps): void {
  const { db } = deps;

  app.get('/api/character', async (req) => {
    const u = requireReady(req, deps);
    const c = getCharacter(deps, u.id, u.role);
    const inv =
      u.role === 'student'
        ? db.select().from(inventory).where(eq(inventory.userId, u.id)).all()
        : ITEMS.map((i) => ({ itemId: i.id, source: 'staff', acquiredAt: 0 }));
    return {
      character: c,
      inventory: inv.map((i) => ({ itemId: i.itemId, source: i.source, acquiredAt: i.acquiredAt })),
    };
  });

  /** Character creation at the first login: skin tone + one of the starter hair colours. */
  app.post('/api/character', async (req) => {
    const u = requireUser(req);
    requireReady(req, deps);
    if (db.select().from(characters).where(eq(characters.userId, u.id)).get())
      throw conflict('Charakter existiert bereits.');
    const body = parse(
      z.object({
        skinTone: z
          .number()
          .int()
          .min(0)
          .max(SKIN_TONES.length - 1),
        hair: z.enum(STARTER_HAIR as [string, ...string[]]),
      }),
      req.body,
    );
    db.transaction(() => {
      for (const id of STARTER_ITEMS) grantItem(deps, u.id, id, 'starter', null);
      db.insert(characters)
        .values({
          userId: u.id,
          skinTone: body.skinTone,
          equipped: JSON.stringify({ ...DEFAULT_EQUIPMENT, hair: body.hair }),
          createdAt: deps.clock.now(),
        })
        .run();
    });
    return getCharacter(deps, u.id, u.role);
  });

  app.put('/api/character', async (req) => {
    const u = requireReady(req, deps);
    const current = getCharacter(deps, u.id, u.role);
    if (!current) throw new HttpError(400, 'validation', 'Bitte zuerst einen Charakter erstellen.');
    const body = parse(
      z.object({
        skinTone: z
          .number()
          .int()
          .min(0)
          .max(SKIN_TONES.length - 1)
          .optional(),
        equipped: z.partialRecord(z.enum(SLOTS), z.string().max(64).nullable()).optional(),
      }),
      req.body,
    );
    const equipped: Equipment = { ...current.equipped };
    if (body.equipped) {
      for (const slot of SLOTS) {
        if (!(slot in body.equipped)) continue;
        const v = body.equipped[slot];
        if (v) equipped[slot] = v;
        else delete equipped[slot];
      }
    }
    const err = validateEquipment(equipped, ownedItems(deps, u.id, u.role));
    if (err) throw new HttpError(400, 'validation', err);
    db.update(characters)
      .set({ skinTone: body.skinTone ?? current.skinTone, equipped: JSON.stringify(equipped) })
      .where(eq(characters.userId, u.id))
      .run();
    return getCharacter(deps, u.id, u.role);
  });
}
