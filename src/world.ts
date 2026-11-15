import { config } from './config';

// The level: what it is made of, and the questions the game asks about it.
// No rendering here. scene.ts turns the same primitives into meshes, so what you see is
// exactly what you collide with.

export type Vec3 = [number, number, number];

interface Base {
  /** Centre of the shape. */
  pos: Vec3;
  color: string;
  rotY?: number;
  /** False for scenery you can fly through. */
  solid?: boolean;
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
export const updrafts: Updraft[] = [];
export const islands: { x: number; top: number; z: number; r: number }[] = [];

/** Small seeded generator, so scattered things are in the same place on every load. */
export function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const random = seeded(7);

// Builders take the height of the *bottom* of a shape, which is what you know when placing
// things on the ground.

function box(x: number, bottom: number, z: number, w: number, h: number, d: number, color: string, rotY = 0, solid = true) {
  prims.push({ kind: 'box', pos: [x, bottom + h / 2, z], size: [w, h, d], color, rotY, solid });
}

function cone(x: number, bottom: number, z: number, rBottom: number, rTop: number, height: number, color: string, sides = 8, rotY = 0, solid = true) {
  prims.push({ kind: 'cone', pos: [x, bottom + height / 2, z], height, rTop, rBottom, sides, color, rotY, solid });
}

/** Unlike the others, a ball is placed by its centre. */
function ball(x: number, y: number, z: number, radius: number, color: string, solid = true) {
  prims.push({ kind: 'sphere', pos: [x, y, z], radius, color, solid });
}

/** Patches of lighter and darker grass, and flowers too small to hit, strewn over a round lawn. */
function meadow(x: number, top: number, z: number, r: number) {
  const scatter = (within: number) => {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * within;
    return [x + Math.cos(angle) * reach, z + Math.sin(angle) * reach];
  };
  for (let i = 0; i < r / 5; i++) {
    const size = 4 + random() * r * 0.12;
    const [px, pz] = scatter(r * 0.92 - size);
    // Each patch is a hair taller than the last so overlapping ones do not flicker.
    cone(px, top, pz, size, size, 0.05 + i * 0.01, i % 2 ? palette.grassLight : palette.grassDark, 12, 0, false);
  }
  for (let i = 0; i < r * 2.5; i++) {
    const [fx, fz] = scatter(r * 0.9);
    const size = 0.4 + random() * 0.35;
    ball(fx, top + size * 0.3, fz, size, flowers[i % flowers.length], false);
  }
}

function island(x: number, top: number, z: number, r: number) {
  islands.push({ x, top, z, r });
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

/** A cottage. Its door is on the side facing +Z before it is turned by rotY. */
function house(x: number, ground: number, z: number, w: number, h: number, rotY: number, wall: string, roof: string, chimney = false) {
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  /** Where a point in the cottage's own frame (lx across the front, lz out of the door) is on the map. */
  const at = (lx: number, lz: number) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  const part = (lx: number, bottom: number, lz: number, sx: number, sy: number, sz: number, color: string, solid = false) => {
    const [px, pz] = at(lx, lz);
    box(px, bottom, pz, sx, sy, sz, color, rotY, solid);
  };

  box(x, ground, z, w, h, w, wall, rotY);
  // A witch's-hat roof: wide eaves, then steep. A four-sided cone turned 45° sits square on the walls.
  cone(x, ground + h, z, w * 0.92, w * 0.52, h * 0.25, roof, 4, rotY + Math.PI / 4);
  cone(x, ground + h * 1.25, z, w * 0.52, 0, h * 0.7, roof, 4, rotY + Math.PI / 4);
  if (chimney) {
    part(w * 0.2, ground + h, -w * 0.2, 1.8, h * 0.9, 1.8, palette.stone, true);
    const [cx, cz] = at(w * 0.2, -w * 0.2);
    [0.8, 1.2, 1.7].forEach((size, i) => ball(cx + i * 1.1, ground + h * 1.9 + 1.4 + i * 2.2, cz - i * 0.6, size, palette.smoke, false));
  }

  // Trim stands a hand's width proud of the walls: you can see it, but it is not worth colliding with.
  part(0, ground, 0, w + 0.5, 0.9, w + 0.5, palette.stone);
  part(0, ground + h - 0.6, 0, w + 0.4, 0.6, w + 0.4, palette.timber);
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) part(cx * (w / 2 - 0.2), ground, cz * (w / 2 - 0.2), 0.7, h, 0.7, palette.timber);

  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    /** Something flat on this wall: `along` the wall from its middle, standing `out` from it. */
    const onWall = (along: number, bottom: number, wide: number, tall: number, out: number, color: string) =>
      part((nx * w) / 2 + nz * along, bottom, (nz * w) / 2 + nx * along, nx ? out * 2 : wide, tall, nz ? out * 2 : wide, color);
    const front = nz === 1;
    const sill = ground + h * 0.42;
    for (const along of front ? [-w * 0.24] : [-w * 0.24, w * 0.24]) {
      onWall(along, sill - 0.2, w * 0.24 + 0.4, h * 0.3 + 0.4, 0.12, palette.timber);
      onWall(along, sill, w * 0.24, h * 0.3, 0.2, palette.window);
      onWall(along, sill - 0.75, w * 0.24 + 0.5, 0.55, 0.45, flowers[(nx + 2 * nz + 5) % flowers.length]);
    }
    if (front) {
      onWall(w * 0.22, ground, w * 0.22 + 0.4, h * 0.55 + 0.2, 0.12, palette.timber);
      onWall(w * 0.22, ground, w * 0.22, h * 0.55, 0.2, palette.door);
    }
  }
}

