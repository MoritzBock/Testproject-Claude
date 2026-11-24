import { PixelCanvas, rng } from './canvas.js';
import { P } from './palette.js';

export const TILE = 16;
export const TILESET_COLUMNS = 16;

interface TileDef {
  name: string;
  collides?: boolean;
  /** Names of tiles forming the animation (first frame = this tile). */
  animation?: { frames: string[]; duration: number };
  draw: (c: PixelCanvas, seed: number) => void;
}

// ---------------------------------------------------------------------------
// Drawing helpers (all coordinates relative to the current 16×16 cell)
// ---------------------------------------------------------------------------

function grassBase(c: PixelCanvas, seed: number, base = P.grass) {
  const r = rng(seed);
  c.rect(0, 0, 16, 16, base);
  c.noise(0, 0, 16, 16, P.grassLight, 10, r);
  c.noise(0, 0, 16, 16, P.grassDark, 10, r);
}

function water(c: PixelCanvas, frame: number) {
  c.rect(0, 0, 16, 16, P.water);
  // diagonal wave bands shifting per frame (seamless across tiles: period 16)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (x + y * 2 + frame * 4) % 16;
      if (v === 0 || v === 1) c.px(x, y, P.waterLight);
      else if (v === 8) c.px(x, y, P.waterDark);
    }
  }
  const r = rng(100 + frame);
  c.noise(0, 0, 16, 16, P.foam, 2, r);
}

function plank(c: PixelCanvas, vertical: boolean) {
  c.rect(0, 0, 16, 16, P.wood);
  for (let i = 0; i < 16; i += 4) {
    if (vertical) c.rect(i, 0, 1, 16, P.woodDark);
    else c.rect(0, i, 16, 1, P.woodDark);
  }
  if (vertical) {
    c.rect(0, 0, 16, 1, P.woodLight);
  } else {
    c.rect(0, 0, 1, 16, P.woodDark);
    c.rect(15, 0, 1, 16, P.woodDark);
  }
  c.px(2, 2, P.woodLight);
  c.px(10, 6, P.woodLight);
  c.px(6, 10, P.woodLight);
}

function treeCanopy(c: PixelCanvas, half: 'L' | 'R') {
  // 32×16 canopy split into two tiles; drawn with circuit traces ("Platinenbaum")
  const rows = [
    '......llllll....',
    '....llLLLLllll..',
    '...lLLLLLLLLlll.',
    '..lLLLlllLLLLll.',
    '.lLLlllllllLLlll',
    '.lLllllTllllLlll',
    'lLllllTTTllllldl',
    'lLlllllTlllllldl',
    'llllllllllllldll',
    'llllldllllllddll',
    'lllllddllllddlll',
    '.llllllllllldll.',
    '.dllllllllllddl.',
    '..ddllllllllddd.',
    '...dddllllddd...',
    '.....dd..dd.....',
  ];
  const pal = { l: P.leaf, L: P.leafLight, d: P.leafDark, T: P.trace };
  // left half: as is; right half: mirrored
  if (half === 'L') c.art(0, 0, rows, pal);
  else
    c.art(
      0,
      0,
      rows.map((r) => [...r].reverse().join('')),
      pal,
    );
  // LED "fruit"
  c.px(half === 'L' ? 9 : 5, 9, P.led);
}

function treeTrunk(c: PixelCanvas, half: 'L' | 'R') {
  const rows = [
    '.....dd..dd.....',
    '......dllld.....',
    '.......ttt......',
    '.......tTt......',
    '.......ttt......',
    '......tttTt.....',
    '......ttTtt.....',
    '.....ttttttt....',
    '....ss.....ss...',
    '................',
  ];
  const pal = { d: P.leafDark, l: P.leaf, t: P.trunk, T: P.trace, s: '#00000040' };
  // The trunk sits at the seam between the two tiles: left tile shows its right part.
  const shifted = rows.map((r) =>
    half === 'L' ? '........' + r.slice(0, 8) : r.slice(8) + '........',
  );
  c.art(0, 0, shifted, pal);
}

