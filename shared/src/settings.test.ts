import { describe, expect, it } from 'vitest';
import { defaultSettings, effectiveVolume, parseSettings } from './settings.js';

describe('settings', () => {
  it('accepts valid settings', () => {
    const s = defaultSettings();
    expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('falls back to defaults for garbage', () => {
    expect(parseSettings('nope')).toEqual(defaultSettings());
    expect(parseSettings(null)).toEqual(defaultSettings());
  });

  it('keeps valid sections when one section is broken', () => {
    const s = defaultSettings();
    s.audio.master = 0.3;
    const raw = { ...JSON.parse(JSON.stringify(s)), graphics: { pixelScale: 99 } };
    const parsed = parseSettings(raw);
    expect(parsed.audio.master).toBe(0.3);
    expect(parsed.graphics).toEqual(defaultSettings().graphics);
  });

  it('rejects out-of-range volume and injected key codes', () => {
    const s = JSON.parse(JSON.stringify(defaultSettings()));
    s.audio.master = 5;
    s.controls.bindings.up[0] = '<script>';
    const parsed = parseSettings(s);
    expect(parsed.audio).toEqual(defaultSettings().audio);
    expect(parsed.controls).toEqual(defaultSettings().controls);
  });

  it('computes effective volume with mute', () => {
    const s = defaultSettings();
    s.audio.master = 0.5;
    s.audio.sfx = 0.5;
    expect(effectiveVolume(s, 'sfx')).toBe(0.25);
    s.audio.muted = true;
    expect(effectiveVolume(s, 'sfx')).toBe(0);
  });

  it('respects the reduced-motion preference for defaults', () => {
    expect(defaultSettings({ prefersReducedMotion: true }).a11y.reducedMotion).toBe(true);
  });
});
