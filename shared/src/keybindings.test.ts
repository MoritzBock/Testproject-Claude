import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BINDINGS,
  assignKey,
  clearKey,
  findConflicts,
  keyLabel,
  missingRequired,
} from './keybindings.js';

describe('keybindings', () => {
  it('default bindings have no conflicts and no missing actions', () => {
    expect(findConflicts(DEFAULT_BINDINGS)).toEqual([]);
    expect(missingRequired(DEFAULT_BINDINGS)).toEqual([]);
  });

  it('assigning a free key just sets it', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'map', 1, 'Tab');
    expect(r.bindings.map).toEqual(['KeyM', 'Tab']);
    expect(r.swappedWith).toBeUndefined();
    expect(DEFAULT_BINDINGS.map[1]).toBeNull(); // input not mutated
  });

  it('assigning a used key swaps the slots and leaves no conflict', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'interact', 0, 'KeyW');
    expect(r.bindings.interact[0]).toBe('KeyW');
    expect(r.bindings.up[0]).toBe('KeyE');
    expect(r.swappedWith).toEqual({ action: 'up', slot: 0, previousCode: 'KeyE' });
    expect(findConflicts(r.bindings)).toEqual([]);
  });

  it('swapping within the same action does not duplicate the key', () => {
    const r = assignKey(DEFAULT_BINDINGS, 'up', 0, 'ArrowUp');
    expect(findConflicts(r.bindings)).toEqual([]);
    expect(r.bindings.up).toContain('ArrowUp');
  });

  it('detects conflicts in hand-edited bindings', () => {
    const broken = { ...DEFAULT_BINDINGS, map: ['KeyW', null] as [string, null] };
    expect(findConflicts(broken)).toEqual([
      {
        code: 'KeyW',
        slots: [
          { action: 'up', slot: 0 },
          { action: 'map', slot: 0 },
        ],
      },
    ]);
  });

  it('reports required actions without any key', () => {
    let b = clearKey(DEFAULT_BINDINGS, 'interact', 0);
    b = clearKey(b, 'interact', 1);
    expect(missingRequired(b)).toEqual(['interact']);
  });

  it('renders readable key names', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Space')).toBe('Leertaste');
    expect(keyLabel(null)).toBe('—');
  });
});
