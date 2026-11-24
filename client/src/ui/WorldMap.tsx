import { useEffect, useRef } from 'preact/hooks';
import { closeOverlay } from '../core/app-state';
import { appState } from '../core/app-state';
import { useStore } from '../core/store';
import { levelTitle, worldStore } from '../game/data/world';
import { STATUS } from '../game/portal-status';
import { portalMarkers, zoneRects } from '../game/scenes/HubScene';
import { minimapCanvas } from '../game/systems/minimap';
import { Icon } from './Icon';
import { Modal } from './Modal';

export function WorldMap() {
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
  const pct = (x: number, y: number) => ({ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` });
  const world = useStore(worldStore, (w) => w.state) ?? { zones: {}, levels: {}, starsTotal: 0 };

  return (
    <Modal title="Weltkarte" onClose={closeOverlay} wide>
      <div class="worldmap">
        <canvas ref={ref} />
        {zoneRects.map((z) => (
          <span
            key={z.id}
            class="worldmap-zone"
            style={pct(z.x / 16 + z.w / 32, z.y / 16 + z.h / 32)}
          >
            {z.label}
            {world.zones[z.id] && !world.zones[z.id]!.open && (
              <span class="status-icon status-locked">
                <Icon name="lock" label="gesperrt" />
              </span>
            )}
          </span>
        ))}
        {portalMarkers.map((m) => {
          const st = STATUS[world.levels[m.levelId]?.status ?? 'locked'];
          return (
            <span
              key={m.levelId}
              class={`worldmap-portal status-icon ${st.className}`}
              style={pct(m.tx + 0.5, m.ty)}
              title={`${levelTitle(m.levelId)} – ${st.label}`}
            >
              <Icon name={st.icon} label={`${levelTitle(m.levelId)}: ${st.label}`} />
            </span>
          );
        })}
        <span
          class="worldmap-player"
          style={pct(player.x + 0.5, player.y)}
          aria-label="Deine Position"
        />
      </div>
      <ul class="legend">
        {Object.values(STATUS).map((s) => (
          <li key={s.label}>
            <span class={`status-icon ${s.className}`}>
              <Icon name={s.icon} />
            </span>
            {s.label}
          </li>
        ))}
        <li>
          <span class="legend-player" /> Du
        </li>
      </ul>
    </Modal>
  );
}
