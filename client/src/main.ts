import Phaser from 'phaser';
import { GAME } from '@pixel/shared';
import { BootScene } from './game/scenes/BootScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0e1222',
  pixelArt: true,
  roundPixels: true,
  width: GAME.resolution.width,
  height: GAME.resolution.height,
  scale: {
    // Integer zoom is applied by our own resize logic (see scale.ts) to avoid blurring;
    // centering is done via CSS flexbox on #game.
    mode: Phaser.Scale.NONE,
  },
  scene: [BootScene],
});
