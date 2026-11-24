/**
 * Paper-doll layers. Every layer uses the same 16×24 animation grid as the character
 * (4 walk frames × 4 directions). Layers are GRAYSCALE – colours are applied at runtime
 * via multiplicative tint, so one sheet serves every colour variant.
 */
import { PixelCanvas, type Color } from './canvas.js';
import { CHAR_H, CHAR_W, DIRECTIONS, WALK_FRAMES, template } from './sprites.js';

type Dir = (typeof DIRECTIONS)[number];
type View = 'down' | 'up' | 'side';
type Grid = string[][];

/** Gray levels: L light, M mid, D dark, O outline, E eye. */
const GRAY: Record<string, Color> = {
  L: '#ffffff',
  M: '#c4c4c4',
  D: '#8a8a8a',
  O: '#2b2b33',
  E: '#111118',
};

interface Ctx {
  /** Base template characters (left-facing for side view). */
  t: Grid;
  view: View;
  frame: number;
  out: Grid;
}

const blank = (): Grid => Array.from({ length: CHAR_H }, () => Array<string>(CHAR_W).fill('.'));
const set = (c: Ctx, x: number, y: number, ch: string) => {
  if (x >= 0 && y >= 0 && x < CHAR_W && y < CHAR_H) c.out[y]![x] = ch;
};
const rect = (c: Ctx, x0: number, y0: number, x1: number, y1: number, ch: string) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(c, x, y, ch);
};
/** Maps template chars to layer chars. */
const mapChars = (
  c: Ctx,
  map: Record<string, string>,
  rows?: [number, number],
  cols?: [number, number],
) => {
  c.t.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (rows && (y < rows[0] || y > rows[1])) return;
      if (cols && (x < cols[0] || x > cols[1])) return;
      const m = map[ch];
      if (m) set(c, x, y, m);
    }),
  );
};

type Shape = (c: Ctx) => void;

const hairBase: Shape = (c) => mapChars(c, { h: 'M', H: 'L' });

