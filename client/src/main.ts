import Phaser from 'phaser';
import { render, h } from 'preact';
import { GAME } from '@pixel/shared';
import { appState, closeOverlay } from './core/app-state';
import { applySettingsToDocument, getSettings, settingsStore } from './core/settings-store';
import { input } from './input/input';
import { unlockAudio } from './audio/sfx';
import { BootScene } from './game/scenes/BootScene';
import { HubScene } from './game/scenes/HubScene';
import { computeViewport } from './game/scale';
import { App } from './ui/App';
import './tasks';
import './audio/music-director';
import { initSession } from './core/session';

applySettingsToDocument(getSettings());

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0e1222',
  pixelArt: true,
  roundPixels: true,
  width: GAME.resolution.width,
  height: GAME.resolution.height,
  physics: { default: 'arcade', arcade: { debug: false } },
  // Integer zoom is applied below; centering via CSS flexbox on #game.
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, gamepad: false }, // own input handling (rebindable keys)
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, HubScene],
});

function applyViewport(): void {
  const v = computeViewport(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio || 1,
    GAME.resolution,
    getSettings().graphics.pixelScale,
  );
  game.scale.resize(v.gameW, v.gameH);
  game.scale.setZoom(v.cssZoom);
  for (const scene of game.scene.getScenes(true)) scene.cameras.main.setSize(v.gameW, v.gameH);
}
window.addEventListener('resize', applyViewport);
let lastScale = getSettings().graphics.pixelScale;
settingsStore.subscribe(({ settings }) => {
  if (settings.graphics.pixelScale !== lastScale) {
    lastScale = settings.graphics.pixelScale;
    applyViewport();
  }
});
game.events.once(Phaser.Core.Events.READY, applyViewport);

input.blocked = () => {
  const s = appState.get();
  return s.screen !== 'game' || s.overlay !== null;
};
input.onUiBack = () => closeOverlay();
input.attach();

render(h(App, {}), document.getElementById('ui-root')!);
void initSession();

// Re-apply the viewport once the first scene is running (cameras exist then).
let lastScreen = appState.get().screen;
appState.subscribe((s) => {
  if (s.screen !== lastScreen) {
    lastScreen = s.screen;
    applyViewport();
  }
});

// Browsers only allow audio after a user gesture.
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
