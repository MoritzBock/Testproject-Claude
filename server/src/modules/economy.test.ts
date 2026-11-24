import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BOX_BY_ID,
  RARITIES,
  boxPool,
  dropChances,
  rarityRank,
  shopItemsForDay,
} from '@pixel/shared';
import { Client, createTestApp, seedWorld, type TestCtx } from '../test/helpers.js';
import { dayKey } from '../lib/clock.js';
import { drawBox, nextPityCounter } from './lootbox.js';
import { book, balance, verifyLedger } from './wallet.js';
import { economyRandom } from './economy.js';

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('loot box draw (pure)', () => {
  const box = BOX_BY_ID.get('box-hats')!;
  const pool = boxPool(box.id);

  it('matches the published drop chances statistically', () => {
    const rand = seeded(7);
    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<string, number>;
    const N = 20000;
    for (let i = 0; i < N; i++) counts[drawBox(box, pool, 0, rand).rarity]!++;
    for (const c of dropChances(box)) expect(counts[c.rarity]! / N).toBeCloseTo(c.percent / 100, 1);
  });

  it('guarantees the minimum rarity on the pity box', () => {
    const rand = seeded(3);
    for (let i = 0; i < 500; i++) {
      const d = drawBox(box, pool, box.pity.after - 1, rand);
      expect(d.pityTriggered).toBe(true);
      expect(rarityRank(d.rarity)).toBeGreaterThanOrEqual(rarityRank(box.pity.minRarity));
    }
  });

  it('never goes more than `after` boxes without the minimum rarity', () => {
    const rand = seeded(11);
    let counter = 0;
    let streak = 0;
    for (let i = 0; i < 5000; i++) {
      const d = drawBox(box, pool, counter, rand);
      counter = nextPityCounter(box, counter, d.rarity);
      streak = counter === 0 ? 0 : streak + 1;
      expect(streak).toBeLessThan(box.pity.after);
    }
  });

  it('always returns an item of the drawn rarity from this box', () => {
    const rand = seeded(5);
    for (let i = 0; i < 200; i++) {
      const d = drawBox(box, pool, 0, rand);
      expect(pool[d.rarity]).toContain(d.itemId);
    }
  });
});

describe('shop & boxes (API)', () => {
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

  const give = (n: number) => book(t.app.deps, w.anna, n, 'test', null);
  const enableBoxes = () =>
    teacher.post('/api/teacher/policies', {
      targets: [{ scopeType: 'class', scopeId: w.classA }],
      key: 'economy.lootboxes',
      value: true,
    });

  it('buys an item of today’s rotation, debits the price and logs it', async () => {
    give(500);
    const id = shopItemsForDay(dayKey(t.clock.now()))[0]!;
    const res = await anna.post('/api/shop/buy', { itemId: id });
    expect(res.statusCode).toBe(200);
    expect((await anna.post('/api/shop/buy', { itemId: id })).statusCode).toBe(409);
    expect(verifyLedger(t.app.deps, w.anna)).toBe(true);
    const tx = (await anna.get('/api/wallet/transactions')).json();
    expect(tx.some((x: { reason: string }) => x.reason === `shop:${id}`)).toBe(true);
  });

  it('refuses items outside the rotation and insufficient funds', async () => {
    give(5);
    const id = shopItemsForDay(dayKey(t.clock.now()))[0]!;
    expect((await anna.post('/api/shop/buy', { itemId: id })).statusCode).toBe(400); // too expensive
    expect((await anna.post('/api/shop/buy', { itemId: 'hat-crown-gold' })).statusCode).toBe(400);
    expect(balance(t.app.deps, w.anna).balance).toBe(5);
  });

  it('loot boxes are disabled by default and can be enabled by the teacher', async () => {
    give(1000);
    expect((await anna.post('/api/shop/boxes/box-hats/open')).statusCode).toBe(403);
    await enableBoxes();
    const res = (await anna.post('/api/shop/boxes/box-hats/open')).json();
    expect(res.itemId).toBeDefined();
    expect(res.balance).toBe(1000 - BOX_BY_ID.get('box-hats')!.price + res.converted);
    expect(verifyLedger(t.app.deps, w.anna)).toBe(true);
  });

  it('duplicates from boxes are converted into currency', async () => {
    give(5000);
    await enableBoxes();
    const old = economyRandom.next;
    economyRandom.next = () => 0; // always the first common item
    try {
      const a = (await anna.post('/api/shop/boxes/box-hair/open')).json();
      const b = (await anna.post('/api/shop/boxes/box-hair/open')).json();
      expect(b.itemId).toBe(a.itemId);
      expect(b.duplicate).toBe(true);
      expect(b.converted).toBeGreaterThan(0);
    } finally {
      economyRandom.next = old;
    }
    expect(verifyLedger(t.app.deps, w.anna)).toBe(true);
  });

  it('the shop can be closed by policy', async () => {
    give(500);
    await teacher.post('/api/teacher/policies', {
      targets: [{ scopeType: 'user', scopeId: w.anna }],
      key: 'economy.shop',
      value: false,
    });
    const id = shopItemsForDay(dayKey(t.clock.now()))[0]!;
    expect((await anna.post('/api/shop/buy', { itemId: id })).statusCode).toBe(403);
  });

  it('the shop shows drop chances that sum to 100 %', async () => {
    const shop = (await anna.get('/api/shop')).json();
    for (const b of shop.boxes)
      expect(b.chances.reduce((s: number, c: { percent: number }) => s + c.percent, 0)).toBeCloseTo(
        100,
        0,
      );
  });
});
