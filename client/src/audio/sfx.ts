import { effectiveVolume } from '@pixel/shared';
import { appState } from '../core/app-state';
import { getSettings } from '../core/settings-store';

/**
 * Placeholder sound effects synthesised with Web Audio (no audio files, no licences needed).
 * Music follows in M8. Every effect has a caption for the subtitle setting.
 */
export type Sfx = 'ui' | 'confirm' | 'deny' | 'portal' | 'talk' | 'unlock';

const CAPTIONS: Record<Sfx, string | null> = {
  ui: null,
  confirm: '[Bestätigungston]',
  deny: '[Summton: nicht möglich]',
  portal: '[Portal summt]',
  talk: '[Sprechgeräusch]',
  unlock: '[Fanfare: etwas wurde freigeschaltet]',
};

type Note = { f: number; t: number; d: number; type?: OscillatorType };
const SOUNDS: Record<Sfx, Note[]> = {
  ui: [{ f: 880, t: 0, d: 0.05, type: 'square' }],
  confirm: [
    { f: 660, t: 0, d: 0.07, type: 'square' },
    { f: 990, t: 0.07, d: 0.1, type: 'square' },
  ],
  deny: [
    { f: 160, t: 0, d: 0.12, type: 'sawtooth' },
    { f: 120, t: 0.12, d: 0.16, type: 'sawtooth' },
  ],
  portal: [
    { f: 300, t: 0, d: 0.1, type: 'triangle' },
    { f: 450, t: 0.08, d: 0.1, type: 'triangle' },
    { f: 700, t: 0.16, d: 0.2, type: 'triangle' },
  ],
  talk: [{ f: 520, t: 0, d: 0.04, type: 'square' }],
  unlock: [
    { f: 523, t: 0, d: 0.1, type: 'square' },
    { f: 659, t: 0.1, d: 0.1, type: 'square' },
    { f: 784, t: 0.2, d: 0.1, type: 'square' },
    { f: 1047, t: 0.3, d: 0.25, type: 'square' },
  ],
};

let ctx: AudioContext | null = null;
let captionTimer: ReturnType<typeof setTimeout> | undefined;

/** Browsers (esp. iOS Safari) only allow audio after a user gesture. */
export function unlockAudio(): void {
  if (!ctx && typeof AudioContext !== 'undefined') ctx = new AudioContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}

export function playSfx(name: Sfx): void {
  const s = getSettings();
  const caption = CAPTIONS[name];
  if (caption && s.a11y.subtitles) {
    appState.set({ caption });
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => appState.set({ caption: null }), 2000);
  }
  const vol = effectiveVolume(s, 'sfx') * 0.15;
  if (!ctx || vol <= 0) return;
  const now = ctx.currentTime;
  for (const n of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'square';
    osc.frequency.value = n.f;
    gain.gain.setValueAtTime(vol, now + n.t);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.02);
  }
}
