import { describe, expect, it } from 'vitest';
import { BOXES, boxPool, dropChances, shopItemsForDay } from './economy.js';
import {
  COLLECTIBLE_ITEMS,
  DEFAULT_EQUIPMENT,
  ITEMS,
  RARITY_INFO,
  STARTER_ITEMS,
  validateEquipment,
} from './items.js';

describe('item database', () => {
  it('has unique ids and every item has a source', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) expect(i.sources.length, i.id).toBeGreaterThan(0);
  });
  it('every rarity has a distinct symbol and colour', () => {
    const infos = Object.values(RARITY_INFO);
    expect(new Set(infos.map((r) => r.symbol)).size).toBe(infos.length);
    expect(new Set(infos.map((r) => r.color)).size).toBe(infos.length);
  });
  it('default equipment consists of starter items and is valid', () => {
    expect(validateEquipment(DEFAULT_EQUIPMENT, new Set(STARTER_ITEMS))).toBeNull();
  });
  it('rejects foreign, unknown or misplaced items and empty required slots', () => {
    const owned = new Set(STARTER_ITEMS);
    expect(validateEquipment({ ...DEFAULT_EQUIPMENT, hat: 'hat-crown-gold' }, owned)).toMatch(
      /besitzt/,
    );
    expect(validateEquipment({ ...DEFAULT_EQUIPMENT, hat: 'top-tshirt-blue' }, owned)).toMatch(
      /passt nicht/,
    );
    expect(validateEquipment({ ...DEFAULT_EQUIPMENT, top: undefined }, owned)).toMatch(/leer/);
    expect(validateEquipment({ ...DEFAULT_EQUIPMENT, hat: 'gibts-nicht' }, owned)).toMatch(
      /Unbekannt/,
    );
  });
  it('teacher-only items do not count for the collection', () => {
    expect(COLLECTIBLE_ITEMS.some((i) => i.id === 'hat-crown-teacher')).toBe(false);
  });
});

describe('boxes and shop', () => {
  it('every box contains items and its displayed chances sum to 100 %', () => {
    for (const b of BOXES) {
      const pool = boxPool(b.id);
      expect(Object.values(pool).flat().length, b.id).toBeGreaterThan(3);
      const sum = dropChances(b).reduce((s, c) => s + c.percent, 0);
      expect(sum).toBeCloseTo(100, 0);
      // pity target must exist in the box
      expect(dropChances(b).some((c) => c.rarity === b.pity.minRarity)).toBe(true);
    }
  });
  it('shop rotation is deterministic per day and contains only shop items', () => {
    const a = shopItemsForDay('2026-11-24');
    expect(shopItemsForDay('2026-11-24')).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
    for (const id of a)
      expect(ITEMS.find((i) => i.id === id)!.sources.some((s) => s.type === 'shop')).toBe(true);
  });
});