// --- Post office: the high start -------------------------------------------------------------

island(0, 120, 0, 36);
house(-13, 120, 10, 15, 10, 0.2, palette.wall, palette.terracotta, true);
cone(0, 120, -14, 5, 4.2, 28, palette.stone, 14);
box(0, 148, -22, 6, 1, 22, palette.wood);
box(14, 120, 14, 2, 3, 2, palette.terracotta);
pine(-24, 120, -8, 1.2);
oak(20, 120, -4);
pine(22, 120, 16, 1.3);
oak(-4, 120, 26, 0.9, palette.blossom);
bush(8, 120, 22);
bush(-26, 120, 8, 1.2);

export const spawn = { x: 0, y: 151.2, z: -31, yaw: 0 };

// --- Market town: the safe route -------------------------------------------------------------

const market = { x: -90, top: 62, z: -300 };
island(market.x, market.top, market.z, 58);
house(market.x - 28, market.top, market.z + 14, 12, 9, 0.3, palette.wallPink, palette.teal, true);
house(market.x + 26, market.top, market.z - 14, 12, 10, -0.2, palette.wall, palette.terracotta, true);
house(market.x + 4, market.top, market.z + 26, 11, 8, 0.6, palette.wallBlue, palette.copper);
house(market.x - 10, market.top, market.z - 34, 10, 8, -0.5, palette.wall, palette.moss);
house(market.x + 32, market.top, market.z + 22, 10, 8, 1.0, palette.wallPink, palette.teal);
house(market.x - 38, market.top, market.z - 14, 10, 9, 0.1, palette.wallBlue, palette.terracotta);
// Clock tower in the paved square.
cone(market.x, market.top, market.z - 2, 17, 17, 0.3, palette.stone, 16);
cone(market.x, market.top, market.z - 4, 4.4, 4, 22, palette.stone, 4, Math.PI / 4);
cone(market.x, market.top + 22, market.z - 4, 5.8, 0, 9, palette.teal, 4, Math.PI / 4);
box(market.x, market.top + 15, market.z - 4 + 2.95, 2.6, 2.6, 0.4, palette.window, 0, false);
// Market stalls.
box(market.x + 9, market.top, market.z + 6, 5, 3, 3, palette.terracotta, 0.4);
box(market.x - 10, market.top, market.z + 8, 5, 3, 3, palette.pad, -0.3);
oak(market.x - 46, market.top, market.z + 8, 1.1);
pine(market.x + 46, market.top, market.z + 2);
oak(market.x + 10, market.top, market.z - 44, 1.2, palette.blossom);
pine(market.x - 18, market.top, market.z + 44);
bush(market.x + 18, market.top, market.z + 36);
bush(market.x - 44, market.top, market.z - 30, 1.2);
bush(market.x + 40, market.top, market.z - 30);

// Warm air off the two chimneys.
updrafts.push(
  { x: market.x - 28, z: market.z + 14, base: market.top + 12, top: 215, radius: 30, strength: 16 },
  { x: market.x + 26, z: market.z - 14, base: market.top + 12, top: 215, radius: 30, strength: 16 },
);

// --- Waterfall rock: the fast route ----------------------------------------------------------

