import { config } from './config';
import models from './models.json';

// The level: what it is made of, and the questions the game asks about it.
// No rendering here. scene.ts draws the same primitives and models, so what you see is what
// you collide with. Rock, towers and trees are primitives; buildings are imported models, each
// with a stack of invisible boxes that follows its outline.

export type Vec3 = [number, number, number];

interface Base {
  /** Centre of the shape. */
  pos: Vec3;
  color: string;
  rotY?: number;
  /** False for scenery you can fly through. */
  solid?: boolean;
  /** True for the invisible boxes that stand in for a model. */
  hidden?: boolean;
}

export type Prim =
  | (Base & { kind: 'box'; size: Vec3 })
  | (Base & { kind: 'cone'; height: number; rTop: number; rBottom: number; sides: number })
  | (Base & { kind: 'sphere'; radius: number });

export interface Updraft {
  x: number;
  z: number;
  base: number;
  top: number;
  radius: number;
  strength: number;
}

export type ModelName = keyof typeof models;

/** One copy of an imported model, standing on the ground at pos. */
export interface Placement {
  name: ModelName;
  pos: Vec3;
  rotY: number;
  scale: number;
}

export interface Ring {
  pos: Vec3;
  /** Unit vector along the direction of travel through the ring. */
  normal: Vec3;
}

export const palette = {
  grass: '#86cf58',
  grassLight: '#a6dd68',
  grassDark: '#6dbd58',
  rock: '#a8937f',
  cliff: '#cfa07c',
  stone: '#f1e8d8',
  wall: '#fff3dc',
  wallPink: '#fbd5c2',
  wallBlue: '#d8eaf0',
  terracotta: '#e0703c',
  teal: '#3d9d92',
  copper: '#e8a046',
  moss: '#6aa850',
  timber: '#7b5236',
  door: '#b0683c',
  window: '#ffe08a',
  trunk: '#8a5f44',
  pine: '#3f9470',
  leaf: '#5db858',
  blossom: '#f7a8c4',
  smoke: '#ffffff',
  water: '#7fd0f0',
  pad: '#ffc94f',
  lamp: '#fff2b0',
  wood: '#c99862',
};
const flowers = ['#ffffff', '#ffd84d', '#ff8fb0', '#f2615a', '#b48cf0'];

export const prims: Prim[] = [];
export const placements: Placement[] = [];
export const updrafts: Updraft[] = [];
/** Islands that ride on a wreath of cloud. */
export const islands: { x: number; top: number; z: number; r: number }[] = [];

// Solid shapes, with what the distance query needs worked out once. Filled as the level is
// built, so the builders below can ask what is already standing somewhere.
const solids: { prim: Prim; bound: number; sin: number; cos: number }[] = [];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function add(prim: Prim) {
  prims.push(prim);
  if (prim.solid === false) return;
  solids.push({
    prim,
    // Radius of a sphere around pos that contains the whole shape, for cheap rejection.
    bound:
      prim.kind === 'box'
        ? Math.hypot(...prim.size) / 2
        : prim.kind === 'cone'
          ? Math.hypot(Math.max(prim.rTop, prim.rBottom), prim.height / 2)
          : prim.radius,
    sin: Math.sin(prim.rotY ?? 0),
    cos: Math.cos(prim.rotY ?? 0),
  });
}

/** Small seeded generator, so scattered things are in the same place on every load. */
export function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const random = seeded(7);

/** A random spot on a round patch of ground. */
function scatter(x: number, z: number, r: number) {
  const angle = random() * Math.PI * 2;
  const reach = Math.sqrt(random()) * r;
  return [x + Math.cos(angle) * reach, z + Math.sin(angle) * reach];
}

// --- Where the route goes ----------------------------------------------------------------------
// Fixed first, because the scenery is built round it.

export const spawn = { x: 0, y: 151.2, z: -31, yaw: 0 };
const market = { x: -90, top: 62, z: -300 };
const rock = { x: 112, top: 46, z: -385 };
// The cliff face the ring line runs along, at x = cliffFace.
export const cliffFace = rock.x - 28;
const light = { x: 20, top: 96, z: -775 };
export const pad = { x: light.x - 12, y: light.top + 2, z: light.z + 20, radius: 10 };

