import type Phaser from 'phaser';
import { DEFAULT_EQUIPMENT, EMOTES, type PresencePlayer } from '@pixel/shared';
import { PaperDoll } from './PaperDoll';
import { escapeHtml, type WorldLabels } from './WorldLabels';
import type { Appearance } from '../doll';

interface Remote {
  doll: PaperDoll;
  target: { x: number; y: number };
  data: PresencePlayer;
  aura?: Phaser.GameObjects.Ellipse;
}

/** Renders other players (positions from the server, memory only), smoothly interpolated. */
export class RemotePlayers {
  private remotes = new Map<string, Remote>();

  constructor(
    private scene: Phaser.Scene,
    private labels: WorldLabels,
  ) {}

  sync(players: PresencePlayer[]): void {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      let r = this.remotes.get(p.id);
      const appearance: Appearance = (p.appearance as Appearance | null) ?? {
        skinTone: 0,
        equipped: { ...DEFAULT_EQUIPMENT },
      };
      if (!r) {
        const doll = new PaperDoll(this.scene, p.x, p.y, appearance, false);
        r = { doll, target: { x: p.x, y: p.y }, data: p };
        if (p.teacher) r.aura = makeAura(this.scene);
        this.remotes.set(p.id, r);
      } else if (JSON.stringify(r.data.appearance) !== JSON.stringify(p.appearance)) {
        r.doll.setAppearance(appearance);
      }
      r.target = { x: p.x, y: p.y };
      r.data = p;
    }
    for (const [id, r] of this.remotes) {
      if (seen.has(id)) continue;
      r.doll.destroy();
      r.aura?.destroy();
      this.labels.remove(`remote-${id}`);
      this.remotes.delete(id);
    }
  }

  update(delta: number): void {
    const k = Math.min(1, delta / 100);
    for (const [id, r] of this.remotes) {
      const b = r.doll.body;
      const dx = r.target.x - b.x;
      const dy = r.target.y - b.y;
      if (Math.hypot(dx, dy) > 200) b.setPosition(r.target.x, r.target.y);
      else b.setPosition(b.x + dx * k, b.y + dy * k);
      b.setFrame(r.data.frame);
      r.doll.sync(delta);
      if (r.aura) r.aura.setPosition(b.x, b.y - 1).setDepth(b.y - 1);
      const emote = r.data.emote ? EMOTES.find((e) => e.id === r.data.emote!.id)?.text : undefined;
      const badge = r.data.teacher ? '<span class="teacher-badge">Lehrkraft</span>' : '';
      this.labels.set(
        `remote-${id}`,
        b.x,
        b.y - 26,
        `${badge}<span>${escapeHtml(r.data.name)}</span>${emote ? `<span class="emote-bubble">${escapeHtml(emote)}</span>` : ''}`,
        `remote-label ${r.data.teacher ? 'remote-teacher' : ''}`,
      );
    }
  }

  setVisible(v: boolean): void {
    for (const r of this.remotes.values()) {
      r.doll.setVisible(v);
      r.aura?.setVisible(v);
    }
  }

  clear(): void {
    this.sync([]);
  }
}

/** Glowing ring under teacher characters (recognisable admin character). */
export function makeAura(scene: Phaser.Scene): Phaser.GameObjects.Ellipse {
  const e = scene.add.ellipse(0, 0, 22, 8, 0xffb347, 0.45).setStrokeStyle(1, 0xffd75e, 0.9);
  scene.tweens.add({ targets: e, alpha: 0.2, duration: 900, yoyo: true, repeat: -1 });
  return e;
}
