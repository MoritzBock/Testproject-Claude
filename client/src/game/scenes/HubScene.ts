import Phaser from 'phaser';
import type { WorldState } from '@pixel/shared';
import { appState, notify, openOverlay, type PortalInfo } from '../../core/app-state';
import { bus } from '../../core/bus';
import { getSettings, settingsStore } from '../../core/settings-store';
import { input } from '../../input/input';
import { facing } from '../../input/move';
import { playSfx } from '../../audio/sfx';
import { ICONS } from '../../ui/icons';
import { INTERACT_RANGE, PLAYER_SPEED, type Direction, DIRECTIONS } from '../constants';
import {
  ZONE_LABELS,
  demoComplete,
  demoStart,
  levelMeta,
  missingText,
  progressStore,
  worldState,
} from '../data/demo-world';
import { STATUS, starString } from '../portal-status';
import { AnimatedTiles } from '../systems/AnimatedTiles';
import { renderMinimap } from '../systems/minimap';
import { prop } from '../systems/tiled';
import { WorldLabels, escapeHtml } from '../systems/WorldLabels';
import { ZoneGates } from '../systems/ZoneGates';
import { zoneAt, type ZoneRect } from '../zones';
import { PaperDoll } from '../systems/PaperDoll';
import { characterStore } from '../../core/character-store';
import { DEFAULT_EQUIPMENT } from '@pixel/shared';

interface PortalEntity {
  levelId: string;
  kind: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  x: number;
  y: number;
}

interface NpcEntity {
  id: string;
  name: string;
  lines: string[];
  spriteIndex: number;
  sprite: Phaser.Physics.Arcade.Sprite;
}

export interface MapMarker {
  levelId: string;
  tx: number;
  ty: number;
}

/** Portal positions in tiles – read by the world map overlay. */
export const portalMarkers: MapMarker[] = [];
export const zoneRects: ZoneRect[] = [];

export class HubScene extends Phaser.Scene {
  private map!: Phaser.Tilemaps.Tilemap;
  private layers!: Record<'ground' | 'deco' | 'gates' | 'above', Phaser.Tilemaps.TilemapLayer>;
  private player!: Phaser.Physics.Arcade.Sprite;
  private doll!: PaperDoll;
  private dir: Direction = 'down';
  private portals: PortalEntity[] = [];
  private npcs: NpcEntity[] = [];
  private animTiles!: AnimatedTiles;
  private gates!: ZoneGates;
  private labels!: WorldLabels;
  private world!: WorldState;
  private currentZone: string | null = null;
  private attractT = 0;
  private cleanups: Array<() => void> = [];

  constructor() {
    super('Hub');
  }

