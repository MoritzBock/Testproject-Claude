/** Injectable clock so retention and session logic can be tested with simulated time. */
export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

export class FakeClock implements Clock {
  constructor(public t = Date.UTC(2026, 8, 1, 8, 0, 0)) {}
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Local calendar day (Europe/Berlin) as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ms));
}