const ringLine: Vec3[] = [
  [34, 132, -110], // the gate
  [48, 108, -200], // Chimney Lane
  [70, 90, -290],
  [cliffFace - 10, 80, -360], // inside the tunnel
  [cliffFace - 10, 78, -420], // the terrace market
  [62, 100, -520], // under the viaduct
  [40, 112, -620], // between the windmills
];
const route: Vec3[] = [[spawn.x, spawn.y, spawn.z], ...ringLine, [pad.x, pad.y, pad.z]];

// Each ring faces along the line from the ring before it to the ring after it.
export const rings: Ring[] = ringLine.map((pos, i) => {
  const from = route[i];
  const to = route[i + 2];
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  return { pos, normal: [d[0] / len, d[1] / len, d[2] / len] };
});

/** True if the ring line passes low over this spot, so nothing tall should grow there. */
function underRoute(x: number, ground: number, z: number) {
  return route.slice(1).some((b, i) => {
    const a = route[i];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const t = clamp01(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz));
    const above = a[1] + (b[1] - a[1]) * t - ground;
    return Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t) < 14 && above > -2 && above < 30;
  });
}

// --- Builders ----------------------------------------------------------------------------------
// They take the height of the *bottom* of a shape, which is what you know when placing things
// on the ground.

function box(x: number, bottom: number, z: number, w: number, h: number, d: number, color: string, rotY = 0, solid = true) {
  add({ kind: 'box', pos: [x, bottom + h / 2, z], size: [w, h, d], color, rotY, solid });
}

function cone(x: number, bottom: number, z: number, rBottom: number, rTop: number, height: number, color: string, sides = 8, rotY = 0, solid = true) {
  add({ kind: 'cone', pos: [x, bottom + height / 2, z], height, rTop, rBottom, sides, color, rotY, solid });
}

/** Unlike the others, a ball is placed by its centre. */
function ball(x: number, y: number, z: number, radius: number, color: string, solid = true) {
  add({ kind: 'sphere', pos: [x, y, z], radius, color, solid });
}

// Models are a metre or two across as drawn; this makes a cottage a dozen metres tall.
const MODEL_SCALE = 14;

/** An imported model, with its door facing +Z before it is turned by rotY. */
function model(name: ModelName, x: number, ground: number, z: number, rotY = 0, scale = MODEL_SCALE) {
  placements.push({ name, pos: [x, ground, z], rotY, scale });
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  // Collision is the model cut into horizontal slabs, each one a box round that slab.
  for (const [cx, cy, cz, w, h, d] of models[name].boxes) {
    add({
      kind: 'box',
      pos: [x + (cx * cos + cz * sin) * scale, ground + cy * scale, z + (cz * cos - cx * sin) * scale],
      size: [w * scale, h * scale, d * scale],
      color: '',
      rotY,
      hidden: true,
    });
  }
}

/** How far a model reaches sideways from where it stands, in metres. */
function reach(name: ModelName, scale = MODEL_SCALE) {
  return Math.max(...models[name].boxes.map(([cx, , cz, w, , d]) => Math.max(Math.abs(cx) + w / 2, Math.abs(cz) + d / 2))) * scale;
}

/** The rotY that turns something at (x, z) to face (tx, tz). */
const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

/** Patches of lighter and darker grass, and flowers too small to hit, strewn over a round lawn. */
function meadow(x: number, top: number, z: number, r: number) {
  for (let i = 0; i < r / 5; i++) {
    const size = 4 + random() * r * 0.12;
    const [px, pz] = scatter(x, z, r * 0.92 - size);
    // Each patch is a hair taller than the last so overlapping ones do not flicker.
    cone(px, top, pz, size, size, 0.05 + i * 0.01, i % 2 ? palette.grassLight : palette.grassDark, 12, 0, false);
  }
  for (let i = 0; i < r * 2.5; i++) {
    const [fx, fz] = scatter(x, z, r * 0.9);
    const size = 0.4 + random() * 0.35;
    ball(fx, top + size * 0.3, fz, size, flowers[i % flowers.length], false);
  }
}

