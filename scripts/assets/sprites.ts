import { PixelCanvas, type Color } from './canvas.js';
import { P } from './palette.js';

/** Character frame size – shared by all paper-doll layers (M3). */
export const CHAR_W = 16;
export const CHAR_H = 24;
/** Sheet layout: 4 columns (walk frames) × 4 rows (down, left, right, up). */
export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export const WALK_FRAMES = 4;

type Dir = (typeof DIRECTIONS)[number];

// Character template legend (letters map to layer colours):
//  o outline · s skin · S skin shade · e eye · h hair · H hair light
//  t top · T top shade · p pants · P pants shade · b shoes
const HEAD_DOWN = [
  '................',
  '................',
  '....oooooooo....',
  '...ohhhhhhhho...',
  '...ohHHhhhhho...',
  '...ohhhhhhhho...',
  '...ohssssssho...',
  '...osssssssso...',
  '...osesssseso...',
  '...oSssssssSo...',
  '....oSssssSo....',
  '.....oooooo.....',
];
const HEAD_UP = [
  '................',
  '................',
  '....oooooooo....',
  '...ohhhhhhhho...',
  '...ohhhhhHHho...',
  '...ohhhhhhhho...',
  '...ohhhhhhhho...',
  '...ohhHhhhhho...',
  '...ohhhhhhhho...',
  '...ohhhhhhhho...',
  '....ohhhhhho....',
  '.....oooooo.....',
];
const HEAD_LEFT = [
  '................',
  '................',
  '....oooooooo....',
  '...ohhhhhhhho...',
  '...ohhhhhHHho...',
  '...ohhhhhhhho...',
  '...osssshhhho...',
  '...osssssshho...',
  '...oessssshho...',
  '...oSssssShho...',
  '....oSssssSo....',
  '.....oooooo.....',
];
const BODY_FRONT = [
  '....otttttto....',
  '...ottTttTtto...',
  '..otttttttttto..',
  '..ottTttttTtto..',
  '..osottttttoso..',
  '...oppppppppo...',
  '....oppppppo....',
];
const BODY_SIDE = [
  '.....otttto.....',
  '....ottTttto....',
  '....otttttto....',
  '....ottTttto....',
  '....osttttto....',
  '....oppppppo....',
  '.....oppppo.....',
];
const LEGS_FRONT: string[][] = [
  [
    '....oppooppo....',
    '....oPpooPpo....',
    '....oppooppo....',
    '....obboobbo....',
    '....oooooooo....',
  ],
  [
    '....oppooppo....',
    '....oPpooPpo....',
    '....oppoobbo....',
    '....obbo.oo.....',
    '....oooo........',
  ],
  [
    '....oppooppo....',
    '....oPpooPpo....',
    '....oppooppo....',
    '....obboobbo....',
    '....oooooooo....',
  ],
  [
    '....oppooppo....',
    '....oPpooPpo....',
    '....obbooppo....',
    '.....oo.obbo....',
    '........oooo....',
  ],
];
const LEGS_SIDE: string[][] = [
  [
    '.....oppppo.....',
    '.....oPppPo.....',
    '.....oppppo.....',
    '....obbbbbo.....',
    '....ooooooo.....',
  ],
  [
    '.....oppppo.....',
    '....oppo.opo....',
    '...oppo...opo...',
    '..obbbo...obbo..',
    '..ooooo...oooo..',
  ],
  [
    '.....oppppo.....',
    '.....oPppPo.....',
    '.....oppppo.....',
    '....obbbbbo.....',
    '....ooooooo.....',
  ],
  [
    '.....oppppo.....',
    '....oppoppo.....',
    '....oppoppo.....',
    '...obbboobbo....',
    '...ooooooooo....',
  ],
];

export interface CharacterColors {
  skin: Color;
  skinShade: Color;
  hair: Color;
  hairLight: Color;
  top: Color;
  topShade: Color;
  pants: Color;
  pantsShade: Color;
  shoes: Color;
}

function template(dir: Dir, frame: number): string[] {
  const head = dir === 'down' ? HEAD_DOWN : dir === 'up' ? HEAD_UP : HEAD_LEFT;
  const body = dir === 'down' || dir === 'up' ? BODY_FRONT : BODY_SIDE;
  const legs = (dir === 'down' || dir === 'up' ? LEGS_FRONT : LEGS_SIDE)[frame]!;
  const rows = [...head, ...body, ...legs];
  rows.forEach((r, i) => {
    if (r.length !== CHAR_W) throw new Error(`Template row ${i} (${dir}) has length ${r.length}`);
  });
  if (rows.length !== CHAR_H) throw new Error(`Template ${dir} has ${rows.length} rows`);
  // Side view facing right = mirror of left.
  return dir === 'right' ? rows.map((r) => [...r].reverse().join('')) : rows;
}

