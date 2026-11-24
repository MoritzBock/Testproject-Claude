import type { Equipment } from '@pixel/shared';
import { get, put } from '../api/http';
import { createStore } from './store';
import type { Appearance } from '../game/doll';

export interface InventoryEntry {
  itemId: string;
  source: string;
  acquiredAt: number;
}

export const characterStore = createStore<{
  appearance: Appearance | null;
  inventory: InventoryEntry[];
}>({
  appearance: null,
  inventory: [],
});

export async function loadCharacter(): Promise<void> {
  const r = await get<{ character: Appearance | null; inventory: InventoryEntry[] }>(
    '/api/character',
  );
  characterStore.set({ appearance: r.character, inventory: r.inventory });
}

/** Optimistic update; reverts if the server rejects the change. */
export async function saveAppearance(patch: {
  skinTone?: number;
  equipped?: Partial<Record<keyof Equipment, string | null>>;
}): Promise<void> {
  const before = characterStore.get().appearance;
  if (before) {
    const equipped = { ...before.equipped };
    for (const [slot, v] of Object.entries(patch.equipped ?? {})) {
      if (v) equipped[slot as keyof Equipment] = v;
      else delete equipped[slot as keyof Equipment];
    }
    characterStore.set({ appearance: { skinTone: patch.skinTone ?? before.skinTone, equipped } });
  }
  try {
    const saved = await put<Appearance>('/api/character', patch);
    characterStore.set({ appearance: saved });
  } catch (e) {
    characterStore.set({ appearance: before });
    throw e;
  }
}
