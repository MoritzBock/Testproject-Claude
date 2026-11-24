import type { LevelStatus, Missing } from '@pixel/shared';
import { createStore } from './store';

export type Screen = 'loading' | 'title' | 'login' | 'onboarding' | 'game';
export type Overlay = null | 'pause' | 'settings' | 'map' | 'privacy' | 'credits' | 'level';

export interface PortalInfo {
  levelId: string;
  title: string;
  subject: string;
  description: string;
  status: LevelStatus;
  stars: number;
  missing: Missing[];
}

export interface DialogState {
  name: string;
  lines: string[];
  index: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warning';
}

export interface AppState {
  screen: Screen;
  overlay: Overlay;
  /** Where to return after closing the settings overlay. */
  settingsReturn: Overlay;
  loadProgress: number;
  currency: number;
  starsTotal: number;
  nearbyPortal: PortalInfo | null;
  nearbyNpc: string | null;
  dialog: DialogState | null;
  activeLevel: PortalInfo | null;
  toasts: Toast[];
  caption: string | null;
  zoneBanner: string | null;
  /** Bumped whenever the minimap image must be redrawn. */
  minimapVersion: number;
  /** Player position in tiles (for minimap/world map). */
  playerTile: { x: number; y: number };
  touchActive: boolean;
}

export const appState = createStore<AppState>({
  screen: 'loading',
  overlay: null,
  settingsReturn: null,
  loadProgress: 0,
  currency: 0,
  starsTotal: 0,
  nearbyPortal: null,
  nearbyNpc: null,
  dialog: null,
  activeLevel: null,
  toasts: [],
  caption: null,
  zoneBanner: null,
  minimapVersion: 0,
  playerTile: { x: 0, y: 0 },
  touchActive: false,
});

let toastId = 0;
export function notify(text: string, kind: Toast['kind'] = 'info', ms = 4000): void {
  const id = ++toastId;
  appState.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => appState.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function openOverlay(overlay: Overlay): void {
  appState.set({ overlay });
}

export function openSettings(): void {
  appState.set((s) => ({ overlay: 'settings', settingsReturn: s.overlay }));
}

export function closeOverlay(): void {
  appState.set((s) =>
    s.overlay === 'settings'
      ? { overlay: s.settingsReturn, settingsReturn: null }
      : { overlay: null },
  );
}
