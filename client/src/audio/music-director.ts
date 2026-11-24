import { appState } from '../core/app-state';
import { music, type TrackId } from './music';
import { onAudioUnlock } from './sfx';

/** Chooses the music from the current screen, overlay and zone. */
let zone: string | null = null;
export function setMusicZone(z: string | null): void {
  zone = z;
  update();
}

function update(): void {
  const s = appState.get();
  let track: TrackId | null;
  if (s.screen !== 'game') track = 'title';
  else if (s.overlay === 'shop') track = 'shop';
  else if (s.overlay === 'level') track = 'level';
  else if (zone === 'platinenwald' || zone === 'datenstrand' || zone === 'serverberg') track = zone;
  else track = 'campus';
  music.play(track);
}

appState.subscribe(update);
onAudioUnlock(() => music.resume());
