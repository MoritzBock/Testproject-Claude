/**
 * Renders client/public/assets/maps/hub.json to a PNG overview (handy without Tiled).
 *   npm run map:preview            → writes ./map-preview.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PixelCanvas } from './assets/canvas.js';
import { encodePng } from './assets/png.js';
import { renderTileset } from './assets/tiles.js';

interface Layer {
  type: string;
  data?: number[];
}
const map = JSON.parse(readFileSync('client/public/assets/maps/hub.json', 'utf8')) as {
  width: number;
  height: number;
  layers: Layer[];
};
const ts = renderTileset().canvas;
const out = new PixelCanvas(map.width * 16, map.height * 16);
const hex = (v: number) => v.toString(16).padStart(2, '0');
for (const layer of map.layers) {
  if (layer.type !== 'tilelayer' || !layer.data) continue;
  layer.data.forEach((g, i) => {
    if (!g) return;
    const id = g - 1;
    const sx = (id % 16) * 16;
    const sy = Math.floor(id / 16) * 16;
    const dx = (i % map.width) * 16;
    const dy = Math.floor(i / map.width) * 16;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const [r, gg, b, a] = ts.getPixel(sx + x, sy + y);
        if (a) out.px(dx + x, dy + y, `#${hex(r)}${hex(gg)}${hex(b)}${hex(a)}`);
      }
  });
}
const file = process.argv[2] ?? 'map-preview.png';
writeFileSync(file, encodePng(out.width, out.height, out.data));
console.warn(`✓ ${file}`);