export function drawCharacter(
  c: PixelCanvas,
  x: number,
  y: number,
  dir: Dir,
  frame: number,
  col: CharacterColors,
) {
  const rows = template(dir, frame);
  // Walk bob: frames 1 and 3 lift the upper body by one pixel.
  const bob = frame % 2 === 1 ? 1 : 0;
  const pal: Record<string, Color> = {
    o: P.outline,
    s: col.skin,
    S: col.skinShade,
    e: P.outline,
    h: col.hair,
    H: col.hairLight,
    t: col.top,
    T: col.topShade,
    p: col.pants,
    P: col.pantsShade,
    b: col.shoes,
  };
  const upper = rows.slice(0, 19);
  const lower = rows.slice(19);
  c.art(x, y - bob, upper, pal); // row 0 is empty, so lifting by 1px is safe
  c.art(x, y + 19, lower, pal);
}

export function renderCharacterSheet(colors: CharacterColors[]): PixelCanvas {
  const sheet = new PixelCanvas(CHAR_W * WALK_FRAMES, CHAR_H * DIRECTIONS.length * colors.length);
  colors.forEach((col, n) => {
    DIRECTIONS.forEach((dir, row) => {
      for (let f = 0; f < WALK_FRAMES; f++) {
        drawCharacter(sheet, f * CHAR_W, (n * DIRECTIONS.length + row) * CHAR_H, dir, f, col);
      }
    });
  });
  return sheet;
}

export const PLAYER_COLORS: CharacterColors = {
  skin: '#f1c7a0',
  skinShade: '#d9a57f',
  hair: '#4a3426',
  hairLight: '#6e4c36',
  top: '#3d7fd9',
  topShade: '#2d5fae',
  pants: '#3a3f5c',
  pantsShade: '#2c3048',
  shoes: '#2a2230',
};

/** NPC order must match `npcSprite` indices in the map. */
export const NPC_COLORS: CharacterColors[] = [
  // 0 Pixel-Paula (guide)
  {
    ...PLAYER_COLORS,
    skin: '#c98e62',
    skinShade: '#a8724c',
    hair: '#7a3fa0',
    hairLight: '#9c5cc4',
    top: '#3e9a5a',
    topShade: '#2e7745',
  },
  // 1 Bit-Bert (merchant)
  {
    ...PLAYER_COLORS,
    skin: '#f4d2b0',
    skinShade: '#dab08a',
    hair: '#8b5a2b',
    hairLight: '#a8743f',
    top: '#e08a2e',
    topShade: '#b86a1c',
    pants: '#5a3d2a',
    pantsShade: '#45301f',
  },
  // 2 Kabel-Karl (bridge builder)
  {
    ...PLAYER_COLORS,
    skin: '#8d5a3b',
    skinShade: '#704530',
    hair: '#1f1f28',
    hairLight: '#3a3a48',
    top: '#f0c419',
    topShade: '#c99f0e',
  },
  // 3 Firewall-Wächterin
  {
    ...PLAYER_COLORS,
    skin: '#f1c7a0',
    skinShade: '#d9a57f',
    hair: '#d8d8e8',
    hairLight: '#ffffff',
    top: '#c0392b',
    topShade: '#962d22',
    pants: '#2b2b38',
    pantsShade: '#1e1e28',
  },
];

// ---------------------------------------------------------------------------
// Portals (32×32, 2 animation frames each)
// ---------------------------------------------------------------------------

export const PORTAL_SIZE = 32;
export const PORTAL_KINDS = ['terminal', 'rack', 'cave', 'frame'] as const;
export type PortalKind = (typeof PORTAL_KINDS)[number];

function portalGlow(c: PixelCanvas, x: number, y: number, w: number, h: number, frame: number) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = (i + j + frame * 3) % 6;
      c.px(x + i, y + j, v < 2 ? P.led : v < 4 ? P.screenGlow : '#2fa89e');
    }
  }
}

