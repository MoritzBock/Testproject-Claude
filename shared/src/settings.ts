import { z } from 'zod';
import { ACTIONS, DEFAULT_BINDINGS, cloneBindings, type Bindings } from './keybindings.js';

const volume = z.number().min(0).max(1);
const keyCode = z
  .string()
  .regex(/^[A-Za-z0-9]{1,24}$/)
  .nullable();

const BindingsSchema = z.object(
  Object.fromEntries(ACTIONS.map((a) => [a, z.tuple([keyCode, keyCode])])) as Record<
    (typeof ACTIONS)[number],
    z.ZodTuple<[typeof keyCode, typeof keyCode]>
  >,
);

export const TEXT_SCALES = [1, 1.25, 1.5, 1.75] as const;
export const PIXEL_SCALES = ['auto', 1, 2, 3, 4, 5, 6] as const;

export const SettingsSchema = z.object({
  version: z.literal(1),
  audio: z.object({ master: volume, music: volume, sfx: volume, muted: z.boolean() }),
  controls: z.object({
    bindings: BindingsSchema,
    touchControls: z.enum(['auto', 'on', 'off']),
  }),
  graphics: z.object({
    pixelScale: z.union([z.literal('auto'), z.number().int().min(1).max(6)]),
    screenShake: z.boolean(),
    effects: z.boolean(),
    showMinimap: z.boolean(),
  }),
  a11y: z.object({
    textScale: z.union(TEXT_SCALES.map((s) => z.literal(s)) as unknown as [z.ZodLiteral<1>]),
    reducedMotion: z.boolean(),
    colorblindMarkers: z.boolean(),
    subtitles: z.boolean(),
  }),
});
export type Settings = z.infer<typeof SettingsSchema> & {
  controls: { bindings: Bindings };
  a11y: { textScale: (typeof TEXT_SCALES)[number] };
};

export function defaultSettings(opts: { prefersReducedMotion?: boolean } = {}): Settings {
  return {
    version: 1,
    audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false },
    controls: { bindings: cloneBindings(DEFAULT_BINDINGS), touchControls: 'auto' },
    graphics: { pixelScale: 'auto', screenShake: true, effects: true, showMinimap: true },
    a11y: {
      textScale: 1,
      reducedMotion: opts.prefersReducedMotion ?? false,
      colorblindMarkers: false,
      subtitles: false,
    },
  };
}

/**
 * Parses untrusted settings (local storage now, server later). Unknown or broken
 * sections fall back to defaults per section instead of discarding everything.
 */
export function parseSettings(input: unknown, defaults: Settings = defaultSettings()): Settings {
  const full = SettingsSchema.safeParse(input);
  if (full.success) return full.data as Settings;
  if (typeof input !== 'object' || input === null) return defaults;
  const raw = input as Record<string, unknown>;
  const shape = SettingsSchema.shape;
  const pick = <K extends 'audio' | 'controls' | 'graphics' | 'a11y'>(key: K): Settings[K] => {
    const r = shape[key].safeParse(raw[key]);
    return (r.success ? r.data : defaults[key]) as Settings[K];
  };
  return {
    version: 1,
    audio: pick('audio'),
    controls: pick('controls'),
    graphics: pick('graphics'),
    a11y: pick('a11y'),
  };
}

/** Effective volume (0..1) for a channel, considering master volume and mute. */
export function effectiveVolume(s: Settings, channel: 'music' | 'sfx'): number {
  if (s.audio.muted) return 0;
  return s.audio.master * s.audio[channel];
}
