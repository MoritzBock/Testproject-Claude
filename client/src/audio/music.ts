import { effectiveVolume } from '@pixel/shared';
import { getSettings, settingsStore } from '../core/settings-store';
import { audioContext } from './sfx';

/**
 * Placeholder chiptune music, synthesised with Web Audio (own compositions – no files,
 * no licences). Each track is a short loop: melody (square), bass (triangle), hi-hat (noise).
 * Notes are semitones relative to A4 (0 = 440 Hz); null = rest. One step = 1/8 note.
 */
export type TrackId =
  'title' | 'campus' | 'platinenwald' | 'datenstrand' | 'serverberg' | 'shop' | 'level';

interface Track {
  bpm: number;
  melody: Array<number | null>;
  bass: Array<number | null>;
  hat: string; // 'x' = hit, '.' = rest (per step)
  melodyType?: OscillatorType;
}

const _ = null;
export const TRACKS: Record<TrackId, Track> = {
  title: {
    bpm: 104,
    melody: [
      3,
      _,
      7,
      _,
      10,
      _,
      7,
      _,
      5,
      _,
      8,
      _,
      12,
      _,
      8,
      _,
      3,
      _,
      7,
      _,
      10,
      12,
      10,
      _,
      8,
      7,
      5,
      _,
      3,
      _,
      _,
      _,
    ],
    bass: [
      -21,
      _,
      _,
      _,
      -21,
      _,
      _,
      _,
      -16,
      _,
      _,
      _,
      -16,
      _,
      _,
      _,
      -21,
      _,
      _,
      _,
      -21,
      _,
      _,
      _,
      -14,
      _,
      _,
      _,
      -16,
      _,
      _,
      _,
    ],
    hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.xxx',
  },
  campus: {
    bpm: 112,
    melody: [
      0,
      _,
      4,
      _,
      7,
      _,
      4,
      _,
      5,
      _,
      9,
      _,
      7,
      _,
      _,
      _,
      4,
      _,
      7,
      _,
      12,
      _,
      11,
      _,
      9,
      _,
      7,
      _,
      4,
      _,
      _,
      _,
    ],
    bass: [
      -24,
      _,
      -12,
      _,
      -24,
      _,
      -12,
      _,
      -19,
      _,
      -7,
      _,
      -19,
      _,
      -7,
      _,
      -21,
      _,
      -9,
      _,
      -21,
      _,
      -9,
      _,
      -17,
      _,
      -5,
      _,
      -19,
      _,
      -7,
      _,
    ],
    hat: '..x...x...x...x...x...x...x...xx',
  },
  platinenwald: {
    bpm: 92,
    melody: [
      -3,
      _,
      _,
      0,
      2,
      _,
      0,
      _,
      -3,
      _,
      _,
      _,
      -5,
      _,
      _,
      _,
      -3,
      _,
      0,
      _,
      4,
      _,
      2,
      _,
      0,
      _,
      -3,
      _,
      -1,
      _,
      _,
      _,
    ],
    bass: [
      -27,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      -24,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      -22,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      -20,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
    ],
    hat: 'x.......x.......x.......x...x...',
    melodyType: 'triangle',
  },
  datenstrand: {
    bpm: 120,
    melody: [
      7,
      9,
      7,
      _,
      4,
      _,
      2,
      _,
      4,
      _,
      7,
      _,
      9,
      _,
      _,
      _,
      12,
      11,
      9,
      _,
      7,
      _,
      4,
      _,
      2,
      _,
      4,
      _,
      0,
      _,
      _,
      _,
    ],
    bass: [
      -17,
      _,
      -5,
      _,
      -17,
      _,
      -5,
      _,
      -15,
      _,
      -3,
      _,
      -15,
      _,
      -3,
      _,
      -20,
      _,
      -8,
      _,
      -20,
      _,
      -8,
      _,
      -19,
      _,
      -7,
      _,
      -24,
      _,
      -12,
      _,
    ],
    hat: 'x.x.xxx.x.x.xxx.x.x.xxx.x.x.xxxx',
  },
  serverberg: {
    bpm: 132,
    melody: [
      0,
      0,
      3,
      _,
      0,
      _,
      7,
      _,
      6,
      _,
      3,
      _,
      0,
      _,
      _,
      _,
      0,
      0,
      3,
      _,
      0,
      _,
      10,
      _,
      8,
      _,
      7,
      _,
      3,
      _,
      _,
      _,
    ],
    bass: [
      -24,
      -24,
      _,
      -24,
      -24,
      _,
      -24,
      _,
      -21,
      -21,
      _,
      -21,
      -21,
      _,
      -21,
      _,
      -26,
      -26,
      _,
      -26,
      -26,
      _,
      -26,
      _,
      -17,
      -17,
      _,
      -17,
      -19,
      _,
      -21,
      _,
    ],
    hat: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    melodyType: 'sawtooth',
  },
  shop: {
    bpm: 126,
    melody: [
      12,
      _,
      9,
      _,
      5,
      _,
      9,
      _,
      10,
      _,
      7,
      _,
      4,
      _,
      7,
      _,
      9,
      _,
      5,
      _,
      0,
      _,
      5,
      _,
      7,
      9,
      10,
      _,
      12,
      _,
      _,
      _,
    ],
    bass: [
      -19,
      _,
      _,
      -7,
      -19,
      _,
      _,
      -7,
      -14,
      _,
      _,
      -2,
      -14,
      _,
      _,
      -2,
      -19,
      _,
      _,
      -7,
      -19,
      _,
      _,
      -7,
      -17,
      _,
      _,
      -5,
      -12,
      _,
      _,
      _,
    ],
    hat: '..x...x...x...x...x...x...x.x.x.',
  },
  level: {
    bpm: 96,
    melody: [
      _,
      _,
      7,
      _,
      _,
      _,
      5,
      _,
      _,
      _,
      3,
      _,
      _,
      _,
      2,
      _,
      _,
      _,
      3,
      _,
      _,
      _,
      5,
      _,
      _,
      _,
      7,
      _,
      _,
      _,
      _,
      _,
    ],
    bass: [
      -21,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      -23,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      -24,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      -19,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
    ],
    hat: 'x...............x...............',
    melodyType: 'triangle',
  },
};

