import type Phaser from 'phaser';

interface AnimDef {
  frames: number[]; // tile indices (gids)
  duration: number;
}

/**
 * Plays Tiled tile animations (Phaser 3 renders them statically).
 * Swaps tile indices on a timer; collision flags stay untouched.
 */
export class AnimatedTiles {
  private groups: Array<{
    def: AnimDef;
    tiles: Phaser.Tilemaps.Tile[];
    frame: number;
    elapsed: number;
  }> = [];
  enabled = true;

  constructor(map: Phaser.Tilemaps.Tilemap, layers: Phaser.Tilemaps.TilemapLayer[]) {
    const defs = new Map<number, AnimDef>();
    for (const ts of map.tilesets) {
      const data = ts.tileData as Record<
        string,
        { animation?: Array<{ tileid: number; duration: number }> }
      >;
      for (const [id, d] of Object.entries(data)) {
        if (!d.animation?.length) continue;
        defs.set(ts.firstgid + Number(id), {
          frames: d.animation.map((a) => ts.firstgid + a.tileid),
          duration: d.animation[0]!.duration,
        });
      }
    }
    for (const [gid, def] of defs) {
      const tiles: Phaser.Tilemaps.Tile[] = [];
      for (const layer of layers) layer.forEachTile((t) => t.index === gid && tiles.push(t));
      if (tiles.length) this.groups.push({ def, tiles, frame: 0, elapsed: 0 });
    }
  }

  update(deltaMs: number): void {
    if (!this.enabled) return;
    for (const g of this.groups) {
      g.elapsed += deltaMs;
      if (g.elapsed < g.def.duration) continue;
      g.elapsed %= g.def.duration;
      g.frame = (g.frame + 1) % g.def.frames.length;
      const idx = g.def.frames[g.frame]!;
      for (const t of g.tiles) t.index = idx;
    }
  }
}