/** A floating island. Ledges that grow out of a cliff have no wreath of cloud of their own. */
function island(x: number, top: number, z: number, r: number, wreath = true) {
  if (wreath) islands.push({ x, top, z, r });
  cone(x, top - 4, z, r * 0.93, r, 4, palette.grass, 18);
  cone(x, top - 4 - r * 1.1, z, r * 0.12, r * 0.93, r * 1.1, palette.rock, 9, x);
  meadow(x, top, z, r);
}

function pine(x: number, ground: number, z: number, s = 1) {
  cone(x, ground, z, 0.6 * s, 0.45 * s, 3 * s, palette.trunk, 8);
  cone(x, ground + 2.2 * s, z, 3.2 * s, 1.2 * s, 3.2 * s, palette.pine, 10);
  cone(x, ground + 4.8 * s, z, 2.5 * s, 0.8 * s, 3 * s, palette.pine, 10);
  cone(x, ground + 7.2 * s, z, 1.7 * s, 0, 3.4 * s, palette.pine, 10);
}

function oak(x: number, ground: number, z: number, s = 1, color = palette.leaf) {
  cone(x, ground, z, 0.7 * s, 0.5 * s, 3.4 * s, palette.trunk, 8);
  ball(x, ground + 5.6 * s, z, 3.2 * s, color);
  ball(x + 1.9 * s, ground + 4.6 * s, z + 0.8 * s, 2.2 * s, color);
  ball(x - 1.7 * s, ground + 4.9 * s, z - 1.0 * s, 2.4 * s, color);
}

function bush(x: number, ground: number, z: number, s = 1) {
  ball(x, ground + 0.5 * s, z, 1.6 * s, palette.grassDark);
  ball(x + 1.4 * s, ground + 0.3 * s, z + 0.5 * s, 1.1 * s, palette.grassDark);
}

/** Up to `count` trees on a round patch of ground, wherever there is room and the route is clear. */
function trees(x: number, ground: number, z: number, r: number, count: number) {
  for (let tries = count * 8; count > 0 && tries > 0; tries--) {
    const [tx, tz] = scatter(x, z, r);
    // The ground is 6 m below this point, so anything nearer is a wall or another tree.
    if (distanceToWorld(tx, ground + 6, tz) < 5 || underRoute(tx, ground, tz)) continue;
    const kind = random();
    const s = 0.8 + random() * 0.6;
    if (kind < 0.35) pine(tx, ground, tz, s);
    else if (kind < 0.85) oak(tx, ground, tz, s, kind < 0.6 ? palette.leaf : kind < 0.75 ? palette.moss : palette.blossom);
    else bush(tx, ground, tz, s);
    count--;
  }
}

const PROPS: ModelName[] = ['barrel', 'crate_A_big', 'sack', 'crate_B_big', 'barrel', 'pallet', 'bucket_water', 'crate_long_A', 'wheelbarrow', 'resource_lumber'];

/** Up to `count` barrels, crates and sacks left lying about on a round patch of ground. */
function clutter(x: number, ground: number, z: number, r: number, count: number) {
  for (let tries = count * 6; count > 0 && tries > 0; tries--) {
    const [px, pz] = scatter(x, z, r);
    if (distanceToWorld(px, ground + 4, pz) < 3.5) continue;
    model(PROPS[Math.floor(random() * PROPS.length)], px, ground, pz, random() * Math.PI * 2);
    count--;
  }
}

/** A lantern on a post, too thin to hit. */
function lamp(x: number, ground: number, z: number) {
  cone(x, ground, z, 0.3, 0.2, 5, palette.timber, 6, 0, false);
  ball(x, ground + 5.6, z, 0.8, palette.lamp, false);
}

/** A sagging string of flags between two points. You can fly through it. */
function bunting(from: Vec3, to: Vec3, sag = 2) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const count = Math.floor(Math.hypot(d[0], d[2]) / 1.5);
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const y = from[1] + d[1] * t - sag * 4 * t * (1 - t);
    box(from[0] + d[0] * t, y - 1.1, from[2] + d[2] * t, 1, 1.1, 0.12, flowers[i % flowers.length], Math.atan2(-d[2], d[0]), false);
  }
}

