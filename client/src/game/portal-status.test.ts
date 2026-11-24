import { describe, expect, it } from 'vitest';
import { STATUS, starString } from './portal-status';

describe('portal status presentation', () => {
  it('uses a distinct icon for every status (not colour only)', () => {
    const icons = Object.values(STATUS).map((s) => s.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
  it('renders stars visually and as text, clamped to 0..3', () => {
    expect(starString(2)).toEqual({ visual: '★★☆', text: '2 von 3 Sternen' });
    expect(starString(7).visual).toBe('★★★');
    expect(starString(-1).visual).toBe('☆☆☆');
  });
});
