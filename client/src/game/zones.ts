export interface ZoneRect {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Returns the zone containing the point (first match wins). */
export function zoneAt(zones: ZoneRect[], x: number, y: number): ZoneRect | null {
  return zones.find((z) => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) ?? null;
}
