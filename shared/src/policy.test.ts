import { describe, expect, it } from 'vitest';
import { POLICIES, isValidPolicyValue, resolvePolicies } from './policy.js';

const empty = { global: {}, class: {}, groups: [], user: {} };

describe('resolvePolicies', () => {
  it('uses privacy-friendly defaults', () => {
    const p = resolvePolicies(empty);
    expect(p['multiplayer.visible']).toBe(false);
    expect(p['economy.lootboxes']).toBe(false);
    expect(p['leaderboard.enabled']).toBe(false);
    expect(p.frozen).toBe(false);
  });

  it('more specific scopes win', () => {
    const p = resolvePolicies({
      global: { 'multiplayer.visible': true },
      class: { 'multiplayer.visible': false },
      groups: [],
      user: {},
    });
    expect(p['multiplayer.visible']).toBe(false);
    const q = resolvePolicies({
      global: {},
      class: { 'economy.lootboxes': true },
      groups: [{ 'economy.lootboxes': false }],
      user: { 'economy.lootboxes': true },
    });
    expect(q['economy.lootboxes']).toBe(true);
  });

  it('conflicting groups resolve restrictively', () => {
    const p = resolvePolicies({
      ...empty,
      groups: [
        { 'multiplayer.visible': true, frozen: false },
        { 'multiplayer.visible': false, frozen: true },
      ],
    });
    expect(p['multiplayer.visible']).toBe(false);
    expect(p.frozen).toBe(true);
    const lists = resolvePolicies({
      ...empty,
      groups: [
        { 'leaderboard.criteria': ['stars', 'levels'] },
        { 'leaderboard.criteria': ['levels', 'earned'] },
      ],
    });
    expect(lists['leaderboard.criteria']).toEqual(['levels']);
  });

  it('ignores invalid stored values', () => {
    const p = resolvePolicies({
      ...empty,
      class: { 'multiplayer.visible': 'yes', 'leaderboard.criteria': ['hack'] },
    });
    expect(p['multiplayer.visible']).toBe(POLICIES['multiplayer.visible'].default);
    expect(p['leaderboard.criteria']).toEqual(['stars']);
  });

  it('validates values per key', () => {
    expect(isValidPolicyValue('frozen', true)).toBe(true);
    expect(isValidPolicyValue('frozen', 1)).toBe(false);
    expect(isValidPolicyValue('leaderboard.criteria', ['stars', 'playtime'])).toBe(true);
  });
});