function smoke(x: number, y: number, z: number) {
  [1.2, 1.7, 2.4].forEach((size, i) => ball(x + i * 1.6, y + i * 3.2, z - i * 0.9, size, palette.smoke, false));
}

/** A small island with a few buildings standing in a ring, backs to each other, among trees. */
function hamlet(x: number, top: number, z: number, r: number, names: ModelName[]) {
  island(x, top, z, r);
  const turn = random() * Math.PI * 2;
  names.forEach((name, i) => {
    const angle = turn + (i / names.length) * Math.PI * 2;
    const out = names.length > 1 ? r * 0.45 : 0;
    model(name, x + Math.sin(angle) * out, top, z + Math.cos(angle) * out, angle);
  });
  trees(x, top, z, r - 4, Math.ceil(r / 4));
}

// --- Post office: the high start ---------------------------------------------------------------

island(0, 120, 0, 36);
// The launch tower and its deck.
cone(0, 120, -14, 5, 4.2, 28, palette.stone, 14);
box(0, 148, -22, 6, 1, 22, palette.wood);
model('building_tavern_red', -15, 120, 10, facing(-15, 10, 2, 6));
model('building_home_A_yellow', 17, 120, 13, facing(17, 13, 2, 6));
model('building_home_B_blue', 19, 120, -8, facing(19, -8, 2, 6));
model('building_well_blue', 2, 120, 7, 0, 9);
box(-2, 120, 22, 2, 3, 2, palette.terracotta); // the postbox
lamp(-5, 120, 20);
lamp(9, 120, 2);
clutter(-4, 120, 16, 8, 5);
trees(0, 120, 0, 32, 10);

// --- The gate: two towers to thread --------------------------------------------------------------

{
  const [x, y, z] = ringLine[0];
  island(x, y - 20, z - 2, 30);
  model('building_tower_B_red', x - 19, y - 20, z);
  model('building_tower_B_yellow', x + 19, y - 20, z);
  // A footbridge between them, under the ring.
  box(x, y - 13, z, 22, 1.5, 5, palette.wood);
  for (const side of [-1, 1]) box(x, y - 11.5, z + side * 2.3, 22, 1.2, 0.3, palette.timber, 0, false);
  bunting([x - 11, y + 13, z], [x + 11, y + 13, z], 3);
  model('building_home_A_green', x - 16, y - 20, z - 21, 0.4);
  trees(x, y - 20, z - 2, 26, 7);
}

// --- Chimney Lane: a street to fly down ----------------------------------------------------------

{
  const [x, , z] = ringLine[1];
  const ground = 90;
  // Half the width of the street. The ring is 7 m across, so there is room, but not much.
  const half = 10.5;
  // The street runs along the ring line: (fx, fz) is a step along it, (-fz, fx) a step to the right.
  const heading = facing(ringLine[0][0], ringLine[0][2], ringLine[2][0], ringLine[2][2]);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const at = (along: number, right: number) => [x + fx * along - fz * right, z + fz * along + fx * right];

  const [cx, cz] = at(-6, 0);
  island(cx, ground, cz, 50);
  box(cx, ground, cz, half * 2, 0.25, 84, palette.stone, heading, false);

  // Tall at the near end and low at the far end, because the line comes down as it goes.
  const rows: [ModelName, ModelName][] = [
    ['building_tower_B_yellow', 'building_tower_B_red'],
    ['building_tower_A_blue', 'building_tower_A_green'],
    ['building_church_red', 'building_tavern_blue'],
    ['building_tavern_red', 'building_home_B_yellow'],
    ['building_home_B_red', 'building_home_A_blue'],
  ];
  rows.forEach((row, i) => {
    const along = -38 + i * 16;
    const [mx, mz] = at(along, 0);
    row.forEach((name, side) => {
      const [bx, bz] = at(along, (side ? 1 : -1) * (half + reach(name)));
      model(name, bx, ground, bz, facing(bx, bz, mx, mz));
      const [lx, lz] = at(along + 8, (side ? 1 : -1) * (half - 1.5));
      if (i < 4) lamp(lx, ground, lz);
    });
    const [px, pz] = at(along + 8, i % 2 ? 6 : -6);
    if (i < 4) clutter(px, ground, pz, 4, 2);
  });
  const [ax, az] = at(-38, -half - 6);
  const [bx, bz] = at(-38, half + 6);
  bunting([ax, ground + 35, az], [bx, ground + 35, bz], 3);
  trees(cx, ground, cz, 46, 16);
}

