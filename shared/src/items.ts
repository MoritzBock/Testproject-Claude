/**
 * Central, data-driven item database. Every item is a grayscale paper-doll layer
 * (`layer`) plus a colour (`tint`). Add new items here – no new sprites needed for colours.
 */

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Colour AND symbol per rarity (distinguishable for colour-blind players). Effects from epic upwards. */
export const RARITY_INFO: Record<
  Rarity,
  { label: string; color: string; symbol: string; glitter: boolean; value: number }
> = {
  common: { label: 'Gewöhnlich', color: '#b8bdd1', symbol: '●', glitter: false, value: 10 },
  uncommon: { label: 'Ungewöhnlich', color: '#6fdc6f', symbol: '▲', glitter: false, value: 25 },
  rare: { label: 'Selten', color: '#5aa8ff', symbol: '◆', glitter: false, value: 60 },
  epic: { label: 'Episch', color: '#c77dff', symbol: '★', glitter: true, value: 150 },
  legendary: { label: 'Legendär', color: '#ffb347', symbol: '✦', glitter: true, value: 400 },
};

export const rarityRank = (r: Rarity) => RARITIES.indexOf(r);

export const SLOTS = ['hair', 'hat', 'accessory', 'top', 'bottom', 'shoes', 'back'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  hair: 'Haare',
  hat: 'Kopfbedeckung',
  accessory: 'Accessoire',
  top: 'Oberteil',
  bottom: 'Hose',
  shoes: 'Schuhe',
  back: 'Rücken',
};

/** Slots that must always be filled. */
export const REQUIRED_SLOTS: readonly Slot[] = ['top', 'bottom'];

/** Free skin tones (the body is not an unlockable item). */
export const SKIN_TONES = [
  '#f6d3b3',
  '#efbf96',
  '#d9a074',
  '#b97c52',
  '#8a5636',
  '#5c3824',
] as const;

export type ItemSource =
  | { type: 'starter' }
  | { type: 'shop'; price: number }
  | { type: 'box'; box: string }
  | { type: 'level'; levelId: string; stars?: number }
  | { type: 'achievement'; id: string }
  | { type: 'teacher' };

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Paper-doll layer key (sprites/layers/<layer>.png). */
  layer: string;
  tint: string;
  sources: ItemSource[];
  /** Currency value when obtained as a duplicate. */
  value: number;
}

type Def = [
  id: string,
  name: string,
  slot: Slot,
  rarity: Rarity,
  layer: string,
  tint: string,
  sources: ItemSource[],
];

const shop = (price: number): ItemSource => ({ type: 'shop', price });
const box = (b: string): ItemSource => ({ type: 'box', box: b });
const starter: ItemSource = { type: 'starter' };
const teacher: ItemSource = { type: 'teacher' };
const lvl = (levelId: string, stars?: number): ItemSource => ({
  type: 'level',
  levelId,
  ...(stars ? { stars } : {}),
});
const ach = (id: string): ItemSource => ({ type: 'achievement', id });

