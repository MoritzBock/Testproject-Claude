import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STARTER_ITEMS } from '@pixel/shared';
import { Client, createTestApp, seedWorld, type TestCtx } from '../test/helpers.js';
import { grantItem } from './character.js';
import { balance, verifyLedger } from './wallet.js';

let t: TestCtx;
let w: Awaited<ReturnType<typeof seedWorld>>;
let anna: Client;
beforeEach(async () => {
  t = await createTestApp();
  w = await seedWorld(t.app);
  anna = new Client(t.app);
  await anna.login('anna', w.password, 'AAA-111');
});
afterEach(() => t.app.close());

describe('character', () => {
  it('creation grants the starter items and is possible only once', async () => {
    expect((await anna.get('/api/auth/me')).json().hasCharacter).toBe(false);
    const c = (await anna.post('/api/character', { skinTone: 3, hair: 'hair-short-black' })).json();
    expect(c.equipped.hair).toBe('hair-short-black');
    const inv = (await anna.get('/api/character'))
      .json()
      .inventory.map((i: { itemId: string }) => i.itemId);
    expect(inv.sort()).toEqual([...STARTER_ITEMS].sort());
    expect(
      (await anna.post('/api/character', { skinTone: 1, hair: 'hair-short-black' })).statusCode,
    ).toBe(409);
    expect((await anna.get('/api/auth/me')).json().hasCharacter).toBe(true);
  });

  it('only starter hair can be chosen at creation', async () => {
    expect(
      (await anna.post('/api/character', { skinTone: 1, hair: 'hair-mohawk-rainbow' })).statusCode,
    ).toBe(400);
  });

  it('cannot equip items that are not owned (server-side check)', async () => {
    await anna.post('/api/character', { skinTone: 0, hair: 'hair-short-brown' });
    expect(
      (await anna.put('/api/character', { equipped: { hat: 'hat-crown-gold' } })).statusCode,
    ).toBe(400);
    grantItem(t.app.deps, w.anna, 'hat-crown-gold', 'test', null);
    expect(
      (await anna.put('/api/character', { equipped: { hat: 'hat-crown-gold' } })).json().equipped
        .hat,
    ).toBe('hat-crown-gold');
    expect(
      (await anna.put('/api/character', { equipped: { hat: null } })).json().equipped.hat,
    ).toBeUndefined();
    expect((await anna.put('/api/character', { equipped: { top: null } })).statusCode).toBe(400);
  });

  it('duplicates are converted to currency, booked in the ledger', async () => {
    await anna.post('/api/character', { skinTone: 0, hair: 'hair-short-brown' });
    const r = grantItem(t.app.deps, w.anna, 'top-tshirt-blue', 'test', 'ref-1');
    expect(r.duplicate).toBe(true);
    expect(balance(t.app.deps, w.anna).balance).toBe(r.converted);
    // same ref → no second payout
    grantItem(t.app.deps, w.anna, 'top-tshirt-blue', 'test', 'ref-1');
    expect(balance(t.app.deps, w.anna).balance).toBe(r.converted);
    expect(verifyLedger(t.app.deps, w.anna)).toBe(true);
  });
});