// A windmill out on its own marks the turn towards the cliff.
hamlet(42, 84, -286, 14, ['building_windmill_red']);

// --- Waterfall rock ------------------------------------------------------------------------------

island(rock.x, rock.top, rock.z, 74);
box(rock.x, rock.top, rock.z, 56, 108, 130, palette.cliff);
box(rock.x, rock.top + 108, rock.z, 56, 2, 130, palette.grass);
meadow(rock.x, rock.top + 110, rock.z + 36, 26);
// Buttresses on the far side, for the silhouette.
box(rock.x + 30, rock.top, rock.z + 20, 22, 70, 40, palette.rock, 0.3);
box(rock.x + 26, rock.top, rock.z - 44, 20, 46, 30, palette.rock, -0.4);
// A peak at the far end breaks up the block, with a windmill on top.
box(rock.x + 8, rock.top + 110, rock.z - 30, 34, 26, 60, palette.cliff);
box(rock.x + 8, rock.top + 136, rock.z - 30, 34, 2, 60, palette.grass);
model('building_windmill_yellow', rock.x + 8, rock.top + 138, rock.z - 34, -Math.PI / 2);
// The waterfall pours down the far end of the face into a pool. You can fly through the water.
box(cliffFace - 0.6, rock.top, rock.z - 54, 1.2, 108, 16, palette.water, 0, false);
cone(cliffFace - 7, rock.top, rock.z - 54, 9, 9, 0.6, palette.water, 14);
// Mist rising off the pool.
updrafts.push({ x: cliffFace - 14, z: rock.z - 75, base: rock.top + 4, top: 150, radius: 24, strength: 22 });

// A village on top, and houses on ledges down the near end.
{
  const top = rock.top + 110;
  model('building_church_blue', rock.x + 6, top, rock.z + 35, -Math.PI / 2);
  model('building_home_A_red', rock.x - 8, top, rock.z + 47, -Math.PI / 2);
  model('building_home_B_green', rock.x + 14, top, rock.z + 13, -Math.PI / 2);
  model('building_home_A_yellow', rock.x - 18, top, rock.z - 37, -Math.PI / 2);
  trees(rock.x, top, rock.z + 33, 26, 9);

  island(rock.x + 8, 100, rock.z + 75, 20, false);
  model('building_tavern_blue', rock.x + 8, 100, rock.z + 73);
  trees(rock.x + 8, 100, rock.z + 75, 17, 4);
  island(rock.x - 16, 78, rock.z + 79, 14, false);
  model('building_home_A_blue', rock.x - 14, 78, rock.z + 79, -0.5);
}

// --- The tunnel: an arch of rock against the cliff ---------------------------------------------

const terrace = rock.top + 22;
{
  const z = -342;
  const length = 48;
  // A foot of rock under the mouth, a pier on the left and a roof leaning on the cliff.
  box(68, rock.top, z + 8, 44, 22.05, 32, palette.cliff);
  box(54, terrace, z, 16, 28, length, palette.cliff);
  box(68, terrace + 28, z, 44, 14, length, palette.cliff);
  box(68, terrace + 42, z, 44, 2, length, palette.grass);
  meadow(68, terrace + 44, z, 20);
  model('building_home_B_red', 60, terrace + 44, z + 2, 0.3);
  trees(68, terrace + 44, z, 19, 6);
  // Lanterns down both walls.
  for (const lz of [z - 16, z, z + 16]) for (const lx of [62.3, cliffFace - 0.3]) ball(lx, terrace + 20, lz, 1, palette.lamp, false);
}

// --- The terrace market: stalls on the left, cliff on the right --------------------------------

