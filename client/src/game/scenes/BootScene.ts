import Phaser from 'phaser';
import { appState } from '../../core/app-state';
import { DIRECTIONS, CHAR_H, CHAR_W, PORTAL_KINDS } from '../constants';
import { tileColors } from '../systems/minimap';

/** Loads all assets (local files only), creates animations, then starts the hub. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.on('progress', (p: number) => appState.set({ loadProgress: p }));
    this.load.setPath('assets/');
    this.load.image('tiles', 'tilesets/tiles.png');
    this.load.tilemapTiledJSON('hub', 'maps/hub.json');
    this.load.spritesheet('player', 'sprites/player.png', {
      frameWidth: CHAR_W,
      frameHeight: CHAR_H,
    });
    this.load.spritesheet('npcs', 'sprites/npcs.png', { frameWidth: CHAR_W, frameHeight: CHAR_H });
    this.load.spritesheet('portals', 'sprites/portals.png', { frameWidth: 32, frameHeight: 32 });
  }

  create(): void {
    DIRECTIONS.forEach((dir, row) => {
      this.anims.create({
        key: `player-walk-${dir}`,
        frames: this.anims.generateFrameNumbers('player', {
          frames: [0, 1, 2, 3].map((f) => row * 4 + f),
        }),
        frameRate: 8,
        repeat: -1,
      });
    });
    PORTAL_KINDS.forEach((kind, k) => {
      this.anims.create({
        key: `portal-${kind}`,
        frames: this.anims.generateFrameNumbers('portals', { frames: [k * 2, k * 2 + 1] }),
        frameRate: 2,
        repeat: -1,
      });
    });
    this.registry.set('tileColors', tileColors(this, 'tiles', 16));
    appState.set({ screen: 'title', loadProgress: 1 });
    this.scene.start('Hub');
  }
}