  create(): void {
    this.map = this.make.tilemap({ key: 'hub' });
    const tileset = this.map.addTilesetImage('bit-insel', 'tiles')!;
    const mk = (name: string, depth: number) => {
      const l = this.map.createLayer(name, tileset, 0, 0)!;
      l.setDepth(depth);
      return l;
    };
    this.layers = {
      ground: mk('ground', 0),
      deco: mk('deco', 10),
      gates: mk('gates', 20),
      above: mk('above', 100000),
    };
    for (const l of [this.layers.ground, this.layers.deco, this.layers.gates])
      l.setCollisionByProperty({ collides: true });

    this.animTiles = new AnimatedTiles(this.map, [this.layers.ground, this.layers.gates]);
    this.gates = new ZoneGates(this, this.map, this.layers.gates, [
      this.layers.ground,
      this.layers.deco,
    ]);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    this.readZones();
    this.createPlayer();
    this.createPortals();
    this.createNpcs();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    cam.setRoundPixels(true);
    this.labels = new WorldLabels(cam, this.game.canvas);

    this.syncWorld(false);
    this.applySettings();

    // --- wiring -------------------------------------------------------------
    this.cleanups.push(
      progressStore.subscribe(() => this.syncWorld(true)),
      characterStore.subscribe((c) => c.appearance && this.doll.setAppearance(c.appearance)),
      settingsStore.subscribe(() => this.applySettings()),
      bus.on('startGame', () => this.startPlaying()),
      bus.on('toTitle', () => this.backToTitle()),
      bus.on('enterPortal', () => this.tryEnterNearbyPortal()),
      bus.on('interact', () => input.pressVirtual('interact')),
      bus.on('demoCompleteLevel', ({ levelId, stars }) => this.finishDemoLevel(levelId, stars)),
      bus.on('demoResetProgress', () => progressStore.set({ progress: {} })),
      bus.on('levelClosed', () => this.returnFromLevel()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanups.forEach((fn) => fn());
      this.labels.destroy();
    });

    // Dev-only test hook (stripped from production builds by Vite).
    if (import.meta.env.DEV) {
      (window as unknown as { __hub: unknown }).__hub = {
        teleport: (tx: number, ty: number) => this.player.setPosition(tx * 16 + 8, ty * 16 + 16),
      };
    }

    if (appState.get().screen === 'game') this.startPlaying();
    else this.doll.setVisible(false);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private readZones(): void {
    zoneRects.length = 0;
    for (const o of this.map.getObjectLayer('zones')?.objects ?? []) {
      zoneRects.push({
        id: prop(o, 'zoneId', o.name),
        label: o.name,
        x: o.x ?? 0,
        y: o.y ?? 0,
        w: o.width ?? 0,
        h: o.height ?? 0,
      });
    }
  }

  private objects(type: string) {
    return (this.map.getObjectLayer('objects')?.objects ?? []).filter((o) => o.type === type);
  }

  private createPlayer(): void {
    const spawn = this.objects('spawn')[0];
    const appearance = characterStore.get().appearance ?? {
      skinTone: 0,
      equipped: { ...DEFAULT_EQUIPMENT },
    };
    this.doll = new PaperDoll(this, spawn?.x ?? 100, spawn?.y ?? 100, appearance);
    this.player = this.doll.body;
    // Small hitbox at the feet so the player can walk "behind" things naturally.
    this.player.body!.setSize(10, 6).setOffset(3, 18);
    this.player.setCollideWorldBounds(true);
    for (const l of [this.layers.ground, this.layers.deco, this.layers.gates])
      this.physics.add.collider(this.player, l);
  }

  private createPortals(): void {
    portalMarkers.length = 0;
    for (const o of this.objects('portal')) {
      const levelId = prop(o, 'levelId', o.name);
      const kind = prop(o, 'kind', 'terminal');
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const sprite = this.physics.add.staticSprite(x, y, 'portals', 0).setOrigin(0.5, 1);
      sprite.play(`portal-${kind}`);
      sprite.setDepth(y);
      // Only the base blocks movement.
      (sprite.body as Phaser.Physics.Arcade.StaticBody).setSize(24, 8, false).setOffset(4, 24);
      this.physics.add.collider(this.player, sprite);
      this.portals.push({ levelId, kind, sprite, x, y });
      portalMarkers.push({ levelId, tx: Math.floor(x / 16), ty: Math.floor((y - 8) / 16) });
    }
  }

  private createNpcs(): void {
    for (const o of this.objects('npc')) {
      const spriteIndex = prop(o, 'sprite', 0);
      const sprite = this.physics.add
        .staticSprite(o.x ?? 0, o.y ?? 0, 'npcs', spriteIndex * 16)
        .setOrigin(0.5, 1);
      sprite.setDepth(sprite.y);
      (sprite.body as Phaser.Physics.Arcade.StaticBody).setSize(12, 6, false).setOffset(2, 18);
      this.physics.add.collider(this.player, sprite);
      this.npcs.push({
        id: prop(o, 'npcId', o.name),
        name: o.name,
        lines: prop(o, 'lines', '…').split('|'),
        spriteIndex,
        sprite,
      });
    }
  }

  // -------------------------------------------------------------------------
  // World state (progress → gates, portal status, HUD)
  // -------------------------------------------------------------------------

  private syncWorld(animate: boolean): void {
    this.world = worldState();
    const zonesOpen = Object.fromEntries(
      Object.entries(this.world.zones).map(([k, v]) => [k, v.open]),
    );
    const opened = this.gates.sync(zonesOpen, animate && !getSettings().a11y.reducedMotion);
    for (const id of opened) {
      playSfx('unlock');
      notify(
        id === 'datenstrand'
          ? 'Die Brücke zum Datenstrand ist fertig!'
          : id === 'serverberg'
            ? 'Die Firewall zum Serverberg ist offen!'
            : `${ZONE_LABELS[id] ?? id} ist jetzt erreichbar!`,
        'success',
        6000,
      );
    }
    this.refreshPortalLabels();
    appState.set({ starsTotal: this.world.starsTotal });
    this.refreshMinimap();
    this.updateNearby(true);
  }

  private refreshMinimap(): void {
    renderMinimap(
      [this.layers.ground, this.layers.deco, this.layers.gates, this.layers.above],
      this.registry.get('tileColors'),
      this.map.width,
      this.map.height,
    );
    appState.set((s) => ({ minimapVersion: s.minimapVersion + 1 }));
  }

  private portalInfo(levelId: string): PortalInfo {
    const meta = levelMeta(levelId);
    const st = this.world.levels[levelId] ?? { status: 'locked' as const, stars: 0, missing: [] };
    return {
      levelId,
      title: meta.title,
      subject: meta.subject,
      description: meta.description,
      ...st,
    };
  }

  private refreshPortalLabels(): void {
    const effects = getSettings().graphics.effects && !getSettings().a11y.reducedMotion;
    for (const p of this.portals) {
      const info = this.portalInfo(p.levelId);
      const st = STATUS[info.status];
      const stars =
        info.status === 'completed'
          ? `<span class="label-stars">${starString(info.stars).visual}</span>`
          : '';
      this.labels.set(
        `portal-${p.levelId}`,
        p.x,
        p.y - 34,
        `<span class="status-icon ${st.className}">${ICONS[st.icon]}</span><span>${escapeHtml(info.title)}</span>${stars}<span class="cb-text">${st.label}</span>`,
        `portal-label ${st.className}`,
      );
      if (info.status === 'locked') p.sprite.setTint(0x6c6c7c);
      else p.sprite.clearTint();
      if (effects && info.status !== 'locked') p.sprite.anims.resume();
      else p.sprite.anims.pause();
    }
  }

  // -------------------------------------------------------------------------
  // Settings / title / transitions
  // -------------------------------------------------------------------------

  private applySettings(): void {
    const s = getSettings();
    this.animTiles.enabled = !s.a11y.reducedMotion && s.graphics.effects;
    this.refreshPortalLabels();
  }

  private get motionOk(): boolean {
    return !getSettings().a11y.reducedMotion;
  }

  private startPlaying(): void {
    appState.set({ screen: 'game' });
    const a = characterStore.get().appearance;
    if (a) this.doll.setAppearance(a);
    this.doll.setVisible(true);
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.2, 0.2);
    if (this.motionOk) cam.fadeIn(400);
    this.currentZone = null;
  }

