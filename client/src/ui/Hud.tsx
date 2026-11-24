import { useEffect, useRef } from 'preact/hooks';
import { formatCurrency, GAME, keyLabel } from '@pixel/shared';
import { appState, openOverlay } from '../core/app-state';
import { bus } from '../core/bus';
import { settingsStore } from '../core/settings-store';
import { useStore } from '../core/store';
import { input } from '../input/input';
import { playSfx } from '../audio/sfx';
import { minimapCanvas } from '../game/systems/minimap';
import { missingText } from '../game/data/demo-world';
import { STATUS, starString } from '../game/portal-status';
import { Icon } from './Icon';

export function Hud() {
  const currency = useStore(appState, (s) => s.currency);
  const stars = useStore(appState, (s) => s.starsTotal);
  const showMinimap = useStore(settingsStore, (s) => s.settings.graphics.showMinimap);
  return (
    <>
      <div class="hud hud-left" role="status" aria-label="Spielstand">
        <span class="hud-item" title={GAME.currency.name}>
          <Icon name="chip" />
          <span>{formatCurrency(currency)}</span>
          <span class="sr-only">{GAME.currency.name}</span>
        </span>
        <span class="hud-item" title="Sterne">
          <span class="star-color">
            <Icon name="star" />
          </span>
          <span>{stars}</span>
          <span class="sr-only">Sterne</span>
        </span>
      </div>
      <div class="hud hud-right">
        <button
          class="btn btn-icon"
          onClick={() => (playSfx('ui'), openOverlay('wardrobe'))}
          aria-label="Garderobe öffnen"
        >
          <Icon name="hanger" />
        </button>
        <button
          class="btn btn-icon"
          onClick={() => (playSfx('ui'), openOverlay('map'))}
          aria-label="Weltkarte öffnen"
        >
          <Icon name="map" />
        </button>
        <button
          class="btn btn-icon"
          onClick={() => (playSfx('ui'), openOverlay('pause'))}
          aria-label="Menü öffnen"
        >
          <Icon name="menu" />
        </button>
      </div>
      {showMinimap && <Minimap />}
    </>
  );
}

function Minimap() {
  const version = useStore(appState, (s) => s.minimapVersion);
  const player = useStore(appState, (s) => s.playerTile);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = minimapCanvas.width;
    c.height = minimapCanvas.height;
    c.getContext('2d')!.drawImage(minimapCanvas, 0, 0);
  }, [version]);
  const w = minimapCanvas.width || 1;
  const h = minimapCanvas.height || 1;
  return (
    <button class="minimap" onClick={() => openOverlay('map')} aria-label="Weltkarte öffnen">
      <canvas ref={ref} />
      <span
        class="minimap-player"
        style={{ left: `${(player.x / w) * 100}%`, top: `${(player.y / h) * 100}%` }}
      />
    </button>
  );
}

export function PortalInfoBox() {
  const p = useStore(appState, (s) => s.nearbyPortal);
  const dialog = useStore(appState, (s) => s.dialog);
  const key = useStore(settingsStore, (s) => s.settings.controls.bindings.interact[0]);
  if (!p || dialog) return null;
  const st = STATUS[p.status];
  const stars = starString(p.stars);
  return (
    <section
      class={`panel info-box ${st.className}`}
      aria-live="polite"
      aria-label={`Portal: ${p.title}`}
    >
      <div class="info-head">
        <h3>{p.title}</h3>
        <span class="info-subject">{p.subject}</span>
      </div>
      <p>{p.description}</p>
      <p class="info-status">
        <span class={`status-icon ${st.className}`}>
          <Icon name={st.icon} />
        </span>
        <strong>{st.label}</strong>
        {p.status !== 'locked' && (
          <span class="info-stars" aria-label={stars.text}>
            {stars.visual}
          </span>
        )}
      </p>
      {p.missing.length > 0 && (
        <ul class="missing">
          {p.missing.map((m, i) => (
            <li key={i}>{missingText(m)}</li>
          ))}
        </ul>
      )}
      <button
        class="btn btn-primary"
        disabled={p.status === 'locked'}
        onClick={() => bus.emit('enterPortal')}
      >
        Betreten <kbd>{keyLabel(key)}</kbd>
      </button>
    </section>
  );
}

export function DialogBox() {
  const d = useStore(appState, (s) => s.dialog);
  const key = useStore(settingsStore, (s) => s.settings.controls.bindings.interact[0]);
  if (!d) return null;
  const last = d.index + 1 >= d.lines.length;
  return (
    <section
      class="panel dialog-box"
      role="dialog"
      aria-label={`Gespräch mit ${d.name}`}
      aria-live="polite"
    >
      <h3>{d.name}</h3>
      <p>{d.lines[d.index]}</p>
      <button class="btn btn-primary" onClick={() => input.pressVirtual('interact')}>
        {last ? 'Schließen' : 'Weiter'} <kbd>{keyLabel(key)}</kbd>
      </button>
    </section>
  );
}

export function Toasts() {
  const toasts = useStore(appState, (s) => s.toasts);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Caption() {
  const c = useStore(appState, (s) => s.caption);
  return c ? <div class="caption">{c}</div> : null;
}

export function ZoneBanner() {
  const z = useStore(appState, (s) => s.zoneBanner);
  return z ? (
    <div class="zone-banner" aria-live="polite">
      {z}
    </div>
  ) : null;
}