const freq = (semi: number) => 440 * 2 ** (semi / 12);

class MusicPlayer {
  private current: TrackId | null = null;
  private wanted: TrackId | null = null;
  private gain: GainNode | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer | null = null;

  constructor() {
    settingsStore.subscribe(() => this.applyVolume());
  }

  private volume(): number {
    return effectiveVolume(getSettings(), 'music') * 0.12;
  }

  private applyVolume(): void {
    const ctx = audioContext();
    if (this.gain && ctx) this.gain.gain.setTargetAtTime(this.volume(), ctx.currentTime, 0.1);
  }

  /** Switch to a track (cross-fade). Safe to call every frame. */
  play(id: TrackId | null): void {
    this.wanted = id;
    if (id === this.current) return;
    const ctx = audioContext();
    if (!ctx) return; // starts once audio is unlocked by a user gesture
    const old = this.gain;
    if (old) {
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => old.disconnect(), 1500);
    }
    this.current = id;
    if (!id) {
      this.stopTimer();
      return;
    }
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.gain.setTargetAtTime(this.volume(), ctx.currentTime, 0.4);
    this.gain.connect(ctx.destination);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  /** Retry after audio unlock. */
  resume(): void {
    const w = this.wanted;
    this.current = null;
    this.play(w);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const ctx = audioContext();
    if (!ctx || !this.current || !this.gain) return;
    const t = TRACKS[this.current];
    const stepDur = 60 / t.bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const i = this.step % t.melody.length;
      const m = t.melody[i];
      const b = t.bass[i % t.bass.length];
      if (m !== null && m !== undefined)
        this.tone(ctx, freq(m), this.nextTime, stepDur * 0.9, t.melodyType ?? 'square', 0.5);
      if (b !== null && b !== undefined)
        this.tone(ctx, freq(b), this.nextTime, stepDur * 1.6, 'triangle', 0.9);
      if (t.hat[i % t.hat.length] === 'x') this.hat(ctx, this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private tone(
    ctx: AudioContext,
    f: number,
    at: number,
    dur: number,
    type: OscillatorType,
    level: number,
  ): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(this.gain!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private hat(ctx: AudioContext, at: number): void {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const g = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    g.gain.setValueAtTime(0.25, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
    s.connect(hp).connect(g).connect(this.gain!);
    s.start(at);
  }
}

export const music = new MusicPlayer();
