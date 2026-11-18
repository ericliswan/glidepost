import type { Level } from '../levels';
import { gorgeStory } from '../story';
import { HOMES, SPIRES, ball, box, bunting, clutter, cone, distanceToWorld, facing, fromRoute, lamp, landingPad, launchTower, letters, lowland, meadow, model, pad, palette, pine, range, seeded, setRoute, smoke, street, streams, trees, updrafts, way, type Vec3 } from '../world';

// The second route: pillars of sandstone standing out of a sea of cloud at the end of the day.
// From the post office on the highest crag, through the Needles, down a canyon and out over a
// town, to the keep at the far end.

// Rock goes down this far, well under the clouds, so no foot ever shows through a gap.
const FOOT = -140;

const ringLine: Vec3[] = [
  [0, 204, -150], // the gate
  [-18, 190, -285], // the Needles
  [18, 176, -420],
  [-6, 162, -555],
  [10, 148, -690], // into the canyon
  [10, 138, -825],
  [-5, 127, -960],
  [-30, 116, -1095],
  [-48, 108, -1230], // between the windmills
  [-36, 98, -1365], // under the aqueduct
  [-8, 88, -1500], // down the high street
  [14, 80, -1635], // the town gate
  [28, 80, -1770], // under the rock arch
  [24, 86, -1905], // between the beacons
];

// The Hollow: a butte east of the canyon with a way straight through it, from north to south.
const hollow = { x: 160, north: -700, south: -860, floor: 136, height: 20, top: 170 };
// The wind out of its far end, round the outside of the canyon to the aqueduct.
const gust: [Vec3, Vec3] = [[160, 142, -884], [28, 122, -1262]];

/** A pillar of sandstone with a cap of grass. */
function spire(x: number, top: number, z: number, r: number) {
  cone(x, FOOT, z, r * 1.3, r, top - 3 - FOOT, palette.sandstone, 9, x);
  cone(x, top - 3, z, r, r * 1.04, 3, palette.grass, 12);
}

/** A spire with something growing or living on top, as much as there is room for. */
function crag(x: number, top: number, z: number, r: number, pick: number) {
  spire(x, top, z, r);
  const turn = pick * Math.PI * 2;
  const which = Math.floor(pick * 6);
  if (r < 10) return pine(x, top, z, 0.9 + pick * 0.7);
  if (r < 18) return model(HOMES[which], x, top, z, turn, 10);
  meadow(x, top, z, r);
  model(SPIRES[which], x - Math.sin(turn) * r * 0.4, top, z - Math.cos(turn) * r * 0.4, turn + Math.PI, 12);
  model(HOMES[which], x + Math.sin(turn) * r * 0.45, top, z + Math.cos(turn) * r * 0.45, turn);
  trees(x, top, z, r - 4, Math.ceil(r / 4));
}

// From the middle of the canyon to either wall, and how thick the walls are.
const HALF = 18;
const THICK = 46;

/**
 * A stretch of canyon between two points on the map: a wall on the left and on the right as
 * high as `rims`, a floor, and a river down the middle. `at` gives the spot so far `along` it
 * and so far `right` of its middle.
 */
function canyon(from: [number, number], to: [number, number], floor: number, rims: [number, number], lap = 0) {
  const heading = facing(from[0], from[1], to[0], to[1]);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const at = (along: number, right: number): [number, number] => [from[0] + fx * along - fz * right, from[1] + fz * along + fx * right];
  rims.forEach((rim, i) => {
    // The walls start `lap` early, to close the crack where two stretches meet at an angle.
    const [x, z] = at((length - lap) / 2, (i ? 1 : -1) * (HALF + THICK / 2));
    box(x, FOOT, z, THICK, rim - FOOT, length + lap, palette.sandstone, heading);
    box(x, rim, z, THICK, 2, length + lap, palette.grass, heading);
  });
  const [x, z] = at(length / 2, 0);
  // Wider than the gap, so that chipped walls leave no crack along the floor.
  box(x, FOOT, z, HALF * 2 + 6, floor - FOOT, length, palette.sandstone, heading);
  box(x, floor, z, 9, 0.4, length, palette.water, heading, false);
  return { at, heading, length };
}