function cliff(c: PixelCanvas, seed: number, top: boolean) {
  const r = rng(seed);
  c.rect(0, 0, 16, 16, P.rock);
  c.noise(0, 0, 16, 16, P.rockDark, 14, r);
  c.noise(0, 0, 16, 16, P.rockLight, 8, r);
  for (let x = 0; x < 16; x += 5) c.rect(x, 4, 1, 12, P.rockDark);
  if (top) {
    c.rect(0, 0, 16, 3, P.grassDark);
    c.rect(0, 3, 16, 1, P.rockLight);
  }
  c.rect(0, 15, 16, 1, P.rockDark);
}

function firewall(c: PixelCanvas, frame: number) {
  c.rect(0, 0, 16, 16, '#00000000');
  c.rect(0, 12, 16, 4, P.metalDark);
  c.rect(0, 12, 16, 1, P.metalLight);
  const flames = frame === 0 ? [3, 9, 5, 11, 4, 8, 12, 6] : [8, 4, 10, 5, 12, 3, 7, 9];
  for (let x = 0; x < 16; x++) {
    const h = flames[x % 8]!;
    for (let y = 12 - h; y < 12; y++) {
      c.px(x, y, y < 12 - h + 2 ? P.fireLight : P.fire);
    }
  }
  // brick pattern on the base
  c.px(4, 14, P.metal);
  c.px(12, 14, P.metal);
}

// ---------------------------------------------------------------------------
// Tile list (order = tile id, gid = id + 1)
// ---------------------------------------------------------------------------

