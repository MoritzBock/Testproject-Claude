import { useEffect, useRef, useState } from 'preact/hooks';
import { GAME, RARITY_INFO, getItem, type Rarity } from '@pixel/shared';
import { get, post } from '../api/http';
import { appState, closeOverlay, notify } from '../core/app-state';
import { loadCharacter } from '../core/character-store';
import { getSettings } from '../core/settings-store';
import { playSfx } from '../audio/sfx';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { RarityBadge } from './Wardrobe';
import { renderItemThumb } from './doll-render';

interface ShopData {
  shopEnabled: boolean;
  lootboxesEnabled: boolean;
  balance: number;
  items: Array<{ itemId: string; price: number; owned: boolean }>;
  boxes: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    chances: Array<{ rarity: Rarity; percent: number; items: number }>;
    pity: { after: number; minRarity: Rarity; counter: number };
  }>;
  pendingBoxes: Array<{ id: number; boxId: string }>;
}

interface OpenResult {
  itemId: string;
  rarity: Rarity;
  duplicate: boolean;
  converted: number;
  pityTriggered: boolean;
  balance: number;
  achievements: string[];
}

function Thumb({ itemId }: { itemId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const item = getItem(itemId)!;
  useEffect(() => {
    if (ref.current) renderItemThumb(ref.current, item.layer, item.tint, 3);
  }, [itemId]);
  return <canvas ref={ref} class="item-thumb" aria-hidden="true" />;
}

export function Shop() {
  const [data, setData] = useState<ShopData | null>(null);
  const [tab, setTab] = useState<'items' | 'boxes'>('items');
  const [opening, setOpening] = useState<{ boxName: string; result: OpenResult } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    get<ShopData>('/api/shop')
      .then((d) => {
        setData(d);
        appState.set({ currency: d.balance });
      })
      .catch((e: Error) => notify(e.message, 'warning'));
  useEffect(() => void load(), []);

  if (!data) return <Modal title="Byte-Basar">Lade …</Modal>;

  const buy = async (itemId: string) => {
    setBusy(true);
    try {
      const r = await post<{ name: string; balance: number }>('/api/shop/buy', { itemId });
      playSfx('confirm');
      notify(`${r.name} gekauft – jetzt in deiner Garderobe.`, 'success');
      await Promise.all([load(), loadCharacter()]);
    } catch (e) {
      playSfx('deny');
      notify(e instanceof Error ? e.message : 'Fehler', 'warning');
    } finally {
      setBusy(false);
    }
  };

  const open = async (boxId: string, pendingId?: number) => {
    setBusy(true);
    try {
      const result = await post<OpenResult>(
        `/api/shop/boxes/${boxId}/open`,
        pendingId ? { pendingId } : {},
      );
      setOpening({ boxName: data.boxes.find((b) => b.id === boxId)?.name ?? 'Box', result });
      await Promise.all([load(), loadCharacter()]);
    } catch (e) {
      playSfx('deny');
      notify(e instanceof Error ? e.message : 'Fehler', 'warning');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Byte-Basar" onClose={closeOverlay} wide>
      <p class="shop-balance">
        <Icon name="chip" /> {data.balance} {GAME.currency.name}
        <span class="note">
          {' '}
          · Bytes verdienst du nur durch Lernfortschritt. Es gibt kein Echtgeld und keinen Handel.
        </span>
      </p>
      <div class="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'items'}
          class={`tab ${tab === 'items' ? 'tab-active' : ''}`}
          onClick={() => setTab('items')}
        >
          Angebote des Tages
        </button>
        <button
          role="tab"
          aria-selected={tab === 'boxes'}
          class={`tab ${tab === 'boxes' ? 'tab-active' : ''}`}
          onClick={() => setTab('boxes')}
        >
          Lootboxen {data.pendingBoxes.length > 0 && `(${data.pendingBoxes.length} Geschenk)`}
        </button>
      </div>

      {tab === 'items' &&
        (data.shopEnabled ? (
          <>
            <ul class="item-grid shop-grid">
              {data.items.map((s) => {
                const item = getItem(s.itemId)!;
                const r = RARITY_INFO[item.rarity];
                return (
                  <li key={s.itemId} class="shop-item" style={{ borderColor: r.color }}>
                    <Thumb itemId={s.itemId} />
                    <strong>{item.name}</strong>
                    <RarityBadge rarity={item.rarity} />
                    <button
                      class="btn btn-small btn-primary"
                      disabled={busy || s.owned || data.balance < s.price}
                      onClick={() => void buy(s.itemId)}
                    >
                      {s.owned ? 'Im Besitz' : `${s.price} B kaufen`}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p class="note">Das Angebot wechselt jeden Tag.</p>
          </>
        ) : (
          <p class="hint-box">Der Shop ist gerade geschlossen.</p>
        ))}

      {tab === 'boxes' && (
        <div class="boxes">
          {data.pendingBoxes.length > 0 && (
            <div class="hint-box">
              <strong>Geschenke deiner Lehrkraft:</strong>
              <div class="menu-row">
                {data.pendingBoxes.map((p) => (
                  <button
                    key={p.id}
                    class="btn btn-primary"
                    disabled={busy}
                    onClick={() => void open(p.boxId, p.id)}
                  >
                    {data.boxes.find((b) => b.id === p.boxId)?.name} öffnen
                  </button>
                ))}
              </div>
            </div>
          )}
          {!data.lootboxesEnabled ? (
            <p class="hint-box">
              Lootboxen sind für deine Klasse nicht aktiviert. Im Shop gibt es feste Angebote.
            </p>
          ) : (
            data.boxes.map((b) => (
              <section key={b.id} class="box-card panel">
                <div class="box-head">
                  <h3>{b.name}</h3>
                  <button
                    class="btn btn-primary"
                    disabled={busy || data.balance < b.price}
                    onClick={() => void open(b.id)}
                  >
                    Öffnen für {b.price} B
                  </button>
                </div>
                <p>{b.description}</p>
                <table class="chances">
                  <caption>Wahrscheinlichkeiten pro Box</caption>
                  <tbody>
                    {b.chances.map((c) => (
                      <tr key={c.rarity}>
                        <th scope="row" style={{ color: RARITY_INFO[c.rarity].color }}>
                          {RARITY_INFO[c.rarity].symbol} {RARITY_INFO[c.rarity].label}
                        </th>
                        <td>{c.percent.toLocaleString('de-DE')} %</td>
                        <td class="note">{c.items} Gegenstände</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p class="note">
                  Garantie: Spätestens jede {b.pity.after}. Box enthält mindestens „
                  {RARITY_INFO[b.pity.minRarity].label}“ (noch {b.pity.after - b.pity.counter}).
                  Doppelte Gegenstände werden in Bytes umgewandelt.
                </p>
              </section>
            ))
          )}
        </div>
      )}
      {opening && <BoxReveal {...opening} onDone={() => setOpening(null)} />}
    </Modal>
  );
}

function BoxReveal({
  boxName,
  result,
  onDone,
}: {
  boxName: string;
  result: OpenResult;
  onDone: () => void;
}) {
  const instant = getSettings().a11y.reducedMotion;
  const [revealed, setRevealed] = useState(instant);
  useEffect(() => {
    if (revealed) {
      playSfx(RARITY_INFO[result.rarity].glitter ? 'unlock' : 'confirm');
      return;
    }
    const t = setTimeout(() => setRevealed(true), 1600);
    return () => clearTimeout(t);
  }, [revealed]);
  const item = getItem(result.itemId)!;
  const r = RARITY_INFO[result.rarity];
  return (
    <div class="reveal" role="dialog" aria-label={`${boxName} wird geöffnet`}>
      {!revealed ? (
        <>
          <div class="reveal-box" aria-hidden="true">
            ?
          </div>
          <p>{boxName} wird geöffnet …</p>
          <button class="btn" onClick={() => setRevealed(true)}>
            Animation überspringen
          </button>
        </>
      ) : (
        <>
          <div
            class={`reveal-item ${r.glitter ? 'item-glitter' : ''}`}
            style={{ borderColor: r.color }}
          >
            <Thumb itemId={result.itemId} />
          </div>
          <h3 style={{ color: r.color }}>
            {r.symbol} {item.name}
          </h3>
          <RarityBadge rarity={result.rarity} />
          {result.duplicate ? (
            <p>
              Schon vorhanden – umgewandelt in +{result.converted} {GAME.currency.name}.
            </p>
          ) : (
            <p>Neu in deiner Garderobe!</p>
          )}
          {result.pityTriggered && <p class="note">Garantie-Box: mindestens „Selten“.</p>}
          <button class="btn btn-primary" onClick={onDone}>
            Weiter
          </button>
        </>
      )}
    </div>
  );
}