function build() {
  setRoute([0, 231.2, -31], ringLine, [20, 72, -2040]);
  // The secret way: out of the Needles, through the Hollow and down the wind.
  way([100, 152, -600], [hollow.x, hollow.floor + 10, hollow.north], [hollow.x, hollow.floor + 10, hollow.south], ...gust);
  const random = seeded(23);

  // --- The post office crag: the high start ------------------------------------------------------

  spire(0, 200, 0, 38);
  meadow(0, 200, 0, 38);
  launchTower();
  model('building_blacksmith_green', -16, 200, 10, facing(-16, 10, 2, 6));
  model('building_church_blue', 18, 200, 13, facing(18, 13, 2, 6));
  model('building_home_A_red', 19, 200, -9, facing(19, -9, 2, 6));
  model('building_well_blue', 2, 200, 7, 0, 9);
  box(-2, 200, 22, 2, 3, 2, palette.terracotta); // the postbox
  lamp(-5, 200, 20);
  lamp(9, 200, 2);
  clutter(-4, 200, 16, 8, 5);
  trees(0, 200, 0, 34, 10);

  // --- The gate: a tower on each of two spires -----------------------------------------------------

  {
    const [x, y, z] = ringLine[0];
    for (const side of [-1, 1]) {
      spire(x + side * 21, y - 20, z, 11);
      model(side < 0 ? 'building_tower_B_yellow' : 'building_tower_B_red', x + side * 21, y - 20, z);
      box(x, y - 11.5, z + side * 2.3, 24, 1.2, 0.3, palette.timber, 0, false);
    }
    // A footbridge between them, under the ring.
    box(x, y - 13, z, 24, 1.5, 5, palette.wood);
    bunting([x - 13, y + 13, z], [x + 13, y + 13, z], 3);
  }

  // --- The Needles: thin spires to weave between -------------------------------------------------

  ringLine.slice(1, 4).forEach(([x, y, z], i) => {
    // A pair to thread, one taller than the other, and bigger ones standing further out.
    crag(x - 19, y + (i % 2 ? 16 : 34), z, 8, random());
    crag(x + 19, y + (i % 2 ? 34 : 16), z, 8, random());
    crag(x - 48, y + 44, z + 34, 12, random());
    crag(x + 50, y - 6, z - 30, 13, random());
    crag(x + 62, y + 30, z + 66, 9, random());
    crag(x - 42, y + 2, z - 68, 9, random());
  });

  // The baker lives on one of them. Warm air off the oven is the way up for the high road.
  {
    const [x, y, z] = ringLine[1];
    smoke(x + 50, y + 6, z - 30);
    updrafts.push({ x: x + 50, z: z - 30, base: y - 4, top: 300, radius: 26, strength: 16 });
  }

  // --- The canyon: two stretches, with a bend and a waterfall between them -------------------------

  const bend: [number, number] = [10, -880];
  const upper = canyon([10, -650], bend, 112, [170, 176]);
  const lower = canyon(bend, [-40, -1150], 88, [150, 158], 16);
  // How high the ring line is, so far along each stretch.
  const upperLine = (along: number) => 151 - along * 0.074;
  const lowerLine = (along: number) => 133.5 - along * 0.08;

  // An arch of rock over the way in.
  box(10, 163, -656, HALF * 2 + 4, 7, 9, palette.sandstone);
  box(10, 170, -656, HALF * 2 + 4, 2, 9, palette.grass);
  // Spires against the outside of the walls, so the rock is not one flat face.
  spire(-32, 150, -642, 13);
  spire(54, 138, -640, 15);
  spire(...upper.at(70, -HALF - THICK - 6), 140, 16);
  spire(...upper.at(175, HALF + THICK + 8), 150, 18);
  spire(...lower.at(95, HALF + THICK + 8), 120, 17);
  spire(...lower.at(205, -HALF - THICK - 6), 128, 15);

  // A stone bridge over the second ring, and a plank one further down.
  {
    const [x, y, z] = ringLine[5];
    box(x, y + 10, z, HALF * 2 + 4, 3, 6, palette.stone);
    for (const side of [-1, 1]) {
      box(x, y + 13, z + side * 2.8, HALF * 2 + 4, 1.2, 0.4, palette.stone, 0, false);
      lamp(x + side * 9, y + 13, z);
    }
    const [px, pz] = lower.at(150, 0);
    box(px, lowerLine(150) + 11, pz, HALF * 2 + 4, 1, 4, palette.wood, lower.heading);
  }

  // The river steps down at the bend, and pours off the far end into the clouds.
  box(bend[0], 88, bend[1] - 1, 9, 24.4, 1.2, palette.water, 0, false);
  cone(bend[0] - 2, 88, bend[1] - 9, 8, 8, 0.6, palette.water, 14);
  {
    const [x, z] = lower.at(lower.length + 0.6, 0);
    box(x, 6, z, 9, 82.4, 1.2, palette.water, lower.heading, false);
    // Mist off the falls: a way back up for anyone who has dropped out of the bottom.
    const [mx, mz] = lower.at(lower.length + 24, 0);
    updrafts.push({ x: mx, z: mz, base: 20, top: 112, radius: 24, strength: 20 });
    // A letter went over the falls. It is still going round and round at the bottom.
    letters.push([mx, 44, mz]);
  }

  // Cottages along the river, lanterns up the walls and flags across the gap.
  for (const [stretch, floor, line] of [[upper, 112, upperLine], [lower, 88, lowerLine]] as const) {
    for (let along = 22, i = 0; along < stretch.length - 15; along += 42, i++) {
      const side = i % 2 ? 1 : -1;
      const [hx, hz] = stretch.at(along, side * 11.2);
      model(HOMES[(i * 2 + (floor > 100 ? 0 : 2)) % 6 & ~1], hx, floor, hz, facing(hx, hz, ...stretch.at(along, 0)));
      lamp(...stretch.at(along + 12, side * 6), floor);
      const [tx, tz] = stretch.at(along + 21, -side * 11);
      trees(tx, floor, tz, 5, 2);
    }
    for (let along = 15; along < stretch.length; along += 30) {
      for (const side of [-1, 1]) {
        const [lx, lz] = stretch.at(along, side * (HALF - 0.4));
        ball(lx, line(along) - 4, lz, 1, palette.lamp, false);
      }
    }
    for (const along of [60, 130, 200]) {
      const [ax, az] = stretch.at(along, -HALF);
      const [bx, bz] = stretch.at(along, HALF);
      bunting([ax, line(along) + 13, az], [bx, line(along) + 13, bz], 3);
    }
  }

  // Villages up on the rim, and more warm air off the tavern chimney to top up on.
  {
    const [tx, tz] = upper.at(122, -40);
    model('building_tavern_red', tx, 172, tz, Math.PI / 2);
    smoke(tx, 194, tz);
    updrafts.push({ x: tx, z: tz, base: 184, top: 300, radius: 28, strength: 16 });
    const rim = (stretch: typeof upper, along: number, right: number, top: number, name: (typeof HOMES)[number]) => {
      const [x, z] = stretch.at(along, right);
      model(name, x, top, z, facing(x, z, ...stretch.at(along, 0)));
    };
    rim(upper, 22, -42, 172, 'building_windmill_yellow');
    rim(upper, 60, -38, 172, 'building_church_red');
    rim(upper, 92, -46, 172, 'building_home_A_green');
    rim(upper, 160, -36, 172, 'building_home_B_blue');
    rim(upper, 186, -46, 172, 'building_home_A_yellow');
    rim(upper, 212, -37, 172, 'building_home_B_red');
    rim(upper, 40, 38, 178, 'building_tower_A_green');
    rim(upper, 97, 42, 178, 'building_home_B_red');
    rim(upper, 151, 36, 178, 'building_home_A_blue');
    rim(upper, 200, 42, 178, 'building_church_blue');
    rim(lower, 40, -40, 152, 'building_home_A_red');
    rim(lower, 80, -38, 152, 'building_home_B_yellow');
    rim(lower, 140, -44, 152, 'building_tower_A_blue');
    rim(lower, 200, -42, 152, 'building_home_A_green');
    rim(lower, 250, -38, 152, 'building_home_B_green');
    rim(lower, 60, 40, 160, 'building_home_B_blue');
    rim(lower, 135, 40, 160, 'building_windmill_red');
    rim(lower, 190, 44, 160, 'building_home_A_yellow');
    rim(lower, 230, 38, 160, 'building_home_A_red');
    for (const [stretch, tops] of [[upper, [172, 178]], [lower, [152, 160]]] as const) {
      for (const along of [35, 85, 135, 185, 235]) {
        tops.forEach((top, i) => {
          if (along > stretch.length - 20) return;
          const [x, z] = stretch.at(along, (i ? 1 : -1) * (HALF + THICK / 2));
          meadow(x, top, z, 18);
          trees(x, top, z, 19, 5);
        });
      }
    }
  }

  // --- The Hollow: the way nobody tells you about ---------------------------------------------------

  {
    const { x, floor, height, top } = hollow;
    const z = (hollow.north + hollow.south) / 2;
    const length = hollow.north - hollow.south;
    const roof = floor + height;
    for (const side of [-1, 1]) box(x + side * 18, FOOT, z, 16, roof - FOOT, length, palette.sandstone);
    // Wider than the gap and a little short of the ends, so no crack shows and no face is drawn twice.
    box(x, FOOT, z, 26, floor - FOOT, length - 1, palette.sandstone);
    box(x, roof, z, 52, top - roof, length, palette.sandstone);
    box(x, top, z, 52, 2, length, palette.grass);
    // Spires against the outside, so it is not a block.
    spire(x - 31, 150, hollow.north - 22, 13);
    spire(x + 32, 158, z + 10, 15);
    spire(x - 30, 142, hollow.south + 20, 12);
    for (const end of [hollow.north, hollow.south]) {
      const out = end === hollow.north ? 0.4 : -0.4;
      // Vines hang over both mouths. You fly through them.
      for (let i = 0; i < 6; i++) {
        const hang = 4 + ((i * 5) % 7);
        box(x - 8.5 + i * 3.4, roof - hang, end + out, 1.3, hang, 0.3, i % 2 ? palette.leaf : palette.moss, 0, false);
      }
      for (const side of [-1, 1]) ball(x + side * 11.5, floor + 4, end + out, 1.2, palette.lamp, false);
    }
    for (let lz = hollow.north - 20; lz > hollow.south; lz -= 30) {
      for (const side of [-1, 1]) ball(x + side * 9.7, floor + 14, lz, 1, palette.lamp, false);
    }
    letters.push([x, floor + 9, z]);
    // The Hollow draws breath: a draught blows in at one end and out at the other, and without
    // it a glider would run out of speed half way through.
    streams.push({ from: [x, floor + 10, hollow.north + 36], to: [x, floor + 8, hollow.south - 20], radius: 12, speed: 30 });
    streams.push({ from: gust[0], to: gust[1], radius: 16, speed: 30 });
    // Somebody lives on top, as somebody always does.
    meadow(x, top + 2, z + 36, 22);
    meadow(x, top + 2, z - 36, 22);
    model('building_windmill_yellow', x + 6, top + 2, z + 44, 2.6);
    model('building_home_A_red', x - 8, top + 2, z + 14, 1.2);
    model('building_home_B_blue', x + 8, top + 2, z - 30, -0.6);
    model('building_church_red', x - 6, top + 2, z - 58, 0.4);
    trees(x, top + 2, z + 36, 22, 6);
    trees(x, top + 2, z - 36, 22, 6);
  }

  // --- The windmill gap ----------------------------------------------------------------------------

  {
    const [x, y, z] = ringLine[8];
    for (const side of [-1, 1]) {
      spire(x + side * 20, y - 12, z, 11);
      model(side < 0 ? 'building_windmill_red' : 'building_windmill_yellow', x + side * 20, y - 12, z);
    }
  }

  // --- The aqueduct: from a spring on one crag to a mill on another --------------------------------

  {
    const [x, y, z] = ringLine[9];
    // You fly under the channel, between two of its piers.
    box(x, y + 10, z, 156, 4, 7, palette.stone);
    box(x, y + 14, z, 156, 0.4, 3.4, palette.water, 0, false);
    for (let px = x - 75; px <= x + 75; px += 30) box(px, FOOT, z, 8, y + 10 - FOOT, 7, palette.stone);
    crag(x - 94, y + 14, z, 20, 0.3);
    // And one is caught under the last arch at the spring end.
    letters.push([x - 60, y + 2, z]);
    crag(x + 94, y + 14, z, 20, 0.75);
  }

  // --- The town: a high street to fly down, and out through the gate -------------------------------

  {
    const [ax, , az] = ringLine[10];
    const [bx, by, bz] = ringLine[11];
    const ground = 64;
    const half = 10.5;
    const heading = facing(ax, az, bx, bz);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    spire(cx, ground, cz, 92);
    meadow(cx, ground, cz, 88);
    // The first row stands at one ring and the gate towers at the next.
    const at = street(cx, cz, ground, heading, half, [
      ['building_home_B_green', 'building_home_A_red'],
      ['building_tavern_blue', 'building_home_B_yellow'],
      ['building_tower_A_blue', 'building_church_red'],
      ['building_home_B_red', 'building_blacksmith_green'],
      ['building_church_blue', 'building_tower_A_green'],
      ['building_home_A_yellow', 'building_home_B_blue'],
      ['building_tavern_red', 'building_home_A_green'],
      ['building_home_B_yellow', 'building_tower_A_blue'],
      ['building_tower_B_red', 'building_tower_B_yellow'],
    ]);
    // The gate: an arch between the last two towers, with a lantern hung in the middle of it.
    const [gx, gz] = at(64, 0);
    box(gx, by + 11, gz, 24, 4, 6, palette.stone, heading);
    box(gx, by + 15, gz, 26, 1.2, 8, palette.terracotta, heading);
    ball(gx, by + 10, gz, 1.4, palette.lamp, false);
    const [fx, fz] = at(-40, -half - 6);
    const [tx, tz] = at(-40, half + 6);
    bunting([fx, ground + 36, fz], [tx, ground + 36, tz], 3);

    // The cathedral behind one side of the street, and the tavern with its warm chimney behind the other.
    const [kx, kz] = at(-6, -54);
    model('building_church_red', kx, ground, kz, facing(kx, kz, ...(at(-6, 0) as [number, number])), 24);
    const [vx, vz] = at(8, 52);
    model('building_tavern_red', vx, ground, vz, facing(vx, vz, ...(at(8, 0) as [number, number])));
    smoke(vx, ground + 22, vz);
    updrafts.push({ x: vx, z: vz, base: ground + 12, top: 200, radius: 28, strength: 16 });
    [[-58, 46], [52, 44], [56, -44], [-64, -34], [-28, 64], [34, -68], [-34, -62], [60, 20]].forEach(([along, right], i) => {
      const [x, z] = at(along, right);
      model(HOMES[i % 6], x, ground, z, facing(x, z, ...(at(along, 0) as [number, number])));
    });
    trees(cx, ground, cz, 86, 34);
  }

  // --- The rock arch -------------------------------------------------------------------------------

  {
    const [x, y, z] = ringLine[12];
    spire(x - 21, y + 24, z, 9);
    spire(x + 21, y + 32, z, 10);
    box(x, y + 11, z, 46, 9, 13, palette.sandstone);
    box(x, y + 20, z, 46, 1.5, 13, palette.grass);
    pine(x - 5, y + 21.5, z, 1.1);
    pine(x + 21, y + 32, z, 1.3);
  }

  // --- The beacons: two lit towers either side of the way in ----------------------------------------

  {
    const [x, y, z] = ringLine[13];
    for (const side of [-1, 1]) {
      const bx = x + side * 15;
      cone(bx, FOOT, z, 5, 3.4, y + 8 - FOOT, palette.stone, 12);
      cone(bx, y + 8, z, 4.2, 4.2, 1, palette.wood, 12);
      cone(bx, y + 9, z, 2.4, 2.4, 4, palette.lamp, 10);
      cone(bx, y + 13, z, 3.6, 0, 4.5, palette.teal, 12);
    }
  }

  // --- Amberwatch Keep: the destination -------------------------------------------------------------

  {
    const keep = { x: pad.x, top: pad.y - 2, z: pad.z - 16 };
    const back = keep.z - 22;
    const front = keep.z + 18;
    spire(keep.x, keep.top, keep.z, 46);
    meadow(keep.x, keep.top, keep.z, 44);
    cone(pad.x, keep.top, pad.z, 17, 17, 0.3, palette.stone, 20);
    landingPad();
    // A wall round the back and both sides. The front is left open, to fly in by.
    box(keep.x, keep.top, back, 60, 12, 3.5, palette.stone);
    for (const side of [-1, 1]) {
      const x = keep.x + side * 30;
      box(x, keep.top, (back + front) / 2, 3.5, 12, front - back, palette.stone);
      for (const z of [back, front]) {
        cone(x, keep.top, z, 4.6, 4.2, 20, palette.stone, 10);
        cone(x, keep.top + 20, z, 5.6, 0, 8, palette.teal, 10);
      }
      lamp(x - side * 6, keep.top, front);
      // Banners down the front of the great tower.
      box(keep.x + side * 4, keep.top + 24, back + 4.9, 2.4, 11, 0.2, side < 0 ? palette.terracotta : palette.pad, 0, false);
    }
    // The great tower, with the watch fire at the top.
    cone(keep.x, keep.top, back - 4, 9, 8.4, 42, palette.stone, 14);
    cone(keep.x, keep.top + 42, back - 4, 9.6, 9.6, 2.5, palette.stone, 14);
    cone(keep.x, keep.top + 44.5, back - 4, 4, 4, 5, palette.lamp, 10);
    cone(keep.x, keep.top + 49.5, back - 4, 6.2, 0, 9, palette.teal, 14);
    model('building_blacksmith_green', keep.x + 17, keep.top, back + 13, facing(keep.x + 17, back + 13, pad.x, pad.z));
    model('building_home_A_blue', keep.x - 19, keep.top, back + 11, facing(keep.x - 19, back + 11, pad.x, pad.z));
    model('tent', keep.x - 21, keep.top, keep.z + 6, 1.2);
    clutter(keep.x + 16, keep.top, keep.z + 8, 6, 4);
    trees(keep.x, keep.top, keep.z, 43, 8);
  }

  // --- Crags standing all round, so the gorge is never empty ---------------------------------------

  for (let i = 0; i < 130; i++) {
    const x = (random() * 2 - 1) * 270;
    const z = -30 - random() * 2100;
    const r = 8 + random() * 16;
    // About as high as the route is there, so they stand round you and not far below.
    const top = 215 + (z / 2100) * 130 + (random() - 0.5) * 110;
    const pick = random();
    if (fromRoute(x, z) < r + 36 || distanceToWorld(x, top, z) < r + 14) continue;
    crag(x, top, z, r, pick);
  }

  // --- The mountains: a wall round the whole gorge -------------------------------------------------

  range(0, -1030, 640, 1700, 26, 300, 1.5);
  range(0, -1030, 1200, 2300, 18, 480, 2.8);
  lowland(0, -1030, 640, 1150, 700);
}

export const gorge: Level = {
  id: 'gorge',
  name: 'The Amber Gorge',
  blurb: 'Honey cake for the warden of the keep.',
  destination: 'to the keep',
  centre: [0, 110, -1030],
  spread: [560, 1450],
  mood: {
    zenith: '#4f64c8',
    middle: '#f7a98c',
    horizon: '#ffe0a8',
    sun: '#fff0c0',
    sunDirection: [-0.5, 0.35, -0.75],
    sunlight: '#ffc890',
    skylight: '#ffd9c8',
    bounce: '#b08fd0',
    cloudShade: '#e9a0b4',
    land: '#f2c9a6',
  },
  build,
  ...gorgeStory,
};
