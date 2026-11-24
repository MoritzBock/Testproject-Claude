import { RARITIES, rarityRank, type BoxDef, type Rarity } from '@pixel/shared';

export interface Draw {
  rarity: Rarity;
  itemId: string;
  pityTriggered: boolean;
}

/**
 * Pure loot box draw (server-side only).
 * 1. Rarity by the published weights (only rarities that contain items).
 * 2. If this is the `pity.after`-th box in a row without the minimum rarity,
 *    only rarities ≥ minimum are possible (weights re-normalised).
 * 3. Item uniformly within the rarity.
 */
export function drawBox(
  box: BoxDef,
  pool: Record<Rarity, string[]>,
  pityCounter: number,
  rand: () => number,
): Draw {
  const minRank = rarityRank(box.pity.minRarity);
  const pityTriggered = pityCounter + 1 >= box.pity.after;
  const candidates = RARITIES.filter(
    (r) => pool[r].length > 0 && (!pityTriggered || rarityRank(r) >= minRank),
  );
  const total = candidates.reduce((s, r) => s + box.weights[r], 0);
  let roll = rand() * total;
  let rarity = candidates[candidates.length - 1]!;
  for (const r of candidates) {
    roll -= box.weights[r];
    if (roll < 0) {
      rarity = r;
      break;
    }
  }
  const items = pool[rarity];
  const itemId = items[Math.min(items.length - 1, Math.floor(rand() * items.length))]!;
  return { rarity, itemId, pityTriggered };
}

/** New pity counter after a draw: reset when the minimum rarity was reached. */
export function nextPityCounter(box: BoxDef, counter: number, rarity: Rarity): number {
  return rarityRank(rarity) >= rarityRank(box.pity.minRarity) ? 0 : counter + 1;
}
