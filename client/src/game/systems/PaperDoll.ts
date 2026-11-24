import Phaser from 'phaser';
import { getSettings } from '../../core/settings-store';
import { hasGlitter, hexToInt, layerStack, layerTexture, type Appearance } from '../doll';

/**
 * Layered character in the world. The `body` sprite carries physics and animation;
 * all other layers copy its frame every tick (same animation grid).
 */
export class PaperDoll {
  readonly body: Phaser.Physics.Arcade.Sprite;
  private layers: Phaser.GameObjects.Sprite[] = [];
  private appearance: Appearance;
  private facingUp = false;
  private glitterTimer = 0;
  extraDepth = 0;

  constructor(
    private scene: Phaser.Scene,
    x: number,
    y: number,
    appearance: Appearance,
    physics = true,
  ) {
    this.appearance = appearance;
    this.body = physics
      ? scene.physics.add.sprite(x, y, layerTexture('body'), 0)
      : (scene.add.sprite(x, y, layerTexture('body'), 0) as Phaser.Physics.Arcade.Sprite);
    this.body.setOrigin(0.5, 1);
    this.rebuild();
  }

  setAppearance(a: Appearance): void {
    this.appearance = a;
    this.rebuild();
  }

  private rebuild(): void {
    for (const l of this.layers) if (l !== this.body) l.destroy();
    this.layers = [];
    for (const spec of layerStack(this.appearance, this.facingUp)) {
      if (spec.slot === 'body') {
        this.body.setTint(hexToInt(spec.tint));
        this.layers.push(this.body);
        continue;
      }
      const s = this.scene.add
        .sprite(this.body.x, this.body.y, layerTexture(spec.key), 0)
        .setOrigin(0.5, 1);
      s.setTint(hexToInt(spec.tint));
      this.layers.push(s);
    }
    this.sync(0);
  }

  setVisible(v: boolean): void {
    for (const l of this.layers) l.setVisible(v);
  }

  setAlpha(a: number): void {
    for (const l of this.layers) l.setAlpha(a);
  }

  /** Copy position, frame and depth from the body to all layers. */
  sync(delta: number): void {
    const frame = Number(this.body.frame.name) || 0;
    const up = frame >= 12;
    if (up !== this.facingUp) {
      this.facingUp = up;
      this.rebuild();
      return;
    }
    const baseDepth = this.body.y + this.extraDepth;
    this.layers.forEach((l, i) => {
      if (l !== this.body) {
        l.setPosition(this.body.x, this.body.y);
        l.setFrame(frame);
        l.setVisible(this.body.visible);
      }
      l.setDepth(baseDepth + i * 0.01);
    });
    this.glitter(delta);
  }

  private glitter(delta: number): void {
    const s = getSettings();
    if (
      !this.body.visible ||
      !s.graphics.effects ||
      s.a11y.reducedMotion ||
      !hasGlitter(this.appearance)
    )
      return;
    this.glitterTimer -= delta;
    if (this.glitterTimer > 0) return;
    this.glitterTimer = 260;
    const x = this.body.x + Phaser.Math.Between(-7, 7);
    const y = this.body.y - Phaser.Math.Between(4, 22);
    const spark = this.scene.add.rectangle(x, y, 1, 1, 0xffffff).setDepth(this.body.y + 1);
    this.scene.tweens.add({
      targets: spark,
      y: y - 4,
      alpha: 0,
      duration: 500,
      onComplete: () => spark.destroy(),
    });
  }

  destroy(): void {
    for (const l of this.layers) if (l !== this.body) l.destroy();
    this.body.destroy();
  }
}
