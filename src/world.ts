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
/** Mountains. Solid cones as far as the game is concerned; scene.ts carves them into peaks. */
export const peaks: Extract<Prim, { kind: 'cone' }>[] = [];

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
let random = seeded(7);

/** A random spot on a round patch of ground. */
function scatter(x: number, z: number, r: number) {
  const angle = random() * Math.PI * 2;
  const reach = Math.sqrt(random()) * r;
  return [x + Math.cos(angle) * reach, z + Math.sin(angle) * reach];
}

// --- Where the route goes ----------------------------------------------------------------------
// A level lays this first, because its scenery is built round it.

export const spawn = { x: 0, y: 0, z: 0, yaw: 0 };
export const pad = { x: 0, y: 0, z: 0, radius: 10 };
export const rings: Ring[] = [];
let route: Vec3[] = [];

/** Empties the world, ready for a level to be built in it. */
export function clearWorld() {
  for (const list of [prims, placements, updrafts, islands, peaks, solids, rings]) list.length = 0;
  route = [];
  random = seeded(7);
}

/** Lays the line from the launch deck, through each ring, to the landing pad. */
export function setRoute(start: Vec3, ringLine: Vec3[], end: Vec3) {
  Object.assign(spawn, { x: start[0], y: start[1], z: start[2] });
  Object.assign(pad, { x: end[0], y: end[1], z: end[2] });
  route = [start, ...ringLine, end];
  // Each ring faces along the line from the ring before it to the ring after it.
  ringLine.forEach((pos, i) => {
    const from = route[i];
    const to = route[i + 2];
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    rings.push({ pos, normal: [d[0] / len, d[1] / len, d[2] / len] });
  });
}

/** How far a spot on the map is from the route, seen from above. */
export function fromRoute(x: number, z: number) {
  return Math.min(
    ...route.slice(1).map((b, i) => {
      const a = route[i];
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const t = clamp01(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz));
      return Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t);
    }),
  );
}

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

export function box(x: number, bottom: number, z: number, w: number, h: number, d: number, color: string, rotY = 0, solid = true) {
  add({ kind: 'box', pos: [x, bottom + h / 2, z], size: [w, h, d], color, rotY, solid });
}

export function cone(x: number, bottom: number, z: number, rBottom: number, rTop: number, height: number, color: string, sides = 8, rotY = 0, solid = true) {
  add({ kind: 'cone', pos: [x, bottom + height / 2, z], height, rTop, rBottom, sides, color, rotY, solid });
}

/** Unlike the others, a ball is placed by its centre. */
export function ball(x: number, y: number, z: number, radius: number, color: string, solid = true) {
  add({ kind: 'sphere', pos: [x, y, z], radius, color, solid });
}

// Models are a metre or two across as drawn; this makes a cottage a dozen metres tall.
const MODEL_SCALE = 14;