const DEFS: Def[] = [
  // hair – one free style in three colours (character creation)
  ['hair-short-brown', 'Kurzhaar Braun', 'hair', 'common', 'hair-short', '#6b4a30', [starter]],
  ['hair-short-black', 'Kurzhaar Schwarz', 'hair', 'common', 'hair-short', '#2a2430', [starter]],
  ['hair-short-blond', 'Kurzhaar Blond', 'hair', 'common', 'hair-short', '#e2c069', [starter]],
  [
    'hair-short-red',
    'Kurzhaar Rot',
    'hair',
    'uncommon',
    'hair-short',
    '#b8452c',
    [shop(60), box('box-hair')],
  ],
  ['hair-short-blue', 'Kurzhaar Blau', 'hair', 'rare', 'hair-short', '#3a6df0', [box('box-hair')]],
  [
    'hair-long-brown',
    'Langhaar Braun',
    'hair',
    'common',
    'hair-long',
    '#6b4a30',
    [shop(40), box('box-hair')],
  ],
  [
    'hair-long-black',
    'Langhaar Schwarz',
    'hair',
    'common',
    'hair-long',
    '#2a2430',
    [shop(40), box('box-hair')],
  ],
  [
    'hair-long-blond',
    'Langhaar Blond',
    'hair',
    'uncommon',
    'hair-long',
    '#e2c069',
    [box('box-hair'), lvl('demo-a')],
  ],
  ['hair-long-pink', 'Langhaar Pink', 'hair', 'rare', 'hair-long', '#ff6fb5', [box('box-hair')]],
  [
    'hair-curly-black',
    'Locken Schwarz',
    'hair',
    'common',
    'hair-curly',
    '#2a2430',
    [shop(40), box('box-hair')],
  ],
  [
    'hair-curly-brown',
    'Locken Braun',
    'hair',
    'uncommon',
    'hair-curly',
    '#6b4a30',
    [box('box-hair')],
  ],
  [
    'hair-curly-silver',
    'Locken Silber',
    'hair',
    'epic',
    'hair-curly',
    '#dfe3ee',
    [box('box-hair')],
  ],
  [
    'hair-bun-brown',
    'Dutt Braun',
    'hair',
    'uncommon',
    'hair-bun',
    '#6b4a30',
    [shop(70), box('box-hair')],
  ],
  ['hair-bun-blond', 'Dutt Blond', 'hair', 'uncommon', 'hair-bun', '#e2c069', [box('box-hair')]],
  [
    'hair-spiky-black',
    'Stacheln Schwarz',
    'hair',
    'uncommon',
    'hair-spiky',
    '#2a2430',
    [shop(70), box('box-hair')],
  ],
  [
    'hair-spiky-cyan',
    'Stacheln Cyan',
    'hair',
    'rare',
    'hair-spiky',
    '#4fd1c5',
    [box('box-hair'), lvl('demo-b', 3)],
  ],
  [
    'hair-mohawk-green',
    'Irokese Grün',
    'hair',
    'epic',
    'hair-mohawk',
    '#55e07a',
    [box('box-hair')],
  ],
  [
    'hair-mohawk-rainbow',
    'Irokese Regenbogen',
    'hair',
    'legendary',
    'hair-mohawk',
    '#ff7ad9',
    [box('box-hair'), ach('collector-25')],
  ],

  // hats
  ['hat-cap-red', 'Kappe Rot', 'hat', 'common', 'hat-cap', '#d24a43', [shop(30), box('box-hats')]],
  [
    'hat-cap-blue',
    'Kappe Blau',
    'hat',
    'common',
    'hat-cap',
    '#3d7fd9',
    [shop(30), box('box-hats')],
  ],
  ['hat-cap-black', 'Kappe Schwarz', 'hat', 'uncommon', 'hat-cap', '#2d2d38', [box('box-hats')]],
  [
    'hat-beanie-grey',
    'Mütze Grau',
    'hat',
    'common',
    'hat-beanie',
    '#9aa0b5',
    [shop(35), box('box-hats')],
  ],
  [
    'hat-beanie-yellow',
    'Mütze Gelb',
    'hat',
    'uncommon',
    'hat-beanie',
    '#f2c94c',
    [box('box-hats')],
  ],
  [
    'hat-bandana-red',
    'Bandana Rot',
    'hat',
    'uncommon',
    'hat-bandana',
    '#c0392b',
    [shop(55), box('box-hats')],
  ],
  [
    'hat-bandana-teal',
    'Bandana Türkis',
    'hat',
    'rare',
    'hat-bandana',
    '#2fb3a6',
    [box('box-hats')],
  ],
  [
    'hat-headset-black',
    'Support-Headset',
    'hat',
    'rare',
    'hat-headset',
    '#3a3a48',
    [box('box-hats'), lvl('demo-c', 3)],
  ],
  ['hat-headset-white', 'Headset Weiß', 'hat', 'epic', 'hat-headset', '#eef0f7', [box('box-hats')]],
  [
    'hat-crown-gold',
    'Sysadmin-Krone',
    'hat',
    'legendary',
    'hat-crown',
    '#ffd75e',
    [box('box-hats'), ach('stars-15')],
  ],
  ['hat-crown-teacher', 'Lehrkraft-Krone', 'hat', 'legendary', 'hat-crown', '#ff9f43', [teacher]],

  // accessories
  [
    'acc-glasses-black',
    'Brille Schwarz',
    'accessory',
    'common',
    'acc-glasses',
    '#2a2a33',
    [shop(25), box('box-hats')],
  ],
  [
    'acc-glasses-red',
    'Brille Rot',
    'accessory',
    'uncommon',
    'acc-glasses',
    '#d24a43',
    [box('box-hats')],
  ],
  ['acc-visor-cyan', 'VR-Visier', 'accessory', 'epic', 'acc-visor', '#4fd1c5', [box('box-hats')]],
  [
    'acc-scarf-yellow',
    'Schal Gelb',
    'accessory',
    'common',
    'acc-scarf',
    '#f2c94c',
    [shop(30), box('box-hats')],
  ],
  [
    'acc-scarf-striped',
    'Schal Blau',
    'accessory',
    'uncommon',
    'acc-scarf',
    '#5a7de0',
    [box('box-hats')],
  ],
  [
    'acc-badge-gold',
    'Azubi-Abzeichen',
    'accessory',
    'rare',
    'acc-badge',
    '#ffd75e',
    [ach('first-level')],
  ],
  [
    'acc-badge-teacher',
    'Lehrkraft-Abzeichen',
    'accessory',
    'legendary',
    'acc-badge',
    '#ff9f43',
    [teacher],
  ],

  // tops
  ['top-tshirt-blue', 'T-Shirt Blau', 'top', 'common', 'top-tshirt', '#3d7fd9', [starter]],
  [
    'top-tshirt-green',
    'T-Shirt Grün',
    'top',
    'common',
    'top-tshirt',
    '#3e9a5a',
    [shop(25), box('box-outfit')],
  ],
  [
    'top-tshirt-red',
    'T-Shirt Rot',
    'top',
    'common',
    'top-tshirt',
    '#c94a43',
    [shop(25), box('box-outfit')],
  ],
  [
    'top-hoodie-grey',
    'Hoodie Grau',
    'top',
    'common',
    'top-hoodie',
    '#8a90a6',
    [shop(45), box('box-outfit')],
  ],
  [
    'top-hoodie-purple',
    'Hoodie Lila',
    'top',
    'uncommon',
    'top-hoodie',
    '#8a4fc4',
    [box('box-outfit')],
  ],
  [
    'top-hoodie-black',
    'Hoodie Schwarz',
    'top',
    'rare',
    'top-hoodie',
    '#2d2d38',
    [box('box-outfit'), lvl('demo-d')],
  ],
  [
    'top-jacket-denim',
    'Jeansjacke',
    'top',
    'uncommon',
    'top-jacket',
    '#4a6fa5',
    [shop(80), box('box-outfit')],
  ],
  ['top-jacket-leather', 'Lederjacke', 'top', 'rare', 'top-jacket', '#5a3d2a', [box('box-outfit')]],
  ['top-vest-orange', 'Warnweste', 'top', 'uncommon', 'top-vest', '#ff8a2a', [box('box-outfit')]],
  [
    'top-coat-white',
    'Laborkittel',
    'top',
    'epic',
    'top-coat',
    '#f4f6ff',
    [box('box-outfit'), lvl('demo-e', 3)],
  ],
  [
    'top-sweater-teal',
    'Pulli Türkis',
    'top',
    'common',
    'top-sweater',
    '#2fb3a6',
    [shop(35), box('box-outfit')],
  ],
  [
    'top-sweater-gold',
    'Pulli Gold',
    'top',
    'legendary',
    'top-sweater',
    '#ffcf4a',
    [box('box-outfit')],
  ],

  // bottoms
  ['bottom-pants-navy', 'Hose Marine', 'bottom', 'common', 'bottom-pants', '#3a3f5c', [starter]],
  [
    'bottom-pants-black',
    'Hose Schwarz',
    'bottom',
    'common',
    'bottom-pants',
    '#26262f',
    [shop(25), box('box-outfit')],
  ],
  [
    'bottom-pants-beige',
    'Hose Beige',
    'bottom',
    'common',
    'bottom-pants',
    '#c9b48a',
    [shop(25), box('box-outfit')],
  ],
  [
    'bottom-shorts-blue',
    'Shorts Blau',
    'bottom',
    'common',
    'bottom-shorts',
    '#4a6fa5',
    [shop(25), box('box-outfit')],
  ],
  [
    'bottom-skirt-plaid',
    'Rock Rot',
    'bottom',
    'uncommon',
    'bottom-skirt',
    '#b8452c',
    [shop(50), box('box-outfit')],
  ],
  [
    'bottom-skirt-purple',
    'Rock Lila',
    'bottom',
    'rare',
    'bottom-skirt',
    '#7a3fa0',
    [box('box-outfit')],
  ],
  [
    'bottom-cargo-olive',
    'Cargohose Oliv',
    'bottom',
    'uncommon',
    'bottom-cargo',
    '#5d6b35',
    [box('box-outfit')],
  ],
  [
    'bottom-cargo-camo',
    'Cargohose Sand',
    'bottom',
    'rare',
    'bottom-cargo',
    '#b99a62',
    [box('box-outfit')],
  ],

  // shoes
  [
    'shoes-sneakers-white',
    'Turnschuhe Weiß',
    'shoes',
    'common',
    'shoes-sneakers',
    '#eef0f7',
    [starter],
  ],
  [
    'shoes-sneakers-red',
    'Turnschuhe Rot',
    'shoes',
    'common',
    'shoes-sneakers',
    '#d24a43',
    [shop(20), box('box-outfit')],
  ],
  [
    'shoes-sneakers-neon',
    'Neon-Sneaker',
    'shoes',
    'rare',
    'shoes-sneakers',
    '#7dff8a',
    [box('box-outfit')],
  ],
  [
    'shoes-boots-brown',
    'Stiefel Braun',
    'shoes',
    'uncommon',
    'shoes-boots',
    '#6d4a2d',
    [shop(45), box('box-outfit')],
  ],
  [
    'shoes-boots-black',
    'Sicherheitsschuhe',
    'shoes',
    'uncommon',
    'shoes-boots',
    '#2a2a33',
    [box('box-outfit'), lvl('demo-b')],
  ],

  // back
  [
    'back-backpack-orange',
    'Rucksack Orange',
    'back',
    'common',
    'back-backpack',
    '#e08a2e',
    [shop(40), box('box-back')],
  ],
  [
    'back-backpack-blue',
    'Rucksack Blau',
    'back',
    'uncommon',
    'back-backpack',
    '#3d7fd9',
    [box('box-back')],
  ],
  ['back-cape-red', 'Umhang Rot', 'back', 'rare', 'back-cape', '#c0392b', [box('box-back')]],
  [
    'back-cape-night',
    'Umhang Nachtblau',
    'back',
    'epic',
    'back-cape',
    '#2c3e8f',
    [box('box-back'), ach('all-demo')],
  ],
  ['back-wings-led', 'LED-Flügel', 'back', 'legendary', 'back-wings', '#7ff7e4', [box('box-back')]],
  [
    'back-wings-teacher',
    'Lehrkraft-Flügel',
    'back',
    'legendary',
    'back-wings',
    '#ffb347',
    [teacher],
  ],
];

