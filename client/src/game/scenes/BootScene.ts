import Phaser from 'phaser';
import { GAME, HealthResponse } from '@pixel/shared';
import { integerZoom } from '../scale';

/** M0 placeholder scene: shows the title and the server status. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const { width, height } = GAME.resolution;
    this.applyZoom();
    window.addEventListener('resize', () => this.applyZoom());

    this.add
      .text(width / 2, height / 2 - 20, GAME.title, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#4fd1c5',
      })
      .setOrigin(0.5);
    const status = this.add
      .text(width / 2, height / 2 + 16, 'Verbinde mit Server …', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8ecff',
      })
      .setOrigin(0.5);

    fetch('/api/health')
      .then((r) => r.json())
      .then((json) => {
        const h = HealthResponse.parse(json);
        status.setText(`Server erreichbar · Version ${h.version}`);
      })
      .catch(() => status.setText('Server nicht erreichbar').setColor('#ff8a8a'));
  }

  private applyZoom(): void {
    const { width, height } = GAME.resolution;
    this.scale.setZoom(integerZoom(window.innerWidth, window.innerHeight, width, height));
  }
}
