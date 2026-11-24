import { rng } from './canvas.js';
import { TILE, TILE_DEFS, gid, tiledTileset } from './tiles.js';

export const MAP_W = 96;
export const MAP_H = 64;

type Layer = number[];
type Prop = { name: string; type: 'string' | 'bool' | 'int'; value: string | boolean | number };

interface MapObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  rotation: 0;
  visible: true;
  properties?: Prop[];
}

/** Placement data – also used by tests to check reachability. */
export const LAYOUT = {
  spawn: { x: 46, y: 48 },
  plaza: { x0: 38, y0: 30, x1: 54, y1: 44 },
  fountain: { x: 44, y: 35 },
  shop: { x: 42, y: 23, w: 7, door: 45 },
  workshop: { x: 56, y: 45, w: 6, door: 58 },
  cliffRows: [20, 21],
  pass: { x0: 38, x1: 40 },
  river: { x0: 66, x1: 68 },
  bridgeRows: [34, 35],
  portals: [
    { levelId: 'demo-a', kind: 'terminal', x: 50, y: 32 },
    { levelId: 'demo-b', kind: 'cave', x: 18, y: 27 },
    { levelId: 'demo-c', kind: 'frame', x: 22, y: 48 },
    { levelId: 'demo-d', kind: 'frame', x: 82, y: 29 },
    { levelId: 'demo-e', kind: 'rack', x: 39, y: 8 },
  ],
  npcs: [
    {
      npcId: 'paula',
      name: 'Pixel-Paula',
      sprite: 0,
      x: 49,
      y: 40,
      lines: [
        'Willkommen auf der Bit-Insel!',
        'Hier findest du überall Portale. Jedes Portal führt zu einem Level mit Lernaufgaben.',
        'Geh nah an ein Portal heran, dann siehst du, was dich erwartet.',
        'Mit der Weltkarte behältst du den Überblick.',
      ],
    },
    {
      npcId: 'bert',
      name: 'Bit-Bert',
      sprite: 1,
      x: 47,
      y: 29,
      lines: [
        'Hallo! Ich bin Bit-Bert vom Byte-Basar.',
        'Hier im Byte-Basar tauschst du deine Bytes gegen neue Kleidung.',
      ],
    },
    {
      npcId: 'karl',
      name: 'Kabel-Karl',
      sprite: 2,
      x: 63,
      y: 32,
      lines: [
        'Die Brücke zum Datenstrand ist noch im Bau.',
        'Sobald du insgesamt 3 Sterne gesammelt hast, ist sie fertig!',
      ],
    },
    {
      npcId: 'waechterin',
      name: 'Firewall-Wächterin',
      sprite: 3,
      x: 36,
      y: 23,
      lines: [
        'Halt! Hinter dieser Firewall liegt der Serverberg.',
        'Schließe zuerst die Level A, B und C ab, dann lasse ich dich durch.',
      ],
    },
  ],
  zones: [
    { zoneId: 'serverberg', label: 'Serverberg', x: 0, y: 0, w: 66, h: 22 },
    { zoneId: 'datenstrand', label: 'Datenstrand', x: 66, y: 0, w: 30, h: 64 },
    { zoneId: 'platinenwald', label: 'Platinenwald', x: 0, y: 22, w: 32, h: 42 },
    { zoneId: 'campus', label: 'Campus-Platz', x: 32, y: 22, w: 34, h: 42 },
  ],
  gates: [
    { gateId: 'datenstrand', mode: 'appear', x: 66, y: 34, w: 3, h: 2 },
    { gateId: 'serverberg', mode: 'vanish', x: 38, y: 20, w: 3, h: 2 },
  ],
} as const;