island(56, terrace, -378, 56, false);
box(66, terrace, -394, 34, 0.25, 64, palette.stone, 0, false);
{
  const line = cliffFace - 10;
  const west = Math.PI / 2; // turned to face the cliff
  model('building_market_yellow', 58, terrace, -376, west, 10);
  model('building_well_blue', 58, terrace, -393, west, 9);
  model('building_market_green', 58, terrace, -410, west, 10);
  model('tent', 60, terrace, -427, west);
  // A row of buildings behind the stalls, and another behind that.
  model('building_home_B_yellow', 40, terrace, -374, west);
  model('building_tower_A_blue', 40, terrace, -390, west);
  model('building_tavern_red', 40, terrace, -407, west);
  model('building_home_A_red', 40, terrace, -423, west);
  model('building_church_red', 21, terrace, -376, west);
  model('building_home_A_green', 23, terrace, -394, west);
  model('building_home_B_blue', 25, terrace, -409, west);
  model('building_home_B_green', 30, terrace, -348, west);
  model('building_blacksmith_green', 14, terrace, -355, 2.2);

  // Awnings against the cliff, with goods stacked underneath.
  [-378, -396].forEach((z, i) => {
    box(cliffFace - 2, terrace + 4.4, z, 4, 0.6, 10, i ? palette.teal : palette.terracotta);
    for (const end of [-4.5, 4.5]) cone(cliffFace - 3.7, terrace, z + end, 0.2, 0.2, 4.4, palette.timber, 6, 0, false);
    model(i ? 'crate_A_big' : 'barrel', cliffFace - 2.4, terrace, z - 2.5, 0.3);
    model(i ? 'sack' : 'crate_B_big', cliffFace - 2.4, terrace, z + 2.5, 1.1);
  });
  for (const z of [-366, -385, -402, -419]) lamp(line - 8.5, terrace, z);
  clutter(54, terrace, -393, 9, 6);
  clutter(52, terrace, -428, 5, 3);
  bunting([44, terrace + 29, -390], [cliffFace, terrace + 29, -390], 3);
  bunting([46, terrace + 19, -407], [cliffFace, terrace + 23, -407], 2);
  bunting([62, terrace + 27, -367], [cliffFace, terrace + 27, -367], 2);
  trees(40, terrace, -378, 38, 14);
}

// --- The viaduct ---------------------------------------------------------------------------------

{
  const [x, y, z] = ringLine[5];
  island(x - 22, y - 10, z, 16);
  island(x + 22, y - 10, z, 16);
  model('building_tower_A_green', x - 26, y - 10, z);
  model('building_tower_A_blue', x + 26, y - 10, z);
  // You fly under the deck.
  box(x, y + 10, z, 38, 3, 6, palette.stone);
  for (const side of [-1, 1]) {
    box(x + side * 15, y + 4, z, 8, 6, 6, palette.stone);
    box(x, y + 13, z + side * 2.8, 38, 1.2, 0.4, palette.stone, 0, false);
    lamp(x + side * 9, y + 13, z);
    trees(x + side * 22, y - 10, z, 13, 4);
  }
}

// --- The windmill gap ------------------------------------------------------------------------------

{
  const [x, y, z] = ringLine[6];
  island(x, y - 12, z - 5, 28);
  model('building_windmill_red', x - 19, y - 12, z);
  model('building_windmill_yellow', x + 19, y - 12, z);
  model('building_home_A_yellow', x + 12, y - 12, z - 20, 0.5);
  trees(x, y - 12, z - 5, 24, 7);
}

// --- Market town: the safe route -------------------------------------------------------------

