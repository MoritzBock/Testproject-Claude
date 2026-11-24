import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ACHIEVEMENT_BY_ID,
  BOX_BY_ID,
  COLLECTIBLE_ITEMS,
  ITEMS,
  RARITIES,
  RARITY_INFO,
  REQUIRED_SLOTS,
  SKIN_TONES,
  SLOTS,
  SLOT_LABELS,
  sourceHint,
  type Item,
  type Rarity,
  type Slot,
} from '@pixel/shared';
import { closeOverlay, notify } from '../core/app-state';
import { characterStore, saveAppearance } from '../core/character-store';
import { sessionStore } from '../core/session';
import { useStore } from '../core/store';
import { levelTitle } from '../game/data/world';
import { playSfx } from '../audio/sfx';
import { DollPreview } from './CharacterCreator';
import { renderItemThumb } from './doll-render';
import { Modal } from './Modal';

const names = {
  level: (id: string) => levelTitle(id),
  box: (id: string) => BOX_BY_ID.get(id)?.name ?? id,
  achievement: (id: string) => ACHIEVEMENT_BY_ID.get(id)?.name ?? id,
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const r = RARITY_INFO[rarity];
  return (
    <span class="rarity-badge" style={{ color: r.color, borderColor: r.color }}>
      <span aria-hidden="true">{r.symbol}</span> {r.label}
    </span>
  );
}

function ItemThumb({ item, owned }: { item: Item; owned: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderItemThumb(ref.current, item.layer, owned ? item.tint : null, 3);
  }, [item, owned]);
  return <canvas ref={ref} class="item-thumb" aria-hidden="true" />;
}

export function Wardrobe() {
  const { appearance, inventory } = useStore(characterStore, (s) => s);
  const isStaff = useStore(sessionStore, (s) => s.me?.role !== 'student');
  const [slot, setSlot] = useState<Slot | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [dir, setDir] = useState(0);
  const owned = useMemo(() => new Set(inventory.map((i) => i.itemId)), [inventory]);
  if (!appearance) return null;

  const pool = isStaff ? ITEMS : COLLECTIBLE_ITEMS;
  const collected = pool.filter((i) => owned.has(i.id)).length;
  const list = pool.filter(
    (i) =>
      (slot === 'all' || i.slot === slot) &&
      (rarity === 'all' || i.rarity === rarity) &&
      (!onlyOwned || owned.has(i.id)),
  );

  const toggle = async (item: Item) => {
    setSelected(item);
    if (!owned.has(item.id)) {
      playSfx('deny');
      return;
    }
    const equipped = appearance.equipped[item.slot] === item.id;
    if (equipped && REQUIRED_SLOTS.includes(item.slot)) {
      notify(`${SLOT_LABELS[item.slot]} kann nicht leer sein.`, 'warning');
      return;
    }
    try {
      await saveAppearance({ equipped: { [item.slot]: equipped ? null : item.id } });
      playSfx('ui');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Fehler', 'warning');
    }
  };

  return (
    <Modal title="Garderobe & Sammlung" onClose={closeOverlay} wide>
      <div class="wardrobe">
        <aside class="wardrobe-preview">
          <DollPreview appearance={appearance} dir={dir} scale={6} />
          <div class="menu-row center">
            <button
              class="btn btn-small"
              aria-label="Figur drehen links"
              onClick={() => setDir((d) => (d + 3) % 4)}
            >
              ◀
            </button>
            <button
              class="btn btn-small"
              aria-label="Figur drehen rechts"
              onClick={() => setDir((d) => (d + 1) % 4)}
            >
              ▶
            </button>
          </div>
          <fieldset>
            <legend>Hautton</legend>
            <div class="swatches small">
              {SKIN_TONES.map((c, i) => (
                <button
                  key={c}
                  class={`swatch ${appearance.skinTone === i ? 'swatch-active' : ''}`}
                  style={{ background: c }}
                  aria-label={`Hautton ${i + 1}`}
                  aria-pressed={appearance.skinTone === i}
                  onClick={() => void saveAppearance({ skinTone: i })}
                />
              ))}
            </div>
          </fieldset>
          <p class="collection-count">
            <strong>
              {collected}/{pool.length}
            </strong>{' '}
            gesammelt
          </p>
          {selected && (
            <div class="item-detail panel">
              <h3>
                {owned.has(selected.id) ? selected.name : `??? (${SLOT_LABELS[selected.slot]})`}
              </h3>
              <RarityBadge rarity={selected.rarity} />
              <p class="note">{SLOT_LABELS[selected.slot]}</p>
              {!owned.has(selected.id) && (
                <>
                  <p>So bekommst du es:</p>
                  <ul>
                    {selected.sources.map((s, i) => (
                      <li key={i}>{sourceHint(s, names)}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
        <section class="wardrobe-items">
          <div class="tabs" role="tablist" aria-label="Slot">
            {(['all', ...SLOTS] as const).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={slot === s}
                class={`tab ${slot === s ? 'tab-active' : ''}`}
                onClick={() => setSlot(s)}
              >
                {s === 'all' ? 'Alle' : SLOT_LABELS[s]}
              </button>
            ))}
          </div>
          <div class="menu-row">
            <label class="inline-field">
              Seltenheit{' '}
              <select
                value={rarity}
                onChange={(e) => setRarity((e.target as HTMLSelectElement).value as Rarity | 'all')}
              >
                <option value="all">Alle</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {RARITY_INFO[r].symbol} {RARITY_INFO[r].label}
                  </option>
                ))}
              </select>
            </label>
            <label class="check-line">
              <input
                type="checkbox"
                checked={onlyOwned}
                onChange={(e) => setOnlyOwned((e.target as HTMLInputElement).checked)}
              />
              Nur eigene
            </label>
          </div>
          <ul class="item-grid">
            {list.map((item) => {
              const has = owned.has(item.id);
              const worn = appearance.equipped[item.slot] === item.id;
              const r = RARITY_INFO[item.rarity];
              return (
                <li key={item.id}>
                  <button
                    class={`item-tile ${has ? '' : 'item-locked'} ${worn ? 'item-worn' : ''} ${r.glitter ? 'item-glitter' : ''}`}
                    style={{ borderColor: r.color }}
                    onClick={() => void toggle(item)}
                    aria-label={`${has ? item.name : 'Gesperrt'}, ${r.label}${worn ? ', angezogen' : ''}`}
                    aria-pressed={worn}
                  >
                    <ItemThumb item={item} owned={has} />
                    <span class="item-rarity" style={{ color: r.color }} aria-hidden="true">
                      {r.symbol}
                    </span>
                    {worn && <span class="item-worn-mark">✓</span>}
                    <span class="item-name">{has ? item.name : '???'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
