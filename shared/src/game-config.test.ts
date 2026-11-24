import { describe, expect, it } from 'vitest';
import { formatCurrency, GAME } from './game-config.js';

describe('formatCurrency', () => {
  it('formats with German thousands separator and currency short name', () => {
    expect(formatCurrency(1280)).toBe(`1.280 ${GAME.currency.short}`);
    expect(formatCurrency(0)).toBe(`0 ${GAME.currency.short}`);
  });

  it('rejects fractional amounts', () => {
    expect(() => formatCurrency(1.5)).toThrow(RangeError);
  });
});