island(market.x, market.top, market.z, 58);
cone(market.x, market.top, market.z, 21, 21, 0.3, palette.stone, 20);
model('building_well_blue', market.x, market.top + 0.3, market.z, 0, 10);
model('building_market_yellow', market.x - 13, market.top + 0.3, market.z, Math.PI / 2, 10);
model('building_market_green', market.x + 13, market.top + 0.3, market.z, -Math.PI / 2, 10);
model('tent', market.x + 2, market.top + 0.3, market.z + 14, 0.4);
model('tent', market.x - 3, market.top + 0.3, market.z - 14, 2.8);
clutter(market.x, market.top + 0.3, market.z, 19, 12);
{
  // Two rings of buildings facing the square. The taverns stand under the updrafts.
  const ring = (names: ModelName[], out: number, offset: number) =>
    names.map((name, i) => {
      const angle = 0.494 + ((i + offset) * Math.PI) / 4;
      const pos = [market.x + Math.sin(angle) * out, market.z + Math.cos(angle) * out];
      model(name, pos[0], market.top, pos[1], angle + Math.PI);
      return pos;
    });
  const inner = ring(
    ['building_home_B_red', 'building_home_A_yellow', 'building_tavern_red', 'building_church_blue', 'building_home_B_green', 'building_blacksmith_green', 'building_tavern_blue', 'building_home_A_red'],
    33,
    0,
  );
  ring(
    ['building_tower_B_red', 'building_home_A_blue', 'building_home_B_yellow', 'building_windmill_yellow', 'building_home_A_green', 'building_tower_A_green', 'building_home_B_blue', 'building_home_A_yellow'],
    47,
    0.5,
  );
  // Warm air off the two tavern chimneys.
  for (const [x, z] of [inner[6], inner[2]]) {
    smoke(x, market.top + 22, z);
    updrafts.push({ x, z, base: market.top + 12, top: 215, radius: 30, strength: 16 });
  }
  for (let i = 0; i < 8; i++) lamp(market.x + Math.sin((i * Math.PI) / 4) * 22, market.top, market.z + Math.cos((i * Math.PI) / 4) * 22);
}
trees(market.x, market.top, market.z, 54, 18);

// --- Lighthouse: the destination -------------------------------------------------------------

island(light.x, light.top, light.z, 36);
cone(light.x + 20, light.top, light.z - 17, 5.5, 4, 40, palette.stone, 14);
cone(light.x + 20, light.top + 13, light.z - 17, 5.2, 5, 6, palette.terracotta, 14);
cone(light.x + 20, light.top + 40, light.z - 17, 5.6, 5.6, 1.2, palette.wood, 14);
cone(light.x + 20, light.top + 41.2, light.z - 17, 3, 3, 5, palette.lamp, 10);
cone(light.x + 20, light.top + 46.2, light.z - 17, 4.2, 0, 4.5, palette.terracotta, 14);
cone(pad.x, light.top, pad.z, pad.radius, pad.radius, 2, palette.pad, 20);
model('building_home_B_red', light.x - 14, light.top, light.z - 20, 0.2);
model('building_home_A_blue', light.x + 3, light.top, light.z - 26);
model('building_home_A_yellow', light.x - 27, light.top, light.z - 4, 0.9);
clutter(light.x + 6, light.top, light.z + 2, 7, 4);
trees(light.x, light.top, light.z, 32, 9);

// --- Hamlets drifting round the edges, so the sky is never empty -------------------------------

hamlet(-70, 100, -120, 20, ['building_home_A_red', 'building_home_B_yellow', 'building_home_A_blue']);
hamlet(122, 118, -165, 18, ['building_tower_A_blue', 'building_home_A_red']);
hamlet(-10, 84, -250, 16, ['building_windmill_yellow']);
hamlet(-150, 90, -420, 22, ['building_church_red', 'building_home_B_green', 'building_home_A_yellow']);
hamlet(-20, 70, -480, 22, ['building_tavern_blue', 'building_home_A_green', 'building_home_B_red']);
hamlet(28, 92, -470, 13, ['building_home_B_yellow']);
hamlet(102, 86, -488, 13, ['building_home_A_red']);
hamlet(130, 90, -560, 20, ['building_tower_B_yellow', 'building_home_A_blue']);
hamlet(14, 100, -572, 14, ['building_home_B_green']);
hamlet(84, 106, -588, 13, ['building_home_A_yellow']);
hamlet(-60, 110, -650, 18, ['building_church_blue', 'building_home_A_red']);
hamlet(-14, 104, -690, 14, ['building_home_B_blue']);
hamlet(90, 104, -700, 16, ['building_windmill_red']);

