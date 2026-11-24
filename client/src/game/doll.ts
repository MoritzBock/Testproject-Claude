import { ITEMS, SKIN_TONES, getItem, type Equipment, type Slot } from '@pixel/shared';

export interface Appearance {
  skinTone: number;
  equipped: Equipment;
}

/** All layer keys needed (body + every item layer). */
export const LAYER_KEYS = ['body', ...new Set(ITEMS.map((i) => i.layer))];
export const layerTexture = (key: string) => `layer:${key}`;

/** Draw order. Back items go behind the body, except when seen from behind (row "up"). */
const ORDER: Array<Slot | 'body'> = [
  'back',
  'body',
  'shoes',
  'bottom',
  'top',
  'hair',
  'accessory',
  'hat',
];
const ORDER_UP: Array<Slot | 'body'> = [
  'body',
  'shoes',
  'bottom',
  'top',
  'hair',
  'accessory',
  'hat',
  'back',
];

export interface LayerSpec {
  key: string;
  tint: string;
  slot: Slot | 'body';
}

export function layerStack(a: Appearance, facingUp: boolean): LayerSpec[] {
  const out: LayerSpec[] = [];
  for (const slot of facingUp ? ORDER_UP : ORDER) {
    if (slot === 'body') {
      out.push({ key: 'body', tint: SKIN_TONES[a.skinTone] ?? SKIN_TONES[0], slot });
      continue;
    }
    const id = a.equipped[slot];
    const item = id ? getItem(id) : undefined;
    if (item) out.push({ key: item.layer, tint: item.tint, slot });
  }
  return out;
}

export const hexToInt = (hex: string) => parseInt(hex.replace('#', ''), 16);

/** Does the appearance contain an item with glitter effect (epic+)? */
export function hasGlitter(a: Appearance): boolean {
  return Object.values(a.equipped).some((id) => {
    const r = id ? getItem(id)?.rarity : undefined;
    return r === 'epic' || r === 'legendary';
  });
}