function drawPortal(c: PixelCanvas, kind: PortalKind, frame: number) {
  switch (kind) {
    case 'terminal': {
      c.rect(9, 26, 14, 5, P.stoneDark);
      c.rect(10, 26, 12, 1, P.stoneLight);
      c.rect(12, 12, 8, 14, P.metal);
      c.rect(12, 12, 1, 14, P.metalLight);
      c.rect(6, 1, 20, 13, P.outline);
      c.rect(7, 2, 18, 11, P.metalDark);
      c.rect(8, 3, 16, 9, P.screen);
      c.rect(9, 5, 8, 1, P.screenGlow);
      c.rect(9, 7, 11, 1, P.screenGlow);
      if (frame === 0) c.rect(9, 9, 2, 2, P.led);
      c.rect(14, 18, 4, 2, P.led);
      break;
    }
    case 'rack': {
      c.rect(2, 2, 7, 29, P.metalDark);
      c.rect(23, 2, 7, 29, P.metalDark);
      c.rect(2, 2, 28, 5, P.metalDark);
      for (let y = 8; y < 30; y += 3) {
        c.rect(3, y, 5, 2, P.metal);
        c.rect(24, y, 5, 2, P.metal);
        c.px(4, y, (y + frame) % 2 ? P.ledGreen : P.led);
        c.px(25, y, (y + frame) % 2 ? P.led : P.ledRed);
      }
      c.rect(2, 2, 28, 1, P.metalLight);
      portalGlow(c, 9, 7, 14, 24, frame);
      break;
    }
    case 'cave': {
      c.art(
        0,
        4,
        [
          '.........oooooooooooooo.........',
          '......oooLLLrrrrrrrrrrrooo......',
          '....ooLLLrrrrrrrrrrrrrrrrdoo....',
          '...oLLrrrrrrrrrrrrrrrrrrrrddo...',
          '..oLrrrrrrrooooooooooorrrrrddo..',
          '..oLrrrrrooxxxxxxxxxxxoorrrrdo..',
          '.oLrrrrrooxxxxxxxxxxxxxxoorrrdo.',
          '.oLrrrrroxxxxxxxxxxxxxxxxorrrdo.',
          '.orrrrrroxxxxxxxxxxxxxxxxorrddo.',
          'oLrrrrrroxxxxxxxxxxxxxxxxorrrddo',
          'orrrrrrroxxxxxxxxxxxxxxxxorrrddo',
          'orrrrrrroxxxxxxxxxxxxxxxxorrdddo',
          'orrrrrrroxxxxxxxxxxxxxxxxordddo.',
          'orrrrrrroxxxxxxxxxxxxxxxxoddddo.',
          'odrrrrrroxxxxxxxxxxxxxxxxodddo..',
          'oddrrrrroxxxxxxxxxxxxxxxxoddo...',
          '.odddrrroxxxxxxxxxxxxxxxxoddo...',
          '..oddddoxxxxxxxxxxxxxxxxxxodo...',
          '...oooooxxxxxxxxxxxxxxxxxxoo....',
        ],
        { o: P.outline, L: P.rockLight, r: P.rock, d: P.rockDark, x: P.black },
      );
      portalGlow(c, 10, 12, 12, 11, frame);
      // router antennas with blinking LEDs
      c.rect(8, 0, 1, 6, P.metalLight);
      c.rect(23, 0, 1, 6, P.metalLight);
      c.px(8, 0, frame ? P.ledGreen : P.ledRed);
      c.px(23, 0, frame ? P.ledRed : P.ledGreen);
      break;
    }
    case 'frame': {
      c.rect(14, 26, 4, 4, P.metalDark);
      c.rect(8, 29, 16, 2, P.metalDark);
      c.rect(2, 2, 28, 24, P.outline);
      c.rect(3, 3, 26, 22, P.metalLight);
      c.rect(4, 4, 24, 20, P.outline);
      portalGlow(c, 5, 5, 22, 18, frame);
      c.px(27, 24, frame ? P.ledGreen : P.led);
      break;
    }
  }
}

export function renderPortals(): PixelCanvas {
  const sheet = new PixelCanvas(PORTAL_SIZE * PORTAL_KINDS.length * 2, PORTAL_SIZE);
  PORTAL_KINDS.forEach((kind, k) => {
    for (let f = 0; f < 2; f++) {
      sheet.at((k * 2 + f) * PORTAL_SIZE, 0);
      drawPortal(sheet, kind, f);
    }
  });
  sheet.at(0, 0);
  return sheet;
}