/** An imported model, with its door facing +Z before it is turned by rotY. */
export function model(name: ModelName, x: number, ground: number, z: number, rotY = 0, scale = MODEL_SCALE) {
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
export function reach(name: ModelName, scale = MODEL_SCALE) {
  return Math.max(...models[name].boxes.map(([cx, , cz, w, , d]) => Math.max(Math.abs(cx) + w / 2, Math.abs(cz) + d / 2))) * scale;
}

/** The rotY that turns something at (x, z) to face (tx, tz). */
export const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

/** Patches of lighter and darker grass, and flowers too small to hit, strewn over a round lawn. */
export function meadow(x: number, top: number, z: number, r: number) {
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
export function island(x: number, top: number, z: number, r: number, wreath = true) {
  if (wreath) islands.push({ x, top, z, r });
  cone(x, top - 4, z, r * 0.93, r, 4, palette.grass, 18);
  cone(x, top - 4 - r * 1.1, z, r * 0.12, r * 0.93, r * 1.1, palette.rock, 9, x);
  meadow(x, top, z, r);
}

export function pine(x: number, ground: number, z: number, s = 1) {
  cone(x, ground, z, 0.6 * s, 0.45 * s, 3 * s, palette.trunk, 8);
  cone(x, ground + 2.2 * s, z, 3.2 * s, 1.2 * s, 3.2 * s, palette.pine, 10);
  cone(x, ground + 4.8 * s, z, 2.5 * s, 0.8 * s, 3 * s, palette.pine, 10);
  cone(x, ground + 7.2 * s, z, 1.7 * s, 0, 3.4 * s, palette.pine, 10);
}

export function oak(x: number, ground: number, z: number, s = 1, color = palette.leaf) {
  cone(x, ground, z, 0.7 * s, 0.5 * s, 3.4 * s, palette.trunk, 8);
  ball(x, ground + 5.6 * s, z, 3.2 * s, color);
  ball(x + 1.9 * s, ground + 4.6 * s, z + 0.8 * s, 2.2 * s, color);
  ball(x - 1.7 * s, ground + 4.9 * s, z - 1.0 * s, 2.4 * s, color);
}

export function bush(x: number, ground: number, z: number, s = 1) {
  ball(x, ground + 0.5 * s, z, 1.6 * s, palette.grassDark);
  ball(x + 1.4 * s, ground + 0.3 * s, z + 0.5 * s, 1.1 * s, palette.grassDark);
}

/** Up to `count` trees on a round patch of ground, wherever there is room and the route is clear. */
export function trees(x: number, ground: number, z: number, r: number, count: number) {
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
export function clutter(x: number, ground: number, z: number, r: number, count: number) {
  for (let tries = count * 6; count > 0 && tries > 0; tries--) {
    const [px, pz] = scatter(x, z, r);
    if (distanceToWorld(px, ground + 4, pz) < 3.5) continue;
    model(PROPS[Math.floor(random() * PROPS.length)], px, ground, pz, random() * Math.PI * 2);
    count--;
  }
}

/** A lantern on a post, too thin to hit. */
export function lamp(x: number, ground: number, z: number) {
  cone(x, ground, z, 0.3, 0.2, 5, palette.timber, 6, 0, false);
  ball(x, ground + 5.6, z, 0.8, palette.lamp, false);
}

/** A sagging string of flags between two points. You can fly through it. */
export function bunting(from: Vec3, to: Vec3, sag = 2) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const count = Math.floor(Math.hypot(d[0], d[2]) / 1.5);
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const y = from[1] + d[1] * t - sag * 4 * t * (1 - t);
    box(from[0] + d[0] * t, y - 1.1, from[2] + d[2] * t, 1, 1.1, 0.12, flowers[i % flowers.length], Math.atan2(-d[2], d[0]), false);
  }
}

export function smoke(x: number, y: number, z: number) {
  [1.2, 1.7, 2.4].forEach((size, i) => ball(x + i * 1.6, y + i * 3.2, z - i * 0.9, size, palette.smoke, false));
}

/** A small island with a few buildings standing in a ring, backs to each other, among trees. */
export function hamlet(x: number, top: number, z: number, r: number, names: ModelName[]) {
  island(x, top, z, r);
  const turn = random() * Math.PI * 2;
  names.forEach((name, i) => {
    const angle = turn + (i / names.length) * Math.PI * 2;
    const out = names.length > 1 ? r * 0.45 : 0;
    model(name, x + Math.sin(angle) * out, top, z + Math.cos(angle) * out, angle);
  });
  trees(x, top, z, r - 4, Math.ceil(r / 4));
}

/** The launch tower and its deck, under wherever the route starts. */
export function launchTower() {
  cone(spawn.x, spawn.y - 31.2, spawn.z + 17, 5, 4.2, 28, palette.stone, 14);
  box(spawn.x, spawn.y - 3.2, spawn.z + 9, 6, 1, 22, palette.wood);
}

/** The gold pad the parcel is set down on. */
export function landingPad() {
  cone(pad.x, pad.y - 2, pad.z, pad.radius, pad.radius, 2, palette.pad, 20);
}

/**
 * A street to fly down: pairs of buildings facing each other, `half` metres either side of a
 * line through (x, z). Returns the spot `along` the street and `right` of its middle.
 */
export function street(x: number, z: number, ground: number, heading: number, half: number, rows: [ModelName, ModelName][], step = 16) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const at = (along: number, right: number) => [x + fx * along - fz * right, z + fz * along + fx * right];
  const first = (-(rows.length - 1) * step) / 2;
  box(x, ground, z, half * 2, 0.25, (rows.length - 1) * step + 20, palette.stone, heading, false);
  rows.forEach((row, i) => {
    const along = first + i * step;
    const [mx, mz] = at(along, 0);
    const last = i === rows.length - 1;
    row.forEach((name, side) => {
      const [bx, bz] = at(along, (side ? 1 : -1) * (half + reach(name)));
      model(name, bx, ground, bz, facing(bx, bz, mx, mz));
      const [lx, lz] = at(along + step / 2, (side ? 1 : -1) * (half - 1.5));
      if (!last) lamp(lx, ground, lz);
    });
    const [px, pz] = at(along + step / 2, i % 2 ? 6 : -6);
    if (!last) clutter(px, ground, pz, 4, 2);
  });
  return at;
}

