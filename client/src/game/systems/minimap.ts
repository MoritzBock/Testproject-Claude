import type Phaser from 'phaser';

/** Average colour per tile index, computed once from the tileset texture. */
export function tileColors(
  scene: Phaser.Scene,
  textureKey: string,
  tileSize: number,
): Array<[number, number, number, number]> {
  const src = scene.textures.get(textureKey).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const cols = Math.floor(src.width / tileSize);
  const rows = Math.floor(src.height / tileSize);
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < cols * rows; i++) {
    const d = g.getImageData(
      (i % cols) * tileSize,
      Math.floor(i / cols) * tileSize,
      tileSize,
      tileSize,
    ).data;
    let r = 0,
      gg = 0,
      b = 0,
      a = 0;
    for (let p = 0; p < d.length; p += 4) {
      const al = d[p + 3]! / 255;
      r += d[p]! * al;
      gg += d[p + 1]! * al;
      b += d[p + 2]! * al;
      a += al;
    }
    const n = Math.max(a, 1);
    out.push([r / n, gg / n, b / n, a / (d.length / 4)]);
  }
  return out;
}

/** Shared canvas for the HUD minimap and the world map (1 pixel = 1 tile). */
export const minimapCanvas = document.createElement('canvas');

export function renderMinimap(
  layers: Phaser.Tilemaps.TilemapLayer[],
  colors: Array<[number, number, number, number]>,
  width: number,
  height: number,
): void {
  minimapCanvas.width = width;
  minimapCanvas.height = height;
  const g = minimapCanvas.getContext('2d')!;
  const img = g.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let col: [number, number, number, number] | undefined;
      // top-most visible tile wins
      for (let li = layers.length - 1; li >= 0 && !col; li--) {
        const t = layers[li]!.getTileAt(x, y);
        if (t && t.index > 0 && t.visible && t.alpha > 0.5) {
          const c = colors[t.index - 1];
          if (c && c[3] > 0.4) col = c;
        }
      }
      const i = (y * width + x) * 4;
      const [r, gg, b] = col ?? [20, 20, 31, 1];
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}
