/**
 * Generates all placeholder pixel-art assets (no external downloads, no third-party works).
 *
 *   npm run assets              → regenerates images; map only if it does not exist yet
 *   npm run assets -- --map     → also overwrites client/public/assets/maps/hub.json
 *
 * The map is meant to be edited in Tiled afterwards, so it is never overwritten silently.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './assets/png.js';
import type { PixelCanvas } from './assets/canvas.js';
import { renderTileset } from './assets/tiles.js';
import {
  NPC_COLORS,
  PLAYER_COLORS,
  renderCharacterSheet,
  renderPortals,
} from './assets/sprites.js';
import { generateMap } from './assets/map.js';
import { LAYER_KEYS, renderLayer } from './assets/layers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'assets');

function writePng(rel: string, c: PixelCanvas) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(c.width, c.height, c.data));
  console.warn(`✓ ${rel} (${c.width}×${c.height})`);
}

writePng('tilesets/tiles.png', renderTileset().canvas);
writePng('sprites/player.png', renderCharacterSheet([PLAYER_COLORS]));
writePng('sprites/npcs.png', renderCharacterSheet(NPC_COLORS));
writePng('sprites/portals.png', renderPortals());
for (const key of LAYER_KEYS) writePng(`sprites/layers/${key}.png`, renderLayer(key));
writeFileSync(
  join(root, 'sprites', 'layers', 'layers.json'),
  JSON.stringify({ frameWidth: 16, frameHeight: 24, layers: LAYER_KEYS }),
);

const mapFile = join(root, 'maps', 'hub.json');
if (!existsSync(mapFile) || process.argv.includes('--map')) {
  mkdirSync(dirname(mapFile), { recursive: true });
  writeFileSync(mapFile, JSON.stringify(generateMap()));
  console.warn('✓ maps/hub.json');
} else {
  console.warn('• maps/hub.json existiert bereits (mit --map überschreiben)');
}