// --- The mountains: a wall round the whole valley -----------------------------------------------

// They stand on the land far below the clouds, so no foot ever shows through a gap.
const VALLEY_FLOOR = -420;

/** One peak: `radius` across at cloud level and `height` above it. */
function peak(x: number, z: number, radius: number, height: number) {
  const full = height - VALLEY_FLOOR;
  const prim = { kind: 'cone' as const, pos: [x, VALLEY_FLOOR + full / 2, z] as Vec3, height: full, rTop: 0, rBottom: (radius * full) / height, sides: 14, color: '', hidden: true };
  peaks.push(prim);
  add(prim);
}

/** A ring of peaks on an oval, each with a couple of lower shoulders. */
export function range(cx: number, cz: number, rx: number, rz: number, count: number, size: number, steep: number) {
  for (let i = 0; i < count; i++) {
    const angle = ((i + random() * 0.5) / count) * Math.PI * 2;
    const out = 1 + random() * 0.12;
    const x = cx + Math.cos(angle) * rx * out;
    const z = cz + Math.sin(angle) * rz * out;
    const r = size * (0.85 + random() * 0.4);
    const h = r * steep * (0.75 + random() * 0.5);
    peak(x, z, r, h);
    for (let s = 0; s < 2; s++) {
      // Shoulders lean along the wall and outwards, never in towards the town.
      const lean = angle + (s ? 1 : -1) * (0.9 + random() * 0.8);
      peak(x + Math.cos(lean) * r * 0.7, z + Math.sin(lean) * r * 0.7, r * 0.7, h * (0.45 + random() * 0.25));
    }
  }
}

const HOMES: ModelName[] = ['building_home_A_red', 'building_home_B_blue', 'building_home_A_yellow', 'building_home_B_green', 'building_home_A_blue', 'building_home_B_red'];
const SPIRES: ModelName[] = ['building_church_red', 'building_tower_A_green', 'building_windmill_red', 'building_tower_B_yellow', 'building_church_blue', 'building_windmill_yellow'];

/** Hamlets round an oval, for the middle distance, wherever nothing stands and the route is clear. */
export function farIslands(cx: number, cz: number, rx: number, rz: number, count: number, low: number, high: number) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.2;
    const out = 0.82 + random() * 0.3;
    const x = cx + Math.cos(angle) * rx * out;
    const z = cz + Math.sin(angle) * rz * out;
    const big = i % 4 === 0;
    const r = big ? 28 + random() * 8 : 12 + random() * 8;
    const top = low + random() * (high - low);
    if (distanceToWorld(x, top, z) < r + 30 || underRoute(x, top - 20, z)) continue;
    hamlet(x, top, z, r, big ? [SPIRES[i % 6], HOMES[i % 6], HOMES[(i + 1) % 6], SPIRES[(i + 3) % 6]] : [i % 3 ? HOMES[i % 6] : SPIRES[i % 6]]);
  }
}

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

