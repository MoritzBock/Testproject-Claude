/** Normalises a movement vector: dead zone, max length 1 (no faster diagonals). */
export function normalizeMove(x: number, y: number, deadZone = 0.2): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < deadZone) return { x: 0, y: 0 };
  const scale = len > 1 ? 1 / len : 1;
  return { x: x * scale, y: y * scale };
}

/** Main facing direction for a movement vector (horizontal wins ties). */
export function facing(x: number, y: number): 'up' | 'down' | 'left' | 'right' | null {
  if (x === 0 && y === 0) return null;
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}
