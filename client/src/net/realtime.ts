import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, EmoteId, PolicyMap, PresencePlayer, ServerEvents } from '@pixel/shared';
import { get, post } from '../api/http';
import { appState, notify } from '../core/app-state';
import { loadCharacter } from '../core/character-store';
import { logout, sessionStore } from '../core/session';
import { createStore } from '../core/store';
import { refreshWorld } from '../game/data/world';
import { playSfx } from '../audio/sfx';

/** Other players currently visible (memory only). */
export const presenceStore = createStore<{ players: PresencePlayer[] }>({ players: [] });
export const realtimeEvents = {
  onTeleport: (_x: number, _y: number) => {},
};

let socket: Socket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

export function connectRealtime(): void {
  if (socket) return;
  socket = io({ path: '/socket.io', transports: ['websocket', 'polling'], withCredentials: true });
  socket.on('presence', (p: ServerEvents['presence']) => presenceStore.set({ players: p.players }));
  socket.on('teleport', (t: ServerEvents['teleport']) => {
    realtimeEvents.onTeleport(t.x, t.y);
    notify('Deine Lehrkraft hat dich zu sich geholt.', 'info');
  });
  socket.on('frozen', (f: ServerEvents['frozen']) => {
    appState.set({ frozen: f.frozen });
    if (f.frozen) notify('Deine Lehrkraft hat das Spiel kurz angehalten.', 'warning', 6000);
  });
  socket.on('announce', (a: ServerEvents['announce']) => {
    playSfx('unlock');
    appState.set({ announcement: { text: a.text, from: a.from } });
  });
  socket.on('refresh', (r: ServerEvents['refresh']) => {
    if (r.what.includes('world') || r.what.includes('wallet')) void refreshWorld().catch(() => {});
    if (r.what.includes('character')) void loadCharacter().catch(() => {});
    if (r.what.includes('policies'))
      void get<PolicyMap>('/api/policies/me')
        .then((policies) => sessionStore.set({ policies }))
        .catch(() => {});
  });
  socket.on('kicked', (k: ServerEvents['kicked']) => {
    notify(k.reason, 'warning', 8000);
    void logout();
  });
  // Online time: one heartbeat per minute while the game is visible (minutes per day only).
  heartbeat = setInterval(() => {
    if (document.visibilityState === 'visible' && appState.get().screen === 'game')
      void post('/api/heartbeat').catch(() => {});
  }, 60_000);
  void post('/api/heartbeat').catch(() => {});
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  presenceStore.set({ players: [] });
}

let lastSent = '';
export function sendMove(x: number, y: number, frame: number): void {
  const key = `${Math.round(x)}|${Math.round(y)}|${frame}`;
  if (!socket?.connected || key === lastSent) return;
  lastSent = key;
  socket.emit('move', { x, y, frame } satisfies ClientEvents['move']);
}

export function sendEmote(id: EmoteId): void {
  socket?.emit('emote', { id } satisfies ClientEvents['emote']);
}
