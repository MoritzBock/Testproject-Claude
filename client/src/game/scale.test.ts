import { describe, expect, it } from 'vitest';
import { computeViewport, integerZoom } from './scale';

const base = { width: 480, height: 270 };

describe('integerZoom', () => {
  it('picks the largest integer factor that fits', () => {
    expect(integerZoom(1920, 1080, 480, 270)).toBe(4);
    expect(integerZoom(1366, 768, 480, 270)).toBe(2);
  });
  it('never goes below 1', () => {
    expect(integerZoom(320, 200, 480, 270)).toBe(1);
  });
});

describe('computeViewport', () => {
  it('Full HD desktop: 4× zoom showing exactly the base resolution', () => {
    expect(computeViewport(1920, 1080, 1, base, 'auto')).toEqual({
      gameW: 480,
      gameH: 270,
      deviceZoom: 4,
      cssZoom: 4,
    });
  });
  it('school laptop 1366×768: rounds to 3× (close to the base view)', () => {
    const v = computeViewport(1366, 768, 1, base, 'auto');
    expect(v.deviceZoom).toBe(3);
    expect(v.gameW).toBe(455);
  });
  it('phone in landscape (dpr 3) scales in device pixels and keeps characters large', () => {
    const v = computeViewport(750, 342, 3, base, 'auto');
    expect(v.deviceZoom).toBe(4);
    expect(v.gameH).toBeLessThanOrEqual(270);
    expect(v.gameW * v.cssZoom).toBeLessThanOrEqual(750);
    expect(Number.isInteger(v.deviceZoom)).toBe(true);
  });
  it('clamps a manual scale that would be too large', () => {
    expect(computeViewport(1366, 768, 1, base, 6).deviceZoom).toBe(5);
    expect(computeViewport(1366, 768, 1, base, 1).deviceZoom).toBe(1);
  });
});
