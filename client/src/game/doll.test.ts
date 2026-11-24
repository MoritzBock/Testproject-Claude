import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '@pixel/shared';
import { hasGlitter, layerStack } from './doll';

describe('paper doll layer stack', () => {
  const a = {
    skinTone: 1,
    equipped: { ...DEFAULT_EQUIPMENT, back: 'back-cape-red', hat: 'hat-cap-red' },
  };
  it('puts back items behind the body except when facing up', () => {
    expect(layerStack(a, false)[0]!.slot).toBe('back');
    expect(layerStack(a, false)[1]!.slot).toBe('body');
    expect(layerStack(a, true).at(-1)!.slot).toBe('back');
  });
  it('draws the hat last when facing the camera', () => {
    expect(layerStack(a, false).at(-1)!.slot).toBe('hat');
  });
  it('only epic+ items glitter', () => {
    expect(hasGlitter(a)).toBe(false);
    expect(hasGlitter({ ...a, equipped: { ...a.equipped, hat: 'hat-crown-gold' } })).toBe(true);
  });
});
