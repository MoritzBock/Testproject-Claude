import { defaultSettings, parseSettings, type Settings } from '@pixel/shared';
import { createStore } from './store';

// Before login, settings are kept in this browser only (no personal data, no tokens);
// after login they are loaded from and saved to the account (core/session.ts).
// This storage holds no personal data and no tokens.
const KEY = 'pixel-lernwelt.settings.v1';

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function load(): Settings {
  const defaults = defaultSettings({ prefersReducedMotion: prefersReducedMotion() });
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSettings(JSON.parse(raw), defaults) : defaults;
  } catch {
    return defaults;
  }
}

export const settingsStore = createStore<{ settings: Settings }>({ settings: load() });

export function getSettings(): Settings {
  return settingsStore.get().settings;
}

export function updateSettings(mutate: (s: Settings) => void): void {
  const next = structuredClone(getSettings());
  mutate(next);
  settingsStore.set({ settings: next });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode) – settings stay for this session */
  }
  applySettingsToDocument(next);
}

export function resetSettings(): void {
  updateSettings((s) =>
    Object.assign(s, defaultSettings({ prefersReducedMotion: prefersReducedMotion() })),
  );
}

export function applySettingsToDocument(s: Settings): void {
  const root = document.documentElement;
  root.style.setProperty('--text-scale', String(s.a11y.textScale));
  root.classList.toggle('reduced-motion', s.a11y.reducedMotion);
  root.classList.toggle('cb-markers', s.a11y.colorblindMarkers);
}
