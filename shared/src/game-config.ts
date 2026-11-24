/**
 * Central, non-secret game constants shared by client and server.
 * Rename the currency or world here – everything else reads from this file.
 */
export const GAME = {
  title: 'Pixel-Lernwelt',
  worldName: 'Die Bit-Insel',
  currency: {
    name: 'Bytes',
    short: 'B',
  },
  /** Internal render resolution; the canvas is scaled by integer factors only. */
  resolution: { width: 480, height: 270 },
  tileSize: 16,
} as const;

/** Formats an amount of in-game currency for display, e.g. "1.280 B". */
export function formatCurrency(amount: number): string {
  if (!Number.isInteger(amount)) throw new RangeError('Currency amounts are integers');
  return `${amount.toLocaleString('de-DE')} ${GAME.currency.short}`;
}
