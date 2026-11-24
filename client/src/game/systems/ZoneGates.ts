import type Phaser from 'phaser';
import { prop } from './tiled';

export interface Gate {
  id: string;
  /** appear: tiles (e.g. a bridge) appear when unlocked; vanish: tiles (e.g. a firewall) disappear. */
  mode: 'appear' | 'vanish';
  tx: number;
  ty: number;
  tw: number;
  th: number;
  open: boolean;
}

/**
 * Opens/closes hub zones by toggling tiles of the `gates` layer and the collision
 * of the tiles below. Logic mirrored by scripts/assets/map.test.ts.
 */
export class ZoneGates {
  readonly gates: Gate[];

  constructor(
    private scene: Phaser.Scene,
    map: Phaser.Tilemaps.Tilemap,
    private gateLayer: Phaser.Tilemaps.TilemapLayer,
    private blockingLayers: Phaser.Tilemaps.TilemapLayer[],
  ) {
    const objs = map.getObjectLayer('gateAreas')?.objects ?? [];
    this.gates = objs.map((o) => ({
      id: prop(o, 'gateId', o.name),
      mode: prop(o, 'mode', 'appear') as Gate['mode'],
      tx: Math.round((o.x ?? 0) / map.tileWidth),
      ty: Math.round((o.y ?? 0) / map.tileHeight),
      tw: Math.round((o.width ?? 0) / map.tileWidth),
      th: Math.round((o.height ?? 0) / map.tileHeight),
      open: false,
    }));
    for (const g of this.gates) this.apply(g, false, false);
  }

  /** Updates all gates; returns the ids of gates that opened just now. */
  sync(openZones: Record<string, boolean>, animate: boolean): string[] {
    const opened: string[] = [];
    for (const g of this.gates) {
      const open = !!openZones[g.id];
      if (open !== g.open) {
        this.apply(g, open, animate);
        if (open) opened.push(g.id);
      }
    }
    return opened;
  }

  private apply(g: Gate, open: boolean, animate: boolean): void {
    g.open = open;
    const showGateTiles = g.mode === 'appear' ? open : !open;
    for (let y = g.ty; y < g.ty + g.th; y++) {
      for (let x = g.tx; x < g.tx + g.tw; x++) {
        const gt = this.gateLayer.getTileAt(x, y);
        if (gt) {
          gt.setCollision(!showGateTiles ? false : !!gt.properties?.collides);
          if (animate && showGateTiles) {
            gt.alpha = 0;
            this.scene.tweens.add({
              targets: gt,
              alpha: 1,
              duration: 500,
              delay: (x - g.tx + (y - g.ty)) * 120,
            });
          } else if (animate && !showGateTiles) {
            this.scene.tweens.add({ targets: gt, alpha: 0, duration: 500 });
          } else {
            gt.alpha = showGateTiles ? 1 : 0;
          }
          gt.visible = true;
        }
        if (g.mode === 'appear') {
          // Under an open bridge, the water below must become walkable.
          for (const layer of this.blockingLayers) {
            const t = layer.getTileAt(x, y);
            if (t) t.setCollision(open ? false : !!t.properties?.collides);
          }
        }
      }
    }
    for (const layer of [this.gateLayer, ...this.blockingLayers])
      layer.calculateFacesWithin(g.tx - 1, g.ty - 1, g.tw + 2, g.th + 2);
  }
}
