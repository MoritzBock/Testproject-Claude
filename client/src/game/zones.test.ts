import { describe, expect, it } from 'vitest';
import { zoneAt } from './zones';

const zones = [
  { id: 'a', label: 'A', x: 0, y: 0, w: 10, h: 10 },
  { id: 'b', label: 'B', x: 10, y: 0, w: 10, h: 10 },
];

describe('zoneAt', () => {
  it('finds the containing zone with exclusive right/bottom edges', () => {
    expect(zoneAt(zones, 5, 5)?.id).toBe('a');
    expect(zoneAt(zones, 10, 0)?.id).toBe('b');
    expect(zoneAt(zones, 25, 5)).toBeNull();
  });
});
