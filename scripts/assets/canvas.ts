/** Hex colour like "#1a2b3c" or "#1a2b3c80"; null = transparent. */
export type Color = string | null;

export function parseColor(c: Color): [number, number, number, number] {
  if (c === null) return [0, 0, 0, 0];
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (!m) throw new Error(`Invalid colour ${c}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

/** Deterministic PRNG (mulberry32) so generated assets are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiny pixel canvas with an origin offset for drawing into atlas cells. */
export class PixelCanvas {
  readonly data: Uint8Array;
  ox = 0;
  oy = 0;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  at(ox: number, oy: number): this {
    this.ox = ox;
    this.oy = oy;
    return this;
  }

  px(x: number, y: number, c: Color): void {
    const X = x + this.ox;
    const Y = y + this.oy;
    if (X < 0 || Y < 0 || X >= this.width || Y >= this.height || c === null) return;
    const [r, g, b, a] = parseColor(c);
    const i = (Y * this.width + X) * 4;
    if (a === 255) {
      this.data.set([r, g, b, 255], i);
      return;
    }
    // simple alpha blend over existing pixel
    const ea = this.data[i + 3]! / 255;
    const na = a / 255;
    const outA = na + ea * (1 - na);
    const mix = (n: number, e: number) =>
      outA === 0 ? 0 : Math.round((n * na + e * ea * (1 - na)) / outA);
    this.data.set(
      [
        mix(r, this.data[i]!),
        mix(g, this.data[i + 1]!),
        mix(b, this.data[i + 2]!),
        Math.round(outA * 255),
      ],
      i,
    );
  }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  /** Draws ASCII art: each char maps to a colour via `pal` ('.' / ' ' = skip). */
  art(x: number, y: number, rows: string[], pal: Record<string, Color>): void {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '.' || ch === ' ') return;
        const c = pal[ch];
        if (c === undefined) throw new Error(`No colour for '${ch}'`);
        this.px(x + i, y + j, c);
      });
    });
  }

  /** Sprinkles `count` random pixels of colour `c` into a w×h area. */
  noise(
    x: number,
    y: number,
    w: number,
    h: number,
    c: Color,
    count: number,
    r: () => number,
  ): void {
    for (let n = 0; n < count; n++) this.px(x + Math.floor(r() * w), y + Math.floor(r() * h), c);
  }

  getPixel(x: number, y: number): [number, number, number, number] {
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }
}