const rock = { x: 112, top: 46, z: -385 };
// The cliff face the ring line runs along, at x = cliffFace.
export const cliffFace = rock.x - 28;
island(rock.x, rock.top, rock.z, 74);
box(rock.x, rock.top, rock.z, 56, 108, 130, palette.cliff);
box(rock.x, rock.top + 108, rock.z, 56, 2, 130, palette.grass);
meadow(rock.x, rock.top + 110, rock.z + 36, 26);
// Buttresses on the far side, for the silhouette.
box(rock.x + 30, rock.top, rock.z + 20, 22, 70, 40, palette.rock, 0.3);
box(rock.x + 26, rock.top, rock.z - 44, 20, 46, 30, palette.rock, -0.4);
// A peak at the far end breaks up the block.
box(rock.x + 8, rock.top + 110, rock.z - 30, 34, 26, 60, palette.cliff);
box(rock.x + 8, rock.top + 136, rock.z - 30, 34, 2, 60, palette.grass);
pine(rock.x + 8, rock.top + 138, rock.z - 34, 1.4);
oak(rock.x - 10, rock.top + 110, rock.z + 30, 1.4);
pine(rock.x + 14, rock.top + 110, rock.z + 48, 1.2);
pine(rock.x - 18, rock.top + 110, rock.z - 48, 1.5);
oak(rock.x - 50, rock.top, rock.z + 30, 1.2);
pine(rock.x - 58, rock.top, rock.z - 20);
bush(rock.x - 44, rock.top, rock.z + 6, 1.3);
// The waterfall pours down the far end of the face into a pool. You can fly through the water.
box(cliffFace - 0.6, rock.top, rock.z - 48, 1.2, 108, 16, palette.water, 0, false);
cone(cliffFace - 9, rock.top, rock.z - 48, 11, 11, 0.6, palette.water, 14);

// Mist rising off the pool.
updrafts.push({ x: cliffFace - 14, z: rock.z - 75, base: rock.top + 4, top: 150, radius: 24, strength: 22 });

// --- Lighthouse: the destination -------------------------------------------------------------

const light = { x: 20, top: 96, z: -775 };
island(light.x, light.top, light.z, 36);
cone(light.x + 20, light.top, light.z - 17, 5.5, 4, 40, palette.stone, 14);
cone(light.x + 20, light.top + 13, light.z - 17, 5.2, 5, 6, palette.terracotta, 14);
cone(light.x + 20, light.top + 40, light.z - 17, 5.6, 5.6, 1.2, palette.wood, 14);
cone(light.x + 20, light.top + 41.2, light.z - 17, 3, 3, 5, palette.lamp, 10);
cone(light.x + 20, light.top + 46.2, light.z - 17, 4.2, 0, 4.5, palette.terracotta, 14);
house(light.x - 16, light.top, light.z - 18, 11, 8, 0.4, palette.wall, palette.teal, true);
oak(light.x - 26, light.top, light.z + 2);
pine(light.x + 26, light.top, light.z + 8, 1.2);
bush(light.x + 8, light.top, light.z + 6);

export const pad = { x: light.x - 12, y: light.top + 2, z: light.z + 20, radius: 10 };
cone(pad.x, light.top, pad.z, pad.radius, pad.radius, 2, palette.pad, 20);

// --- Ring line -------------------------------------------------------------------------------

const ringLine: Vec3[] = [
  [22, 132, -110],
  [48, 108, -200],
  [70, 90, -290],
  [cliffFace - 10, 80, -360],
  [cliffFace - 10, 78, -420],
  [62, 100, -520],
  [40, 112, -620],
];

// Each ring faces along the line from the ring before it to the ring after it.
export const rings: Ring[] = ringLine.map((pos, i) => {
  const from = ringLine[i - 1] ?? [spawn.x, spawn.y, spawn.z];
  const to = ringLine[i + 1] ?? [pad.x, pad.y, pad.z];
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  return { pos, normal: [d[0] / len, d[1] / len, d[2] / len] };
});

// --- Queries ---------------------------------------------------------------------------------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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

const solids = prims
  .filter((p) => p.solid !== false)
  .map((p) => ({
    prim: p,
    // Radius of a sphere around pos that contains the whole shape, for cheap rejection.
    bound:
      p.kind === 'box'
        ? Math.hypot(...p.size) / 2
        : p.kind === 'cone'
          ? Math.hypot(Math.max(p.rTop, p.rBottom), p.height / 2)
          : p.radius,
    sin: Math.sin(p.rotY ?? 0),
    cos: Math.cos(p.rotY ?? 0),
  }));

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
