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
import { levelMetaOf, missingText, worldStore, zoneLabel } from '../data/world';
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
import { RemotePlayers, makeAura } from '../systems/RemotePlayers';
import { presenceStore, realtimeEvents, sendMove } from '../../net/realtime';
import { sessionStore } from '../../core/session';

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

const EMPTY_WORLD: WorldState = { zones: {}, levels: {}, starsTotal: 0 };

export class HubScene extends Phaser.Scene {
  private map!: Phaser.Tilemaps.Tilemap;
  private layers!: Record<'ground' | 'deco' | 'gates' | 'above', Phaser.Tilemaps.TilemapLayer>;
  private player!: Phaser.Physics.Arcade.Sprite;
  private doll!: PaperDoll;
  private remotes!: RemotePlayers;
  private aura: Phaser.GameObjects.Ellipse | null = null;
  private moveTimer = 0;
  private worldLoaded = false;
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
    this.remotes = new RemotePlayers(this, this.labels);
    realtimeEvents.onTeleport = (x, y) => this.player.setPosition(x, y);

    this.syncWorld(false);
    this.applySettings();

    // --- wiring -------------------------------------------------------------
    this.cleanups.push(
      worldStore.subscribe(() => this.syncWorld(true)),
      presenceStore.subscribe((p) => this.remotes.sync(p.players)),
      characterStore.subscribe((c) => c.appearance && this.doll.setAppearance(c.appearance)),
      settingsStore.subscribe(() => this.applySettings()),
      bus.on('startGame', () => this.startPlaying()),
      bus.on('toTitle', () => this.backToTitle()),
      bus.on('enterPortal', () => this.tryEnterNearbyPortal()),
      bus.on('interact', () => input.pressVirtual('interact')),
      bus.on('levelClosed', () => this.returnFromLevel()),
      bus.on('adminTeleport', ({ x, y }) => this.player.setPosition(x, y)),
      bus.on('adminInvisible', ({ on }) => this.doll.setAlpha(on ? 0.4 : 1)),
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
      this.addPortal(prop(o, 'levelId', o.name), prop(o, 'kind', 'terminal'), o.x ?? 0, o.y ?? 0);
    }
  }

  /** Levels from the content files that define their own portal position (not in the map). */
  private ensureLevelPortals(): void {
    const known = new Set(worldStore.get().levels.map((l) => l.id));
    for (const l of worldStore.get().levels) {
      if (!l.portal || this.portals.some((p) => p.levelId === l.id)) continue;
      this.addPortal(l.id, l.icon, (l.portal.x + 1) * 16, (l.portal.y + 1) * 16);
    }
    // Portals in the map whose level does not exist (yet) are hidden.
    for (const p of this.portals) {
      const exists = known.size === 0 || known.has(p.levelId);
      p.sprite.setVisible(exists);
      (p.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = exists;
    }
  }

  private addPortal(levelId: string, kind: string, x: number, y: number): void {
    {
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
    this.world = worldStore.get().state ?? EMPTY_WORLD;
    this.ensureLevelPortals();
    const zonesOpen = Object.fromEntries(
      Object.entries(this.world.zones).map(([k, v]) => [k, v.open]),
    );
    // The first state after login only restores the world – no "newly unlocked" messages.
    const firstLoad = !this.worldLoaded && !!worldStore.get().state;
    if (worldStore.get().state) this.worldLoaded = true;
    const opened = this.gates.sync(
      zonesOpen,
      animate && !firstLoad && !getSettings().a11y.reducedMotion,
    );
    for (const id of firstLoad ? [] : opened) {
      playSfx('unlock');
      notify(
        id === 'datenstrand'
          ? 'Die Brücke zum Datenstrand ist fertig!'
          : id === 'serverberg'
            ? 'Die Firewall zum Serverberg ist offen!'
            : `${zoneLabel(id)} ist jetzt erreichbar!`,
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
    const meta = levelMetaOf(levelId);
    const st = this.world.levels[levelId] ?? { status: 'locked' as const, stars: 0, missing: [] };
    return {
      levelId,
      title: meta?.title ?? levelId,
      subject: meta?.subject ?? '',
      description: meta?.description ?? '',
      ...st,
    };
  }

  private refreshPortalLabels(): void {
    const effects = getSettings().graphics.effects && !getSettings().a11y.reducedMotion;
    for (const p of this.portals) {
      if (!p.sprite.visible) {
        this.labels.remove(`portal-${p.levelId}`);
        continue;
      }
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
    const isTeacher = sessionStore.get().me?.role === 'teacher';
    if (isTeacher && !this.aura) this.aura = makeAura(this);
    if (!isTeacher && this.aura) {
      this.aura.destroy();
      this.aura = null;
    }
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.2, 0.2);
    if (this.motionOk) cam.fadeIn(400);
    this.currentZone = null;
  }

  private backToTitle(): void {
    this.cameras.main.stopFollow();
    this.doll.setVisible(false);
    this.remotes.clear();
    this.worldLoaded = false;
    worldStore.set({ state: null });
    this.aura?.setVisible(false);
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

    // movement (disabled while the teacher has frozen the class)
    const v = st.frozen ? { x: 0, y: 0 } : input.move();
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

    this.remotes.update(delta);
    if (this.aura)
      this.aura
        .setVisible(true)
        .setPosition(this.player.x, this.player.y - 1)
        .setDepth(this.player.y - 1);
    this.moveTimer -= delta;
    if (this.moveTimer <= 0) {
      this.moveTimer = 100;
      sendMove(this.player.x, this.player.y, Number(this.player.frame.name) || 0);
    }
    this.updateOwnLabel();
    this.updateNearby(false);
    if (input.consume('emote')) {
      openOverlay('emotes');
      return;
    }
    if (input.consume('console') && sessionStore.get().me?.role === 'teacher') {
      openOverlay('console');
      return;
    }
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
      if (!p.sprite.visible) continue;
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
    if (npc?.id === 'bert') {
      playSfx('talk');
      openOverlay('shop');
      return;
    }
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

  /** Own emote bubble and teacher badge above the player. */
  private updateOwnLabel(): void {
    const me = appState.get().myEmote;
    const emote = me && Date.now() - me.at < 4000 ? me.text : null;
    const teacher = sessionStore.get().me?.role === 'teacher';
    if (!emote && !teacher) {
      this.labels.remove('me');
      return;
    }
    this.labels.set(
      'me',
      this.player.x,
      this.player.y - 26,
      `${teacher ? '<span class="teacher-badge">Lehrkraft</span>' : ''}${emote ? `<span class="emote-bubble">${escapeHtml(emote)}</span>` : ''}`,
      'remote-label',
    );
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
