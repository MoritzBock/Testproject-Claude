import { describe, expect, it } from 'vitest';
import { normalizeText, pointsFor, starsFor } from './tasks.js';

describe('stars and points', () => {
  it('computes stars from thresholds', () => {
    const t = [0.5, 0.75, 0.95] as const;
    expect(starsFor(0.49, t)).toBe(0);
    expect(starsFor(0.5, t)).toBe(1);
    expect(starsFor(0.8, t)).toBe(2);
    expect(starsFor(1, t)).toBe(3);
  });
  it('reduces points for later attempts and hints', () => {
    expect(pointsFor(10, 1, 1, 0)).toBe(10);
    expect(pointsFor(10, 1, 2, 0)).toBe(6);
    expect(pointsFor(10, 1, 1, 1)).toBe(8);
    expect(pointsFor(10, 0.5, 1, 0)).toBe(5);
    expect(pointsFor(10, 1, 1, 9)).toBe(4); // hint penalty is capped
  });
  it('normalises free text', () => {
    expect(normalizeText('  Hallo   Welt ')).toBe('hallo welt');
    expect(normalizeText(' A ', true)).toBe('A');
  });
});
