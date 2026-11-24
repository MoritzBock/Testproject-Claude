import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  BOXES,
  BOX_BY_ID,
  boxPool,
  dropChances,
  getItem,
  shopItemsForDay,
  shopPrice,
} from '@pixel/shared';
import type { Deps } from '../deps.js';
import { inventory, lootboxPity, pendingBoxes, transactions } from '../db/schema.js';
import { requireReady } from '../auth/guards.js';
import { HttpError, notFound, parse } from '../lib/http-error.js';
import { dayKey } from '../lib/clock.js';
import { grantItem } from './character.js';
import { effectivePolicies } from './policies.js';
import { balance, book } from './wallet.js';
import { drawBox, nextPityCounter } from './lootbox.js';
import { checkAchievements } from './achievements.js';

/** Randomness for draws – replaceable in tests. Uses the CSPRNG by default. */
export const economyRandom = { next: () => randomInt(0, 2 ** 32) / 2 ** 32 };

export function registerEconomyRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, clock } = deps;

  const pity = (userId: string, boxId: string) =>
    db
      .select()
      .from(lootboxPity)
      .where(and(eq(lootboxPity.userId, userId), eq(lootboxPity.boxId, boxId)))
      .get();

  app.get('/api/shop', async (req) => {
    const u = requireReady(req, deps);
    const pol = effectivePolicies(deps, u.id);
    const owned = new Set(
      db
        .select({ id: inventory.itemId })
        .from(inventory)
        .where(eq(inventory.userId, u.id))
        .all()
        .map((r) => r.id),
    );
    const day = dayKey(clock.now());
    return {
      shopEnabled: pol['economy.shop'],
      lootboxesEnabled: pol['economy.lootboxes'],
      day,
      balance: balance(deps, u.id).balance,
      items: shopItemsForDay(day).map((id) => ({
        itemId: id,
        price: shopPrice(id)!,
        owned: owned.has(id),
      })),
      boxes: BOXES.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        price: b.price,
        chances: dropChances(b),
        pity: {
          after: b.pity.after,
          minRarity: b.pity.minRarity,
          counter: pity(u.id, b.id)?.counter ?? 0,
        },
      })),
      pendingBoxes: db
        .select()
        .from(pendingBoxes)
        .where(eq(pendingBoxes.userId, u.id))
        .orderBy(asc(pendingBoxes.createdAt))
        .all()
        .map((p) => ({ id: p.id, boxId: p.boxId })),
    };
  });

  app.post('/api/shop/buy', async (req) => {
    const u = requireReady(req, deps);
    if (u.role !== 'student')
      throw new HttpError(403, 'forbidden', 'Lehrkräfte besitzen bereits alle Gegenstände.');
    const { itemId } = parse(z.object({ itemId: z.string().max(64) }), req.body);
    if (!effectivePolicies(deps, u.id)['economy.shop'])
      throw new HttpError(403, 'disabled', 'Der Shop ist derzeit geschlossen.');
    if (!shopItemsForDay(dayKey(clock.now())).includes(itemId))
      throw new HttpError(400, 'validation', 'Dieser Gegenstand ist heute nicht im Angebot.');
    const price = shopPrice(itemId)!;
    const item = getItem(itemId)!;
    if (
      db
        .select()
        .from(inventory)
        .where(and(eq(inventory.userId, u.id), eq(inventory.itemId, itemId)))
        .get()
    )
      throw new HttpError(409, 'conflict', 'Du besitzt diesen Gegenstand schon.');
    let achievements: string[] = [];
    db.transaction(() => {
      book(deps, u.id, -price, `shop:${itemId}`, null);
      grantItem(deps, u.id, itemId, 'shop', null);
      achievements = checkAchievements(deps, u.id);
    });
    return { itemId, name: item.name, balance: balance(deps, u.id).balance, achievements };
  });

  app.post('/api/shop/boxes/:boxId/open', async (req) => {
    const u = requireReady(req, deps);
    if (u.role !== 'student') throw new HttpError(403, 'forbidden', 'Nur für Lernende.');
    const box = BOX_BY_ID.get((req.params as { boxId: string }).boxId);
    if (!box) throw notFound('Box');
    const { pendingId } = parse(
      z.object({ pendingId: z.number().int().optional() }),
      req.body ?? {},
    );
    const pending = pendingId
      ? db
          .select()
          .from(pendingBoxes)
          .where(and(eq(pendingBoxes.id, pendingId), eq(pendingBoxes.userId, u.id)))
          .get()
      : null;
    if (pendingId && (!pending || pending.boxId !== box.id)) throw notFound('Geschenkte Box');
    // Bought boxes only when the teacher enabled loot boxes; gifted boxes can always be opened.
    if (!pending && !effectivePolicies(deps, u.id)['economy.lootboxes'])
      throw new HttpError(403, 'disabled', 'Lootboxen sind für deine Klasse nicht aktiviert.');

    const result = db.transaction(() => {
      const ref = `box:${box.id}:${crypto.randomUUID()}`;
      if (pending) db.delete(pendingBoxes).where(eq(pendingBoxes.id, pending.id)).run();
      else book(deps, u.id, -box.price, `box:${box.id}`, ref);
      const current = pity(u.id, box.id);
      const counter = current?.counter ?? 0;
      const draw = drawBox(box, boxPool(box.id), counter, economyRandom.next);
      const next = nextPityCounter(box, counter, draw.rarity);
      db.insert(lootboxPity)
        .values({ userId: u.id, boxId: box.id, counter: next, opened: 1 })
        .onConflictDoUpdate({
          target: [lootboxPity.userId, lootboxPity.boxId],
          set: { counter: next, opened: (current?.opened ?? 0) + 1 },
        })
        .run();
      const grant = grantItem(deps, u.id, draw.itemId, `box:${box.id}`, ref);
      const achievements = checkAchievements(deps, u.id);
      return {
        ...grant,
        rarity: draw.rarity,
        pityTriggered: draw.pityTriggered,
        pityCounter: next,
        achievements,
      };
    });
    return { ...result, balance: balance(deps, u.id).balance };
  });

  /** Own transaction history (transparency). */
  app.get('/api/wallet/transactions', async (req) => {
    const u = requireReady(req, deps);
    return db
      .select({
        amount: transactions.amount,
        reason: transactions.reason,
        balanceAfter: transactions.balanceAfter,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(eq(transactions.userId, u.id))
      .orderBy(desc(transactions.id))
      .limit(200)
      .all();
  });
}