export const LAYER_SHAPES: Record<string, Shape> = {
  body: (c) =>
    mapChars(c, {
      o: 'O',
      s: 'L',
      S: 'M',
      e: 'E',
      h: 'L',
      H: 'L',
      t: 'L',
      T: 'L',
      p: 'L',
      P: 'L',
      b: 'L',
    }),

  // --- hair -------------------------------------------------------------------------
  'hair-short': hairBase,
  'hair-long': (c) => {
    hairBase(c);
    if (c.view === 'down') {
      rect(c, 3, 5, 3, 11, 'M');
      rect(c, 12, 5, 12, 11, 'M');
      rect(c, 2, 6, 2, 12, 'O');
      rect(c, 13, 6, 13, 12, 'O');
    } else if (c.view === 'up') {
      rect(c, 4, 9, 11, 13, 'M');
      rect(c, 5, 10, 10, 10, 'L');
      rect(c, 3, 9, 3, 13, 'O');
      rect(c, 12, 9, 12, 13, 'O');
    } else {
      rect(c, 9, 6, 12, 13, 'M');
      rect(c, 13, 7, 13, 13, 'O');
    }
  },
  'hair-spiky': (c) => {
    hairBase(c);
    for (const x of [4, 6, 8, 10]) {
      set(c, x, 1, 'M');
      set(c, x + 1, 1, 'L');
      set(c, x + 1, 0, 'O');
    }
  },
  'hair-bun': (c) => {
    hairBase(c);
    const cx = c.view === 'side' ? 9 : 6;
    rect(c, cx, 0, cx + 3, 0, 'O');
    rect(c, cx, 1, cx + 3, 1, 'M');
    set(c, cx + 1, 1, 'L');
  },
  'hair-mohawk': (c) => {
    mapChars(c, { h: 'M', H: 'L' }, [2, 12], c.view === 'side' ? [5, 10] : [6, 9]);
    rect(c, 6, 0, 9, 1, 'M');
    rect(c, 7, 0, 8, 0, 'L');
  },
  'hair-curly': (c) => {
    hairBase(c);
    for (let x = 4; x <= 11; x++) set(c, x, 2, x % 2 ? 'M' : 'L');
    for (const x of [4, 5, 7, 8, 10, 11]) set(c, x, 1, 'M');
    if (c.view !== 'up') {
      rect(c, 3, 3, 3, 6, 'M');
      rect(c, 12, 3, 12, 6, 'M');
    }
  },

  // --- tops ---------------------------------------------------------------------------
  'top-tshirt': (c) => mapChars(c, { t: 'L', T: 'M' }),
  'top-hoodie': (c) => {
    mapChars(c, { t: 'L', T: 'M' });
    if (c.view === 'up') rect(c, 4, 8, 11, 11, 'M');
    else rect(c, 5, 11, 10, 11, 'M');
    if (c.view === 'down') rect(c, 6, 15, 9, 15, 'D');
  },
  'top-jacket': (c) => {
    mapChars(c, { t: 'L', T: 'M' });
    if (c.view === 'down') {
      rect(c, 7, 12, 8, 16, 'D');
      set(c, 5, 12, 'D');
      set(c, 10, 12, 'D');
    }
  },
  'top-vest': (c) =>
    mapChars(c, { t: 'L', T: 'M' }, undefined, c.view === 'side' ? undefined : [5, 10]),
  'top-coat': (c) => {
    mapChars(c, { t: 'L', T: 'M' });
    mapChars(c, { p: 'L', P: 'M' }, [17, 20]);
    if (c.view === 'down') rect(c, 7, 13, 8, 20, 'D');
  },
  'top-sweater': (c) => {
    mapChars(c, { t: 'L', T: 'L' });
    mapChars(c, { t: 'D', T: 'D' }, [14, 14]);
  },

  // --- bottoms ------------------------------------------------------------------------
  'bottom-pants': (c) => mapChars(c, { p: 'L', P: 'M' }),
  'bottom-shorts': (c) => mapChars(c, { p: 'L', P: 'M' }, [17, 19]),
  'bottom-skirt': (c) => {
    mapChars(c, { p: 'L', P: 'M' }, [17, 19]);
    if (c.view !== 'side') {
      rect(c, 3, 19, 12, 19, 'L');
      set(c, 2, 19, 'O');
      set(c, 13, 19, 'O');
    }
  },
  'bottom-cargo': (c) => {
    mapChars(c, { p: 'L', P: 'M' });
    if (c.view !== 'side') {
      set(c, 4, 19, 'D');
      set(c, 11, 19, 'D');
    } else set(c, 7, 19, 'D');
  },

  // --- shoes --------------------------------------------------------------------------
  'shoes-sneakers': (c) => mapChars(c, { b: 'L' }),
  'shoes-boots': (c) => {
    mapChars(c, { b: 'M' });
    mapChars(c, { p: 'M', P: 'M' }, [21, 21]);
  },

  // --- hats ---------------------------------------------------------------------------
  'hat-cap': (c) => {
    rect(c, 5, 1, 10, 1, 'O');
    rect(c, 4, 2, 11, 4, 'L');
    if (c.view === 'down') rect(c, 3, 5, 12, 5, 'M');
    else if (c.view === 'side') rect(c, 1, 5, 6, 5, 'M');
    else rect(c, 4, 5, 11, 5, 'L');
  },
  'hat-beanie': (c) => {
    rect(c, 7, 0, 8, 0, 'L');
    rect(c, 5, 1, 10, 1, 'L');
    rect(c, 4, 2, 11, 2, 'L');
    rect(c, 3, 3, 12, 4, 'L');
    rect(c, 3, 5, 12, 5, 'M');
  },
  'hat-headset': (c) => {
    rect(c, 4, 2, 11, 2, 'D');
    if (c.view === 'side') {
      rect(c, 8, 6, 10, 9, 'D');
      set(c, 9, 7, 'L');
    } else {
      rect(c, 2, 6, 3, 9, 'D');
      rect(c, 12, 6, 13, 9, 'D');
      set(c, 3, 3, 'D');
      set(c, 12, 3, 'D');
      if (c.view === 'down') rect(c, 3, 10, 5, 10, 'D');
    }
  },
  'hat-crown': (c) => {
    for (const x of [4, 7, 8, 11]) set(c, x, 0, 'L');
    rect(c, 4, 1, 11, 3, 'L');
    set(c, 6, 2, 'D');
    set(c, 9, 2, 'D');
  },
  'hat-bandana': (c) => {
    rect(c, 3, 3, 12, 4, 'L');
    rect(c, 3, 4, 12, 4, 'M');
    if (c.view === 'down') rect(c, 13, 4, 13, 6, 'M');
    else if (c.view === 'side') rect(c, 12, 4, 13, 6, 'M');
    else rect(c, 7, 5, 8, 7, 'M');
  },

  // --- accessories --------------------------------------------------------------------------
  'acc-glasses': (c) => {
    if (c.view === 'down') {
      for (const x of [4, 5, 6, 9, 10, 11]) set(c, x, 7, 'D');
      for (const x of [4, 6, 9, 11]) set(c, x, 8, 'D');
      rect(c, 7, 8, 8, 8, 'D');
    } else if (c.view === 'side') {
      rect(c, 3, 7, 5, 7, 'D');
      set(c, 3, 8, 'D');
      set(c, 5, 8, 'D');
      rect(c, 6, 7, 9, 7, 'D');
    } else {
      set(c, 3, 7, 'D');
      set(c, 12, 7, 'D');
    }
  },
  'acc-visor': (c) => {
    if (c.view === 'down') {
      rect(c, 3, 7, 12, 8, 'L');
      rect(c, 3, 8, 12, 8, 'M');
    } else if (c.view === 'side') rect(c, 3, 7, 8, 8, 'L');
    else rect(c, 3, 7, 12, 7, 'D');
  },
  'acc-scarf': (c) => {
    rect(c, 4, 11, 11, 11, 'L');
    rect(c, 4, 12, 11, 12, 'M');
    if (c.view === 'down') rect(c, 9, 13, 9, 14, 'M');
  },
  'acc-badge': (c) => {
    if (c.view === 'down') {
      rect(c, 9, 13, 10, 14, 'L');
      set(c, 10, 14, 'M');
    } else if (c.view === 'side') rect(c, 5, 13, 5, 14, 'L');
  },

  // --- back -----------------------------------------------------------------------------------
  'back-backpack': (c) => {
    if (c.view === 'down') {
      rect(c, 1, 13, 1, 17, 'M');
      rect(c, 14, 13, 14, 17, 'M');
    } else if (c.view === 'up') {
      rect(c, 4, 12, 11, 18, 'L');
      rect(c, 4, 13, 11, 13, 'M');
      rect(c, 3, 12, 3, 18, 'O');
      rect(c, 12, 12, 12, 18, 'O');
      rect(c, 4, 19, 11, 19, 'O');
    } else {
      rect(c, 10, 12, 13, 18, 'L');
      rect(c, 14, 12, 14, 18, 'O');
    }
  },
  'back-cape': (c) => {
    if (c.view === 'down') {
      rect(c, 2, 13, 2, 21, 'M');
      rect(c, 13, 13, 13, 21, 'M');
    } else if (c.view === 'up') {
      rect(c, 3, 11, 12, 21, 'L');
      for (const x of [5, 8, 11]) rect(c, x, 14, x, 21, 'M');
    } else rect(c, 9, 12, 13, 21, 'L');
  },
  'back-wings': (c) => {
    const wing = (x0: number, dir: 1 | -1) => {
      for (let i = 0; i < 4; i++)
        rect(c, x0 + dir * i, 10 + i, x0 + dir * i, 15 - i, i % 2 ? 'M' : 'L');
    };
    if (c.view === 'side') wing(11, 1);
    else {
      wing(2, -1);
      wing(13, 1);
    }
  },
};

