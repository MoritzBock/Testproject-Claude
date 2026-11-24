import { parseSettings, type MeResponse, type PolicyMap, type Settings } from '@pixel/shared';
import { apiHooks, get, post, put } from '../api/http';
import { appState, notify } from './app-state';
import { bus } from './bus';
import { createStore } from './store';
import { applySettingsToDocument, settingsStore } from './settings-store';
import { loadCharacter } from './character-store';
import { refreshWorld } from '../game/data/world';

export interface PublicInfo {
  schoolName: string;
  schoolContact: string;
  dpoContact: string;
  hostingInfo: string;
  privacyVersion: number;
  retention: {
    inactiveDays: number;
    attemptsDays: number;
    activityDays: number;
    selfDeleteGraceDays: number;
  };
}

export const sessionStore = createStore<{
  me: MeResponse | null;
  policies: PolicyMap | null;
  info: PublicInfo | null;
}>({ me: null, policies: null, info: null });

export const me = () => sessionStore.get().me;

/** Decides which screen comes next after loading / login / each onboarding step. */
export async function proceed(): Promise<void> {
  const m = me();
  if (!m) return appState.set({ screen: 'title', overlay: null });
  if (m.role === 'superadmin') {
    window.location.href = '/dashboard.html';
    return;
  }
  if (m.mustChangePassword || m.privacyAckRequired || m.totpSetupRequired || !m.hasCharacter) {
    return appState.set({ screen: 'onboarding', overlay: null });
  }
  await loadAccountData();
  appState.set({ overlay: null });
  bus.emit('startGame');
}

/** Settings and feature switches of the account. */
export async function loadAccountData(): Promise<void> {
  const [settings, policies] = await Promise.all([
    get<Settings>('/api/me/settings'),
    get<PolicyMap>('/api/policies/me'),
  ]);
  applyServerSettings(settings);
  sessionStore.set({ policies });
  await Promise.all([loadCharacter(), refreshWorld()]);
}

let applyingRemote = false;
function applyServerSettings(raw: unknown) {
  const s = parseSettings(raw);
  applyingRemote = true;
  settingsStore.set({ settings: s });
  applyingRemote = false;
  applySettingsToDocument(s);
}

// Push local settings changes to the account (debounced).
let timer: ReturnType<typeof setTimeout> | undefined;
settingsStore.subscribe(({ settings }) => {
  if (applyingRemote || !me()) return;
  clearTimeout(timer);
  timer = setTimeout(() => void put('/api/me/settings', settings).catch(() => {}), 800);
});

export async function initSession(): Promise<void> {
  apiHooks.onUnauthenticated = () => {
    if (!sessionStore.get().me) return;
    sessionStore.set({ me: null, policies: null });
    notify('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.', 'warning', 6000);
    bus.emit('toTitle');
  };
  try {
    sessionStore.set({ info: await get<PublicInfo>('/api/public/info') });
  } catch {
    /* offline – shown later */
  }
  try {
    sessionStore.set({ me: await get<MeResponse>('/api/auth/me') });
  } catch {
    sessionStore.set({ me: null });
  }
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout').catch(() => {});
  sessionStore.set({ me: null, policies: null });
  bus.emit('toTitle');
}