// --- Queries ---------------------------------------------------------------------------------

function boxDistance(px: number, py: number, pz: number, hx: number, hy: number, hz: number) {
  const qx = Math.abs(px) - hx;
  const qy = Math.abs(py) - hy;
  const qz = Math.abs(pz) - hz;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0);
}

// Exact distance to a capped cone (a cylinder when both radii match), centred on the origin.
function coneDistance(px: number, py: number, pz: number, halfH: number, rBottom: number, rTop: number) {
  const qx = Math.hypot(px, pz);
  const k2x = rTop - rBottom;
  const k2y = 2 * halfH;
  const capX = qx - Math.min(qx, py < 0 ? rBottom : rTop);
  const capY = Math.abs(py) - halfH;
  const t = clamp01(((rTop - qx) * k2x + (halfH - py) * k2y) / (k2x * k2x + k2y * k2y));
  const sideX = qx - rTop + k2x * t;
  const sideY = py - halfH + k2y * t;
  const sign = sideX < 0 && capY < 0 ? -1 : 1;
  return sign * Math.sqrt(Math.min(capX * capX + capY * capY, sideX * sideX + sideY * sideY));
}

/** Distance from a point to the nearest solid surface. Negative inside. */
export function distanceToWorld(x: number, y: number, z: number): number {
  let best = Infinity;
  for (const { prim, bound, sin, cos } of solids) {
    const dx = x - prim.pos[0];
    const dy = y - prim.pos[1];
    const dz = z - prim.pos[2];
    if (Math.hypot(dx, dy, dz) - bound >= best) continue;

    let d: number;
    if (prim.kind === 'box') {
      // Into the box's own frame: undo its rotation about Y.
      d = boxDistance(dx * cos - dz * sin, dy, dx * sin + dz * cos, prim.size[0] / 2, prim.size[1] / 2, prim.size[2] / 2);
    } else if (prim.kind === 'cone') {
      d = coneDistance(dx, dy, dz, prim.height / 2, prim.rBottom, prim.rTop);
    } else {
      d = Math.hypot(dx, dy, dz) - prim.radius;
    }
    if (d < best) best = d;
  }
  return best;
}

/** How hard a glider at this point and speed is skimming, 0 to 1. */
export function skimAt(distance: number, speed: number): number {
  const { skimRange, skimFullSpeed } = config.boost;
  const r = config.glider.radius;
  const closeness = clamp01(1 - (distance - r) / (skimRange - r));
  return closeness * clamp01(speed / skimFullSpeed);
}

/** Vertical air speed at a point: the strongest updraft acting there. */
export function liftAt(x: number, y: number, z: number): number {
  let lift = 0;
  for (const u of updrafts) {
    if (y < u.base || y > u.top) continue;
    const r = Math.hypot(x - u.x, z - u.z) / u.radius;
    if (r >= 1) continue;
    // Full strength across the inner half, easing to nothing at the edge.
    const edge = clamp01((r - 0.5) * 2);
    const column = clamp01((y - u.base) / 10) * clamp01((u.top - y) / 25);
    lift = Math.max(lift, u.strength * (1 - edge * edge) * column);
  }
  return lift;
}

/** True if moving from one point to another passes through the ring. */
export function crossesRing(ring: Ring, from: Vec3, to: Vec3): boolean {
  const [nx, ny, nz] = ring.normal;
  const side = (p: Vec3) => (p[0] - ring.pos[0]) * nx + (p[1] - ring.pos[1]) * ny + (p[2] - ring.pos[2]) * nz;
  const a = side(from);
  const b = side(to);
  if (a === b || a > 0 === b > 0) return false;
  const t = a / (a - b);
  const hit = [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * t - ring.pos[i]);
  return Math.hypot(hit[0], hit[1], hit[2]) <= config.rings.radius;
}

/** True if the point is resting on the landing pad rather than hitting something. */
export function onPad(x: number, y: number, z: number): boolean {
  const height = y - pad.y;
  return Math.hypot(x - pad.x, z - pad.z) <= pad.radius && height >= 0 && height <= config.glider.radius;
}