export const TILE_DEFS: TileDef[] = [
  { name: 'grass', draw: (c, s) => grassBase(c, s) },
  { name: 'grass2', draw: (c, s) => grassBase(c, s + 7) },
  {
    name: 'grassFlowers',
    draw: (c, s) => {
      grassBase(c, s);
      const r = rng(s + 3);
      for (let i = 0; i < 4; i++) {
        const x = 2 + Math.floor(r() * 12);
        const y = 2 + Math.floor(r() * 12);
        const col = [P.flowerRed, P.flowerYellow, P.flowerBlue, P.white][i]!;
        c.px(x, y, col);
        c.px(x + 1, y, col);
        c.px(x, y + 1, P.grassDark);
      }
    },
  },
  {
    name: 'tallGrass',
    draw: (c, s) => {
      grassBase(c, s);
      for (let x = 1; x < 16; x += 3) {
        c.rect(x, 8, 1, 6, P.grassDark);
        c.px(x, 7, P.grassLight);
      }
    },
  },
  {
    name: 'path',
    draw: (c, s) => {
      const r = rng(s);
      c.rect(0, 0, 16, 16, P.dirt);
      c.noise(0, 0, 16, 16, P.dirtDark, 14, r);
      c.noise(0, 0, 16, 16, P.dirtLight, 8, r);
    },
  },
  {
    name: 'plaza',
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.stone);
      c.rect(0, 7, 16, 1, P.stoneDark);
      c.rect(0, 15, 16, 1, P.stoneDark);
      c.rect(7, 0, 1, 7, P.stoneDark);
      c.rect(15, 8, 1, 7, P.stoneDark);
      c.rect(0, 0, 7, 1, P.stoneLight);
      c.rect(8, 8, 7, 1, P.stoneLight);
    },
  },
  {
    name: 'plazaChip',
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.stone);
      c.rect(1, 1, 14, 14, P.stoneDark);
      c.rect(2, 2, 12, 12, P.stone);
      c.rect(5, 5, 6, 6, P.metal);
      c.rect(6, 6, 4, 4, P.screenGlow);
      for (let i = 3; i < 13; i += 3) {
        c.px(i, 1, P.trace);
        c.px(i, 14, P.trace);
        c.px(1, i, P.trace);
        c.px(14, i, P.trace);
      }
    },
  },
  {
    name: 'sand',
    draw: (c, s) => {
      const r = rng(s);
      c.rect(0, 0, 16, 16, P.sand);
      c.noise(0, 0, 16, 16, P.sandDark, 12, r);
      c.noise(0, 0, 16, 16, P.sandLight, 8, r);
    },
  },
  {
    name: 'sandShell',
    draw: (c, s) => {
      const r = rng(s + 1);
      c.rect(0, 0, 16, 16, P.sand);
      c.noise(0, 0, 16, 16, P.sandDark, 12, r);
      c.art(5, 6, ['.ww.', 'wpww', '.ww.'], { w: P.white, p: P.flowerRed });
    },
  },
  {
    name: 'water0',
    collides: true,
    animation: { frames: ['water0', 'water1', 'water2', 'water3'], duration: 280 },
    draw: (c) => water(c, 0),
  },
  { name: 'water1', collides: true, draw: (c) => water(c, 1) },
  { name: 'water2', collides: true, draw: (c) => water(c, 2) },
  { name: 'water3', collides: true, draw: (c) => water(c, 3) },
  {
    name: 'forestFloor',
    draw: (c, s) => {
      const r = rng(s);
      c.rect(0, 0, 16, 16, P.forest);
      c.noise(0, 0, 16, 16, P.forestDark, 16, r);
      c.noise(0, 0, 16, 16, P.forestLight, 8, r);
    },
  },
  {
    name: 'circuitPath',
    draw: (c, s) => {
      const r = rng(s);
      c.rect(0, 0, 16, 16, P.dirtDark);
      c.noise(0, 0, 16, 16, P.dirt, 14, r);
      c.rect(0, 7, 16, 1, P.traceDark);
      c.rect(7, 0, 1, 16, P.traceDark);
      c.rect(6, 6, 3, 3, P.trace);
    },
  },
  {
    name: 'rockFloor',
    draw: (c, s) => {
      const r = rng(s);
      c.rect(0, 0, 16, 16, P.rockLight);
      c.noise(0, 0, 16, 16, P.rock, 18, r);
      c.noise(0, 0, 16, 16, P.stoneLight, 6, r);
    },
  },
  {
    name: 'metalFloor',
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.metal);
      c.rect(0, 0, 16, 1, P.metalLight);
      c.rect(0, 0, 1, 16, P.metalLight);
      c.rect(15, 0, 1, 16, P.metalDark);
      c.rect(0, 15, 16, 1, P.metalDark);
      c.px(3, 3, P.metalDark);
      c.px(12, 3, P.metalDark);
      c.px(3, 12, P.metalDark);
      c.px(12, 12, P.metalDark);
    },
  },
  { name: 'treeTopL', draw: (c) => treeCanopy(c, 'L') },
  { name: 'treeTopR', draw: (c) => treeCanopy(c, 'R') },
  { name: 'treeBottomL', collides: true, draw: (c) => treeTrunk(c, 'L') },
  { name: 'treeBottomR', collides: true, draw: (c) => treeTrunk(c, 'R') },
  { name: 'cliff', collides: true, draw: (c, s) => cliff(c, s, false) },
  { name: 'cliffTop', collides: true, draw: (c, s) => cliff(c, s, true) },
  {
    name: 'boulder',
    collides: true,
    draw: (c) => {
      c.art(
        1,
        2,
        [
          '....oooooo....',
          '..ooLLLLrroo..',
          '.oLLLLrrrrrro.',
          '.oLLrrrrrrrdo.',
          'oLLrrrrrrrrrdo',
          'oLrrrrrrrrrddo',
          'orrrrrrrrrrddo',
          'orrrrrrrrrdddo',
          'orrrrrrrrddddo',
          '.odrrrrrddddo.',
          '.oddddddddddo.',
          '..oooooooooo..',
        ],
        { o: P.outline, L: P.rockLight, r: P.rock, d: P.rockDark },
      );
    },
  },
  { name: 'bridge', draw: (c) => plank(c, true) },
  {
    name: 'firewall0',
    collides: true,
    animation: { frames: ['firewall0', 'firewall1'], duration: 320 },
    draw: (c) => firewall(c, 0),
  },
  { name: 'firewall1', collides: true, draw: (c) => firewall(c, 1) },
  {
    name: 'wall',
    collides: true,
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.wall);
      for (let y = 3; y < 16; y += 4) c.rect(0, y, 16, 1, P.wallDark);
      c.rect(0, 15, 16, 1, P.stoneDark);
    },
  },
  {
    name: 'roof',
    collides: true,
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.roof);
      for (let y = 0; y < 16; y += 4) {
        c.rect(0, y + 3, 16, 1, P.roofDark);
        for (let x = (y / 4) % 2 ? 0 : 4; x < 16; x += 8) c.rect(x, y, 1, 3, P.roofDark);
      }
      c.rect(0, 0, 16, 1, P.roofLight);
    },
  },
  {
    name: 'roofEdge',
    collides: true,
    draw: (c) => {
      c.rect(0, 0, 16, 10, P.roof);
      c.rect(0, 3, 16, 1, P.roofDark);
      c.rect(0, 7, 16, 1, P.roofDark);
      c.rect(0, 10, 16, 3, P.roofDark);
      c.rect(0, 13, 16, 3, P.wall);
    },
  },
  {
    name: 'door',
    collides: true,
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.wall);
      c.rect(3, 2, 10, 14, P.woodDark);
      c.rect(4, 3, 8, 13, P.wood);
      c.rect(8, 3, 1, 13, P.woodDark);
      c.px(10, 10, P.trace);
      c.px(6, 10, P.trace);
    },
  },
  {
    name: 'window',
    collides: true,
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.wall);
      for (let y = 3; y < 16; y += 4) c.rect(0, y, 16, 1, P.wallDark);
      c.rect(3, 3, 10, 8, P.woodDark);
      c.rect(4, 4, 8, 6, P.screenGlow);
      c.rect(4, 4, 3, 2, P.white);
      c.rect(7, 4, 1, 6, P.woodDark);
      c.rect(0, 15, 16, 1, P.stoneDark);
    },
  },
  {
    name: 'fence',
    collides: true,
    draw: (c) => {
      c.rect(0, 5, 16, 2, P.wood);
      c.rect(0, 10, 16, 2, P.wood);
      c.rect(2, 3, 2, 11, P.woodLight);
      c.rect(12, 3, 2, 11, P.woodLight);
      c.rect(2, 13, 2, 1, P.woodDark);
      c.rect(12, 13, 2, 1, P.woodDark);
    },
  },
  {
    name: 'flowerBed',
    draw: (c) => {
      c.rect(1, 4, 14, 10, P.dirtDark);
      const cols = [P.flowerRed, P.flowerYellow, P.flowerBlue];
      for (let i = 0; i < 6; i++) {
        const x = 2 + (i % 3) * 4;
        const y = 5 + Math.floor(i / 3) * 4;
        c.px(x + 1, y + 2, P.grassDark);
        c.rect(x, y, 3, 2, cols[i % 3]!);
      }
    },
  },
  {
    name: 'bench',
    collides: true,
    draw: (c) => {
      c.rect(1, 5, 14, 3, P.woodLight);
      c.rect(1, 9, 14, 2, P.wood);
      c.rect(2, 11, 2, 3, P.metalDark);
      c.rect(12, 11, 2, 3, P.metalDark);
      c.rect(1, 8, 14, 1, P.woodDark);
    },
  },
  {
    name: 'sign',
    collides: true,
    draw: (c) => {
      c.rect(7, 8, 2, 7, P.woodDark);
      c.rect(2, 2, 12, 7, P.woodLight);
      c.rect(2, 8, 12, 1, P.woodDark);
      c.rect(4, 4, 8, 1, P.woodDark);
      c.rect(4, 6, 6, 1, P.woodDark);
    },
  },
  {
    name: 'serverRack',
    collides: true,
    draw: (c) => {
      c.rect(1, 0, 14, 16, P.metalDark);
      c.rect(2, 1, 12, 14, P.black);
      for (let y = 2; y < 14; y += 3) {
        c.rect(3, y, 10, 2, P.metal);
        c.px(4, y, P.ledGreen);
        c.px(6, y, y % 2 ? P.led : P.ledRed);
      }
    },
  },
  {
    name: 'cable',
    draw: (c, s) => {
      grassBase(c, s);
      c.rect(0, 9, 6, 2, P.black);
      c.rect(5, 6, 2, 4, P.black);
      c.rect(6, 6, 10, 2, P.black);
      c.px(10, 6, P.led);
    },
  },
  {
    name: 'lamp',
    collides: true,
    draw: (c) => {
      c.rect(7, 4, 2, 11, P.metalDark);
      c.rect(5, 14, 6, 2, P.metal);
      c.rect(5, 0, 6, 4, P.metal);
      c.rect(6, 1, 4, 2, P.fireLight);
    },
  },
  {
    name: 'bush',
    collides: true,
    draw: (c) => {
      c.art(
        1,
        3,
        [
          '....oooooo....',
          '..ooLLLlllloo.',
          '.oLLLlllllllo.',
          'oLLllllllllldo',
          'oLlllTllllllld',
          'olllllllllldd.',
          'olllllllllddo.',
          '.oddllllddddo.',
          '..oooooooooo..',
        ],
        { o: P.outline, L: P.leafLight, l: P.leaf, d: P.leafDark, T: P.led },
      );
    },
  },
  {
    name: 'ledFlower',
    draw: (c, s) => {
      grassBase(c, s + 11);
      c.rect(4, 8, 1, 5, P.grassDark);
      c.rect(11, 6, 1, 6, P.grassDark);
      c.rect(3, 6, 3, 2, P.led);
      c.rect(10, 4, 3, 2, P.ledGreen);
    },
  },
  {
    name: 'fountainRim',
    collides: true,
    draw: (c) => {
      c.rect(0, 0, 16, 16, P.stoneDark);
      c.rect(1, 1, 14, 14, P.stone);
      c.rect(1, 1, 14, 2, P.stoneLight);
    },
  },
  {
    name: 'pier',
    draw: (c) => {
      plank(c, false);
      c.rect(0, 0, 1, 16, P.waterDark);
      c.rect(15, 0, 1, 16, P.waterDark);
    },
  },
  {
    name: 'portSign',
    collides: true,
    draw: (c) => {
      c.rect(7, 9, 2, 7, P.woodDark);
      c.rect(1, 2, 14, 8, P.screen);
      c.rect(1, 2, 14, 1, P.screenGlow);
      // "443"-ish glyph blocks (purely decorative)
      c.rect(3, 4, 2, 4, P.screenGlow);
      c.rect(7, 4, 2, 4, P.screenGlow);
      c.rect(11, 4, 2, 4, P.screenGlow);
    },
  },
  {
    name: 'mountainTop',
    collides: true,
    draw: (c, s) => {
      const r = rng(s);
      c.rect(0, 0, 16, 16, P.rockDark);
      c.noise(0, 0, 16, 16, P.rock, 20, r);
      c.noise(0, 0, 16, 16, P.white, 6, r);
    },
  },
];