  private backToTitle(): void {
    this.cameras.main.stopFollow();
    this.doll.setVisible(false);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    appState.set({
      screen: 'title',
      overlay: null,
      dialog: null,
      nearbyPortal: null,
      nearbyNpc: null,
    });
    for (const n of this.npcs) this.labels.remove(`npc-${n.id}`);
  }

  private tryEnterNearbyPortal(): void {
    const near = this.nearestPortal();
    if (near) this.enterPortal(near);
  }

  private enterPortal(p: PortalEntity): void {
    const info = this.portalInfo(p.levelId);
    if (info.status === 'locked') {
      playSfx('deny');
      if (getSettings().graphics.screenShake && this.motionOk) this.cameras.main.shake(150, 0.004);
      notify(
        info.missing[0] ? missingText(info.missing[0]) : 'Dieses Level ist noch gesperrt.',
        'warning',
      );
      return;
    }
    playSfx('portal');
    demoStart(p.levelId);
    const open = () => {
      appState.set({ activeLevel: this.portalInfo(p.levelId) });
      openOverlay('level');
    };
    if (this.motionOk) {
      this.cameras.main.fadeOut(300, 14, 18, 34);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, open);
    } else open();
  }

  private returnFromLevel(): void {
    appState.set({ activeLevel: null });
    if (this.motionOk) this.cameras.main.fadeIn(300, 14, 18, 34);
    else this.cameras.main.resetFX();
  }

  private finishDemoLevel(levelId: string, stars: number): void {
    const { newStars } = demoComplete(levelId, stars);
    playSfx('confirm');
    notify(
      newStars > 0
        ? `Level abgeschlossen: +${newStars} ${newStars === 1 ? 'Stern' : 'Sterne'}`
        : 'Level erneut abgeschlossen – keine zusätzliche Belohnung.',
      'success',
    );
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    input.update();
    this.animTiles.update(delta);
    const st = appState.get();

    if (st.screen !== 'game') {
      this.attractMode(delta);
      this.labels.setVisible(false);
      return;
    }
    this.labels.setVisible(true);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (st.overlay || st.dialog) {
      body.setVelocity(0, 0);
      this.player.anims.stop();
      this.doll.sync(delta);
      if (st.dialog && !st.overlay && input.consume('interact')) this.advanceDialog();
      if (st.dialog && input.consume('pause')) appState.set({ dialog: null });
      this.labels.update();
      return;
    }

    if (input.consume('pause')) {
      openOverlay('pause');
      playSfx('ui');
      return;
    }
    if (input.consume('wardrobe')) {
      openOverlay('wardrobe');
      playSfx('ui');
      return;
    }
    if (input.consume('map')) {
      openOverlay('map');
      playSfx('ui');
      return;
    }

    // movement
    const v = input.move();
    body.setVelocity(v.x * PLAYER_SPEED, v.y * PLAYER_SPEED);
    const f = facing(v.x, v.y);
    if (f) {
      this.dir = f;
      this.player.anims.play(`player-walk-${f}`, true);
      this.player.anims.timeScale = Math.max(0.4, Math.hypot(v.x, v.y));
    } else {
      this.player.anims.stop();
      this.player.setFrame(DIRECTIONS.indexOf(this.dir) * 4);
    }
    this.doll.sync(delta);

    this.updateNearby(false);
    if (input.consume('interact')) this.interact();
    this.updateZone();
    this.labels.update();
  }

  private attractMode(delta: number): void {
    const cam = this.cameras.main;
    if (!this.motionOk) {
      cam.centerOn(this.map.widthInPixels / 2, this.map.heightInPixels / 2);
      return;
    }
    this.attractT += delta / 1000;
    const cx =
      this.map.widthInPixels / 2 + Math.sin(this.attractT * 0.05) * this.map.widthInPixels * 0.3;
    const cy =
      this.map.heightInPixels / 2 +
      Math.cos(this.attractT * 0.035) * this.map.heightInPixels * 0.25;
    cam.centerOn(Math.round(cx), Math.round(cy));
  }

  private nearestPortal(): PortalEntity | null {
    let best: PortalEntity | null = null;
    let bestD = INTERACT_RANGE;
    for (const p of this.portals) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private nearestNpc(): NpcEntity | null {
    let best: NpcEntity | null = null;
    let bestD = INTERACT_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private updateNearby(force: boolean): void {
    if (!this.player || appState.get().screen !== 'game') return;
    const portal = this.nearestPortal();
    const npc = portal ? null : this.nearestNpc();
    const s = appState.get();
    const portalChanged = (portal?.levelId ?? null) !== (s.nearbyPortal?.levelId ?? null);
    if (portalChanged || force)
      appState.set({ nearbyPortal: portal ? this.portalInfo(portal.levelId) : null });
    if ((npc?.id ?? null) !== s.nearbyNpc) {
      appState.set({ nearbyNpc: npc?.id ?? null });
      for (const n of this.npcs) {
        if (n === npc) {
          this.labels.set(
            `npc-${n.id}`,
            n.sprite.x,
            n.sprite.y - 26,
            `${ICONS.talk}<span>${escapeHtml(n.name)}</span>`,
            'npc-label',
          );
        } else this.labels.remove(`npc-${n.id}`);
      }
    }
  }

  private interact(): void {
    const portal = this.nearestPortal();
    if (portal) return this.enterPortal(portal);
    const npc = this.nearestNpc();
    if (npc) {
      // turn towards the player
      const dx = this.player.x - npc.sprite.x;
      const dy = this.player.y - npc.sprite.y;
      const d = facing(dx, dy) ?? 'down';
      npc.sprite.setFrame(npc.spriteIndex * 16 + DIRECTIONS.indexOf(d) * 4);
      playSfx('talk');
      appState.set({ dialog: { name: npc.name, lines: npc.lines, index: 0 } });
    }
  }

  private advanceDialog(): void {
    const d = appState.get().dialog;
    if (!d) return;
    if (d.index + 1 < d.lines.length) {
      playSfx('talk');
      appState.set({ dialog: { ...d, index: d.index + 1 } });
    } else appState.set({ dialog: null });
  }

  private updateZone(): void {
    const z = zoneAt(zoneRects, this.player.x, this.player.y);
    const tx = Math.floor(this.player.x / 16);
    const ty = Math.floor(this.player.y / 16);
    const pt = appState.get().playerTile;
    if (pt.x !== tx || pt.y !== ty) appState.set({ playerTile: { x: tx, y: ty } });
    if (z && z.id !== this.currentZone) {
      this.currentZone = z.id;
      appState.set({ zoneBanner: z.label });
      this.time.delayedCall(2500, () => {
        if (appState.get().zoneBanner === z.label) appState.set({ zoneBanner: null });
      });
    }
  }
}