export function generateMap() {
  const r = rng(4242);
  const N = MAP_W * MAP_H;
  const ground: Layer = new Array(N).fill(gid('water0'));
  const deco: Layer = new Array(N).fill(0);
  const gates: Layer = new Array(N).fill(0);
  const above: Layer = new Array(N).fill(0);
  const idx = (x: number, y: number) => y * MAP_W + x;
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const set = (l: Layer, x: number, y: number, name: string | 0) => {
    if (inMap(x, y)) l[idx(x, y)] = name === 0 ? 0 : gid(name);
  };
  const get = (l: Layer, x: number, y: number) => (inMap(x, y) ? l[idx(x, y)]! : 0);

  // --- island mask ---------------------------------------------------------
  const cx = 48;
  const cy = 32;
  const land: boolean[] = new Array(N).fill(false);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x - cx) / 45;
      const dy = (y - cy) / 30;
      const a = Math.atan2(dy, dx);
      const wobble = 0.06 * Math.sin(a * 5 + 1.3) + 0.04 * Math.sin(a * 11);
      land[idx(x, y)] = Math.sqrt(dx * dx + dy * dy) < 0.93 + wobble;
    }
  }
  const isLand = (x: number, y: number) => inMap(x, y) && land[idx(x, y)]!;
  const coastDist = (x: number, y: number) => {
    for (let d = 1; d <= 2; d++)
      for (let j = -d; j <= d; j++)
        for (let i = -d; i <= d; i++) if (!isLand(x + i, y + j)) return d;
    return 99;
  };
  const { river, cliffRows, pass, plaza } = LAYOUT;

  // --- base terrain --------------------------------------------------------
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (!isLand(x, y)) continue;
      let t: string;
      const coastal = coastDist(x, y) <= 2;
      if (x >= river.x0 && x <= river.x1) t = 'water0';
      else if (y < cliffRows[0] && x < river.x0) t = 'rockFloor';
      else if (x > river.x1) t = r() < 0.05 ? 'sandShell' : 'sand';
      else if (coastal) t = 'sand';
      else if (x < 32) t = 'forestFloor';
      else {
        const v = r();
        t = v < 0.08 ? 'grassFlowers' : v < 0.4 ? 'grass2' : 'grass';
      }
      set(ground, x, y, t);
    }
  }

  // --- cliffs separating the Serverberg ------------------------------------
  for (let x = 0; x < river.x0; x++) {
    if (!isLand(x, cliffRows[0]) && !isLand(x, cliffRows[1])) continue;
    set(ground, x, cliffRows[0], 'cliffTop');
    set(ground, x, cliffRows[1], 'cliff');
  }

  // --- paths -----------------------------------------------------------------
  const path = (x0: number, y0: number, x1: number, y1: number, tile = 'path') => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) set(ground, x, y, tile);
  };
  path(45, 44, 47, 56); // spawn → plaza
  path(55, 34, 65, 35); // plaza → bridge
  path(pass.x0, 22, pass.x1, 29); // plaza → firewall
  path(pass.x0, cliffRows[0], pass.x1, cliffRows[1]); // pass itself (blocked by gate)
  path(pass.x0, 10, pass.x1, 19, 'metalFloor'); // up the mountain
  path(32, 38, 37, 39); // plaza → forest edge
  path(12, 38, 31, 39, 'circuitPath'); // through the forest
  path(18, 29, 19, 37, 'circuitPath'); // → portal B
  path(22, 40, 23, 46, 'circuitPath'); // → portal C
  path(69, 34, 81, 35, 'sand'); // strand (already sand; keeps area tidy)

  // --- plaza and fountain --------------------------------------------------
  for (let y = plaza.y0; y <= plaza.y1; y++)
    for (let x = plaza.x0; x <= plaza.x1; x++)
      set(ground, x, y, (x + y) % 6 === 0 && (x - plaza.x0) % 4 === 0 ? 'plazaChip' : 'plaza');
  const f = LAYOUT.fountain;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++)
      set(
        ground,
        f.x + i,
        f.y + j,
        i === 0 || j === 0 || i === 3 || j === 3 ? 'fountainRim' : 'water0',
      );

  // --- buildings -------------------------------------------------------------
  const building = (bx: number, by: number, w: number, door: number) => {
    for (let i = 0; i < w; i++) {
      set(deco, bx + i, by, 'roof');
      set(deco, bx + i, by + 1, 'roof');
      set(deco, bx + i, by + 2, 'roofEdge');
      set(deco, bx + i, by + 3, i % 3 === 1 ? 'window' : 'wall');
      set(deco, bx + i, by + 4, bx + i === door ? 'door' : i % 3 === 1 ? 'window' : 'wall');
    }
  };
  building(LAYOUT.shop.x, LAYOUT.shop.y, LAYOUT.shop.w, LAYOUT.shop.door);
  path(LAYOUT.shop.door, LAYOUT.shop.y + 5, LAYOUT.shop.door, plaza.y0 - 1);
  set(deco, LAYOUT.shop.x - 1, LAYOUT.shop.y + 5, 'sign');
  building(LAYOUT.workshop.x, LAYOUT.workshop.y, LAYOUT.workshop.w, LAYOUT.workshop.door);
  path(LAYOUT.workshop.door, LAYOUT.workshop.y + 5, LAYOUT.workshop.door, 52);
  path(48, 52, LAYOUT.workshop.door, 52);

  // --- plaza decoration ------------------------------------------------------
  for (const [x, y] of [
    [37, 29],
    [55, 29],
    [37, 45],
    [55, 45],
  ] as const)
    set(deco, x, y, 'lamp');
  for (const [x, y] of [
    [41, 42],
    [51, 42],
  ] as const)
    set(deco, x, y, 'bench');
  for (const [x, y] of [
    [39, 41],
    [53, 41],
    [39, 32],
  ] as const)
    set(deco, x, y, 'flowerBed');
  set(deco, 37, 37, 'sign'); // signpost to the forest
  set(deco, 64, 36, 'sign'); // signpost to the bridge

  // --- gates -----------------------------------------------------------------
  for (const y of LAYOUT.bridgeRows)
    for (let x = river.x0; x <= river.x1; x++) set(gates, x, y, 'bridge');
  for (const y of cliffRows) for (let x = pass.x0; x <= pass.x1; x++) set(gates, x, y, 'firewall0');

  // --- pier at the Datenstrand -------------------------------------------------
  {
    const y = 40;
    let x = 70;
    while (isLand(x, y)) x++;
    for (let i = 0; i < 6; i++) set(ground, x + i, y, 'pier');
    set(deco, x - 2, y - 1, 'portSign');
    set(deco, x - 2, y + 1, 'portSign');
  }

  // --- vegetation and props ----------------------------------------------------
  const nearPath = (x: number, y: number, d: number) => {
    for (let j = -d; j <= d; j++)
      for (let i = -d; i <= d; i++) {
        const g = get(ground, x + i, y + j);
        if (
          g === gid('path') ||
          g === gid('circuitPath') ||
          g === gid('plaza') ||
          g === gid('pier')
        )
          return true;
      }
    return false;
  };
  const nearPortalOrNpc = (x: number, y: number, d: number) =>
    [...LAYOUT.portals, ...LAYOUT.npcs, LAYOUT.spawn].some(
      (p) => Math.abs(p.x - x) <= d + 1 && Math.abs(p.y - y) <= d + 1,
    );
  const freeGround = (x: number, y: number, allowed: string[]) =>
    allowed.some((a) => get(ground, x, y) === gid(a)) &&
    get(deco, x, y) === 0 &&
    get(above, x, y) === 0;

  const placeTree = (x: number, y: number, allowed: string[]) => {
    for (const [i, j] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const)
      if (!freeGround(x + i, y + j, allowed)) return false;
    if (nearPath(x, y + 1, 1) || nearPath(x + 1, y + 1, 1) || nearPortalOrNpc(x, y, 2))
      return false;
    set(above, x, y, 'treeTopL');
    set(above, x + 1, y, 'treeTopR');
    set(deco, x, y + 1, 'treeBottomL');
    set(deco, x + 1, y + 1, 'treeBottomR');
    return true;
  };
  const forest = ['forestFloor'];
  for (let y = 22; y < MAP_H - 2; y += 3)
    for (let x = 1; x < 31; x += 3) {
      const jx = Math.floor(r() * 2);
      const jy = Math.floor(r() * 2);
      if (r() < 0.82) placeTree(x + jx, y + jy, forest);
    }
  // lighter vegetation around the campus and on the beach
  for (let n = 0; n < 60; n++) {
    const x = 33 + Math.floor(r() * 32);
    const y = 22 + Math.floor(r() * 40);
    if (x > plaza.x0 - 3 && x < plaza.x1 + 3 && y > plaza.y0 - 3 && y < plaza.y1 + 3) continue;
    placeTree(x, y, ['grass', 'grass2', 'grassFlowers']);
  }
  for (let n = 0; n < 80; n++) {
    const x = 33 + Math.floor(r() * 32);
    const y = 22 + Math.floor(r() * 40);
    if (!freeGround(x, y, ['grass', 'grass2']) || nearPath(x, y, 1) || nearPortalOrNpc(x, y, 1))
      continue;
    const v = r();
    set(ground, x, y, v < 0.4 ? 'ledFlower' : v < 0.6 ? 'cable' : 'tallGrass');
  }
  for (let n = 0; n < 40; n++) {
    const x = 1 + Math.floor(r() * 30);
    const y = 23 + Math.floor(r() * 38);
    if (freeGround(x, y, forest) && !nearPath(x, y, 0) && !nearPortalOrNpc(x, y, 1))
      set(deco, x, y, 'bush');
  }
  for (let n = 0; n < 25; n++) {
    const x = 70 + Math.floor(r() * 24);
    const y = 2 + Math.floor(r() * 60);
    if (
      freeGround(x, y, ['sand', 'sandShell']) &&
      !nearPath(x, y, 1) &&
      !nearPortalOrNpc(x, y, 2) &&
      Math.abs(y - 34.5) > 2
    )
      set(deco, x, y, r() < 0.5 ? 'bush' : 'boulder');
  }
  // mountain: server racks, boulders and peaks
  for (let n = 0; n < 90; n++) {
    const x = 2 + Math.floor(r() * 62);
    const y = 1 + Math.floor(r() * 18);
    if (!freeGround(x, y, ['rockFloor']) || nearPath(x, y, 1) || nearPortalOrNpc(x, y, 2)) continue;
    const v = r();
    set(deco, x, y, v < 0.25 ? 'serverRack' : v < 0.5 ? 'boulder' : 'mountainTop');
  }
  // metal platform around the server portal
  const e = LAYOUT.portals.find((p) => p.levelId === 'demo-e')!;
  path(e.x - 3, e.y - 2, e.x + 4, e.y + 1, 'metalFloor');

  // --- objects -------------------------------------------------------------
  let nextId = 1;
  const props = (o: Record<string, string | number | boolean>): Prop[] =>
    Object.entries(o).map(([name, value]) => ({
      name,
      type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'int' : 'string',
      value,
    }));
  const point = (
    name: string,
    type: string,
    tx: number,
    ty: number,
    p: Record<string, string | number | boolean>,
  ): MapObject => ({
    id: nextId++,
    name,
    type,
    // point at the bottom centre of the given tile
    x: tx * TILE + TILE / 2,
    y: (ty + 1) * TILE,
    width: 0,
    height: 0,
    point: true,
    rotation: 0,
    visible: true,
    properties: props(p),
  });
  const rect = (
    name: string,
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
    p: Record<string, string | number | boolean>,
  ): MapObject => ({
    id: nextId++,
    name,
    type,
    x: x * TILE,
    y: y * TILE,
    width: w * TILE,
    height: h * TILE,
    rotation: 0,
    visible: true,
    properties: props(p),
  });

  const objects: MapObject[] = [
    point('spawn', 'spawn', LAYOUT.spawn.x, LAYOUT.spawn.y, {}),
    // portals are 2 tiles wide: anchor between the two tiles
    ...LAYOUT.portals.map((p) => ({
      ...point(p.levelId, 'portal', p.x, p.y, { levelId: p.levelId, kind: p.kind }),
      x: (p.x + 1) * TILE,
    })),
    ...LAYOUT.npcs.map((n) =>
      point(n.name, 'npc', n.x, n.y, {
        npcId: n.npcId,
        sprite: n.sprite,
        lines: n.lines.join('|'),
      }),
    ),
  ];
  const zones = LAYOUT.zones.map((z) =>
    rect(z.label, 'zone', z.x, z.y, z.w, z.h, { zoneId: z.zoneId }),
  );
  const gateAreas = LAYOUT.gates.map((g) =>
    rect(g.gateId, 'gate', g.x, g.y, g.w, g.h, { gateId: g.gateId, mode: g.mode }),
  );

  const tileLayer = (id: number, name: string, data: Layer) => ({
    id,
    name,
    type: 'tilelayer',
    width: MAP_W,
    height: MAP_H,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data,
  });
  const objectLayer = (id: number, name: string, objs: MapObject[]) => ({
    id,
    name,
    type: 'objectgroup',
    draworder: 'topdown',
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    objects: objs,
  });

  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: MAP_W,
    height: MAP_H,
    tilewidth: TILE,
    tileheight: TILE,
    compressionlevel: -1,
    nextlayerid: 8,
    nextobjectid: nextId,
    properties: [{ name: 'generatedBy', type: 'string', value: 'scripts/generate-assets.ts' }],
    tilesets: [
      tiledTileset('../tilesets/tiles.png', 16 * TILE, Math.ceil(TILE_DEFS.length / 16) * TILE),
    ],
    layers: [
      tileLayer(1, 'ground', ground),
      tileLayer(2, 'deco', deco),
      tileLayer(3, 'gates', gates),
      tileLayer(4, 'above', above),
      objectLayer(5, 'objects', objects),
      objectLayer(6, 'zones', zones),
      objectLayer(7, 'gateAreas', gateAreas),
    ],
  };
}

export type TiledMap = ReturnType<typeof generateMap>;