export const TILE_ID: Record<string, number> = Object.fromEntries(
  TILE_DEFS.map((d, i) => [d.name, i]),
);
/** Global id in the map (firstgid = 1). */
export const gid = (name: string): number => {
  const id = TILE_ID[name];
  if (id === undefined) throw new Error(`Unknown tile ${name}`);
  return id + 1;
};

export function renderTileset(): { canvas: PixelCanvas; columns: number; count: number } {
  const rows = Math.ceil(TILE_DEFS.length / TILESET_COLUMNS);
  const canvas = new PixelCanvas(TILESET_COLUMNS * TILE, rows * TILE);
  TILE_DEFS.forEach((def, i) => {
    canvas.at((i % TILESET_COLUMNS) * TILE, Math.floor(i / TILESET_COLUMNS) * TILE);
    def.draw(canvas, 1000 + i * 17);
  });
  canvas.at(0, 0);
  return { canvas, columns: TILESET_COLUMNS, count: TILE_DEFS.length };
}

/** Tiled tileset description (embedded into the map). */
export function tiledTileset(imagePath: string, width: number, height: number) {
  return {
    firstgid: 1,
    name: 'bit-insel',
    tilewidth: TILE,
    tileheight: TILE,
    spacing: 0,
    margin: 0,
    columns: TILESET_COLUMNS,
    tilecount: TILE_DEFS.length,
    image: imagePath,
    imagewidth: width,
    imageheight: height,
    tiles: TILE_DEFS.map((d, id) => {
      const tile: Record<string, unknown> = {
        id,
        type: d.name,
        properties: [{ name: 'collides', type: 'bool', value: !!d.collides }],
      };
      if (d.animation) {
        tile.animation = d.animation.frames.map((f) => ({
          tileid: TILE_ID[f],
          duration: d.animation!.duration,
        }));
      }
      return tile;
    }),
  };
}