/** Back items are drawn behind the body except when looking at the character's back. */
export const LAYER_KEYS = Object.keys(LAYER_SHAPES);

export function renderLayer(key: string): PixelCanvas {
  const shape = LAYER_SHAPES[key];
  if (!shape) throw new Error(`Unknown layer ${key}`);
  const sheet = new PixelCanvas(CHAR_W * WALK_FRAMES, CHAR_H * DIRECTIONS.length);
  DIRECTIONS.forEach((dir: Dir, row) => {
    for (let f = 0; f < WALK_FRAMES; f++) {
      const srcDir: Dir = dir === 'right' ? 'left' : dir;
      const ctx: Ctx = {
        t: template(srcDir, f).map((r) => [...r]),
        view: srcDir === 'left' ? 'side' : (srcDir as 'down' | 'up'),
        frame: f,
        out: blank(),
      };
      shape(ctx);
      let rows = ctx.out.map((r) => r.join(''));
      if (dir === 'right') rows = rows.map((r) => [...r].reverse().join(''));
      const bob = f % 2 === 1 ? 1 : 0;
      const x = f * CHAR_W;
      const y = row * CHAR_H;
      sheet.art(x, y - bob, rows.slice(0, 19), GRAY);
      sheet.art(x, y + 19, rows.slice(19), GRAY);
    }
  });
  return sheet;
}
