import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LAYOUT, MAP_H, MAP_W, generateMap } from './map.js';
import { TILE, TILE_DEFS } from './tiles.js';
import { crc32, encodePng } from './png.js';

const map = generateMap();
const layer = (name: string) => {
  const l = map.layers.find((x) => x.name === name);
  if (!l || !('data' in l)) throw new Error(name);
  return l.data;
};
const collides = (gid: number) => gid > 0 && !!TILE_DEFS[gid - 1]!.collides;

/** Mirrors the client logic in client/src/game/systems/ZoneGates.ts */
function blockedGrid(unlocked: Set<string>): boolean[] {
  const ground = layer('ground');
  const deco = layer('deco');
  const gates = layer('gates');
  const blocked = ground.map((g, i) => collides(g) || collides(deco[i]!));
  for (const g of LAYOUT.gates) {
    const open = unlocked.has(g.gateId);
    for (let y = g.y; y < g.y + g.h; y++)
      for (let x = g.x; x < g.x + g.w; x++) {
        const i = y * MAP_W + x;
        if (g.mode === 'appear') blocked[i] = open ? false : blocked[i]!;
        else
          blocked[i] = open
            ? collides(ground[i]!) || collides(deco[i]!)
            : collides(gates[i]!) || blocked[i]!;
      }
  }
  return blocked;
}

function reachable(blocked: boolean[], from: { x: number; y: number }): Set<number> {
  const seen = new Set<number>([from.y * MAP_W + from.x]);
  const queue = [from];
  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const i = ny * MAP_W + nx;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || blocked[i] || seen.has(i)) continue;
      seen.add(i);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/** Tiles around a portal's 2×2 footprint (tiles x..x+1, rows y-1..y). */
const portalNeighbours = (levelId: string): number[] => {
  const p = LAYOUT.portals.find((q) => q.levelId === levelId)!;
  const out: number[] = [];
  for (let x = p.x - 1; x <= p.x + 2; x++) {
    out.push((p.y - 2) * MAP_W + x, (p.y + 1) * MAP_W + x);
  }
  for (const y of [p.y - 1, p.y]) out.push(y * MAP_W + p.x - 1, y * MAP_W + p.x + 2);
  return out;
};
const canReach = (r: Set<number>, levelId: string) =>
  portalNeighbours(levelId).some((i) => r.has(i));

describe('hub map', () => {
  it('has a walkable spawn point', () => {
    const blocked = blockedGrid(new Set());
    expect(blocked[LAYOUT.spawn.y * MAP_W + LAYOUT.spawn.x]).toBe(false);
  });

  it('with all zones locked: campus and forest portals reachable, beach and mountain not', () => {
    const r = reachable(blockedGrid(new Set()), LAYOUT.spawn);
    expect(canReach(r, 'demo-a')).toBe(true);
    expect(canReach(r, 'demo-b')).toBe(true);
    expect(canReach(r, 'demo-c')).toBe(true);
    expect(canReach(r, 'demo-d')).toBe(false);
    expect(canReach(r, 'demo-e')).toBe(false);
  });

  it('unlocking a zone makes exactly its portal reachable', () => {
    const beach = reachable(blockedGrid(new Set(['datenstrand'])), LAYOUT.spawn);
    expect(canReach(beach, 'demo-d')).toBe(true);
    expect(canReach(beach, 'demo-e')).toBe(false);
    const mountain = reachable(blockedGrid(new Set(['serverberg'])), LAYOUT.spawn);
    expect(canReach(mountain, 'demo-e')).toBe(true);
    expect(canReach(mountain, 'demo-d')).toBe(false);
  });

  it('all NPCs can be approached', () => {
    const r = reachable(blockedGrid(new Set(['datenstrand', 'serverberg'])), LAYOUT.spawn);
    for (const n of LAYOUT.npcs) {
      const around = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].some(([dx, dy]) => r.has((n.y + dy!) * MAP_W + n.x + dx!));
      expect(around, n.npcId).toBe(true);
    }
  });

  it('is a valid Tiled map with object layers and pixel coordinates', () => {
    expect(map.tilewidth).toBe(TILE);
    expect(map.layers.map((l) => l.name)).toEqual([
      'ground',
      'deco',
      'gates',
      'above',
      'objects',
      'zones',
      'gateAreas',
    ]);
    for (const l of map.layers) if ('data' in l) expect(l.data).toHaveLength(MAP_W * MAP_H);
  });

  it('the committed map file matches the generator layout (portals and gates)', () => {
    const file = JSON.parse(
      readFileSync('client/public/assets/maps/hub.json', 'utf8'),
    ) as typeof map;
    const ids = (m: typeof map, layerName: string) =>
      (m.layers.find((l) => l.name === layerName) as { objects: Array<{ name: string }> }).objects
        .map((o) => o.name)
        .sort();
    expect(ids(file, 'objects')).toEqual(ids(map, 'objects'));
    expect(ids(file, 'gateAreas')).toEqual(ids(map, 'gateAreas'));
  });
});

describe('png encoder', () => {
  it('computes the standard CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes a PNG signature and IHDR', () => {
    const png = encodePng(2, 1, new Uint8Array(8));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(2);
  });
});