export const ITEMS: Item[] = DEFS.map(([id, name, slot, rarity, layer, tint, sources]) => ({
  id,
  name,
  slot,
  rarity,
  layer,
  tint,
  sources,
  value: RARITY_INFO[rarity].value,
}));

export const ITEM_BY_ID: ReadonlyMap<string, Item> = new Map(ITEMS.map((i) => [i.id, i]));

export const getItem = (id: string): Item | undefined => ITEM_BY_ID.get(id);

export const STARTER_ITEMS = ITEMS.filter((i) => i.sources.some((s) => s.type === 'starter')).map(
  (i) => i.id,
);
export const STARTER_HAIR = STARTER_ITEMS.filter((id) => getItem(id)!.slot === 'hair');
export const DEFAULT_EQUIPMENT: Partial<Record<Slot, string>> = {
  hair: 'hair-short-brown',
  top: 'top-tshirt-blue',
  bottom: 'bottom-pants-navy',
  shoes: 'shoes-sneakers-white',
};

/** Items obtainable by learners (teacher-only items are excluded from the collection count). */
export const COLLECTIBLE_ITEMS = ITEMS.filter((i) => !i.sources.every((s) => s.type === 'teacher'));

export type Equipment = Partial<Record<Slot, string>>;

/** Validates an equipment map against ownership and slot rules. Returns German error or null. */
export function validateEquipment(eq: Equipment, owned: ReadonlySet<string>): string | null {
  for (const [slot, itemId] of Object.entries(eq) as Array<[Slot, string | undefined]>) {
    if (!SLOTS.includes(slot)) return `Unbekannter Slot ${slot}.`;
    if (!itemId) continue;
    const item = getItem(itemId);
    if (!item) return `Unbekannter Gegenstand.`;
    if (item.slot !== slot) return `${item.name} passt nicht in diesen Slot.`;
    if (!owned.has(itemId)) return `${item.name} besitzt du noch nicht.`;
  }
  for (const slot of REQUIRED_SLOTS)
    if (!eq[slot]) return `${SLOT_LABELS[slot]} darf nicht leer sein.`;
  return null;
}

/** Human readable hint how a locked item can be obtained. */
export function sourceHint(
  s: ItemSource,
  names: {
    level: (id: string) => string;
    box: (id: string) => string;
    achievement: (id: string) => string;
  },
): string {
  switch (s.type) {
    case 'starter':
      return 'Startausstattung';
    case 'shop':
      return `Im Shop für ${s.price} Bytes`;
    case 'box':
      return `Aus der ${names.box(s.box)}`;
    case 'level':
      return s.stars
        ? `Level „${names.level(s.levelId)}“ mit ${s.stars} Sternen abschließen`
        : `Level „${names.level(s.levelId)}“ abschließen`;
    case 'achievement':
      return `Erfolg „${names.achievement(s.id)}“`;
    case 'teacher':
      return 'Nur durch die Lehrkraft vergeben';
  }
}
