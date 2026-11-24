import { describe, expect, it } from 'vitest';
import { facing, normalizeMove } from './move';

describe('normalizeMove', () => {
  it('ignores tiny stick drift', () => {
    expect(normalizeMove(0.1, 0.05)).toEqual({ x: 0, y: 0 });
  });
  it('does not make diagonals faster', () => {
    const v = normalizeMove(1, 1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
  it('keeps analog values below 1', () => {
    expect(normalizeMove(0.5, 0)).toEqual({ x: 0.5, y: 0 });
  });
});

describe('facing', () => {
  it('picks the dominant axis', () => {
    expect(facing(1, 0.2)).toBe('right');
    expect(facing(-0.2, -1)).toBe('up');
    expect(facing(0, 0)).toBeNull();
  });
});
