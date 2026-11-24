import { ITEMS, RARITIES, type Rarity, type Slot } from './items.js';

/** Loot boxes per category – weights are per RARITY; the item is then drawn uniformly within it. */
export interface BoxDef {
  id: string;
  name: string;
  description: string;
  price: number;
  slots: Slot[];
  weights: Record<Rarity, number>;
  /** Guaranteed minimum rarity after `pity.after` boxes without it. */
  pity: { after: number; minRarity: Rarity };
}

const STANDARD_WEIGHTS: Record<Rarity, number> = {
  common: 55,
  uncommon: 27,
  rare: 12,
  epic: 5,
  legendary: 1,
};

export const BOXES: BoxDef[] = [
  {
    id: 'box-hats',
    name: 'Kopfbedeckungen-Box',
    description: 'Mützen, Kappen, Headsets und Accessoires.',
    price: 80,
    slots: ['hat', 'accessory'],
    weights: STANDARD_WEIGHTS,
    pity: { after: 10, minRarity: 'rare' },
  },
  {
    id: 'box-outfit',
    name: 'Outfit-Box',
    description: 'Oberteile, Hosen und Schuhe.',
    price: 80,
    slots: ['top', 'bottom', 'shoes'],
    weights: STANDARD_WEIGHTS,
    pity: { after: 10, minRarity: 'rare' },
  },
  {
    id: 'box-hair',
    name: 'Frisuren-Box',
    description: 'Neue Frisuren und Haarfarben.',
    price: 70,
    slots: ['hair'],
    weights: STANDARD_WEIGHTS,
    pity: { after: 10, minRarity: 'rare' },
  },
  {
    id: 'box-back',
    name: 'Rücken-Box',
    description: 'Rucksäcke, Umhänge und Flügel.',
    price: 100,
    slots: ['back'],
    weights: STANDARD_WEIGHTS,
    pity: { after: 10, minRarity: 'rare' },
  },
];

export const BOX_BY_ID = new Map(BOXES.map((b) => [b.id, b]));

/** Items that can drop from a box, grouped by rarity. */
export function boxPool(boxId: string): Record<Rarity, string[]> {
  const pool = Object.fromEntries(RARITIES.map((r) => [r, [] as string[]])) as Record<
    Rarity,
    string[]
  >;
  for (const item of ITEMS)
    if (item.sources.some((s) => s.type === 'box' && s.box === boxId))
      pool[item.rarity].push(item.id);
  return pool;
}

/**
 * Displayed drop chances per rarity (only rarities that actually contain items count).
 * Returned as percentages that sum to 100.
 */
export function dropChances(
  box: BoxDef,
): Array<{ rarity: Rarity; percent: number; items: number }> {
  const pool = boxPool(box.id);
  const active = RARITIES.filter((r) => pool[r].length > 0);
  const total = active.reduce((s, r) => s + box.weights[r], 0);
  return active.map((r) => ({
    rarity: r,
    percent: Math.round((box.weights[r] / total) * 1000) / 10,
    items: pool[r].length,
  }));
}

/** Shop: fixed items with a daily rotation (deterministic, the same for everyone). */
export const SHOP_ROTATION_SIZE = 8;
export const SHOP_ALWAYS = [
  'hat-cap-red',
  'top-tshirt-green',
  'bottom-pants-black',
  'shoes-sneakers-red',
];

export function shopItemsForDay(dayKey: string): string[] {
  const candidates = ITEMS.filter(
    (i) => i.sources.some((s) => s.type === 'shop') && !SHOP_ALWAYS.includes(i.id),
  ).map((i) => i.id);
  // tiny deterministic shuffle seeded by the date
  let seed = [...dayKey].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const shuffled = [...candidates].sort((a, b) => a.localeCompare(b));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return [...SHOP_ALWAYS, ...shuffled.slice(0, SHOP_ROTATION_SIZE - SHOP_ALWAYS.length)];
}

export function shopPrice(itemId: string): number | null {
  const item = ITEMS.find((i) => i.id === itemId);
  const s = item?.sources.find((x) => x.type === 'shop');
  return s && s.type === 'shop' ? s.price : null;
}

/** Achievements (Erfolge) – rewards are paid once. */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  reward: { currency?: number; item?: string };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-level',
    name: 'Erste Schritte',
    description: 'Schließe dein erstes Level ab.',
    reward: { currency: 20, item: 'acc-badge-gold' },
  },
  {
    id: 'stars-5',
    name: 'Sternensammler',
    description: 'Sammle 5 Sterne.',
    reward: { currency: 30 },
  },
  {
    id: 'stars-15',
    name: 'Sternenregen',
    description: 'Sammle 15 Sterne.',
    reward: { currency: 60, item: 'hat-crown-gold' },
  },
  {
    id: 'perfect-level',
    name: 'Fehlerfrei',
    description: 'Schließe ein Level mit 3 Sternen ab.',
    reward: { currency: 25 },
  },
  {
    id: 'all-demo',
    name: 'Inselkenner',
    description: 'Schließe alle Level ab.',
    reward: { currency: 100, item: 'back-cape-night' },
  },
  {
    id: 'collector-10',
    name: 'Sammler',
    description: 'Besitze 10 Gegenstände.',
    reward: { currency: 30 },
  },
  {
    id: 'collector-25',
    name: 'Großsammler',
    description: 'Besitze 25 Gegenstände.',
    reward: { currency: 80, item: 'hair-mohawk-rainbow' },
  },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Rewards for level progress (server-side payout). */
export const LEVEL_REWARDS = {
  /** Default currency per newly reached star, unless the level defines its own. */
  perStar: 15,
  /** One-time bonus for the first completion. */
  firstCompletion: 20,
};
