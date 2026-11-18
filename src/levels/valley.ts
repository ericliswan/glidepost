import type { Level } from '../levels';
import { valleyStory } from '../story';
import { aqueduct, ball, box, bridges, bunting, clutter, cone, facing, farIslands, giants, hamlet, island, lamp, lowland, landingPad, launchTower, letters, meadow, model, palette, range, setRoute, smoke, street, streams, trees, updrafts, way, type ModelName, type Vec3 } from '../world';

// The first route: floating islands in a green valley, from the post office to the lighthouse.

const market = { x: -90, top: 62, z: -300 };
const rock = { x: 112, top: 46, z: -385 };
// The cliff face the ring line runs along, at x = cliffFace.
export const cliffFace = rock.x - 28;
const light = { x: 20, top: 96, z: -775 };
// The cave behind the waterfall: a way straight through the rock, high up, from west to east.
const cave = { z: rock.z - 50, floor: 120, height: 18, width: 18 };
// The wind that blows from the far end of the cave round to the lighthouse.
const breeze: [Vec3, Vec3] = [[166, 124, -456], [52, 116, -712]];

const ringLine: Vec3[] = [
  [34, 132, -110], // the gate
  [48, 108, -200], // Chimney Lane
  [70, 90, -290],
  [cliffFace - 10, 80, -360], // inside the tunnel
  [cliffFace - 10, 78, -420], // the terrace market
  [62, 100, -520], // under the viaduct
  [40, 112, -620], // between the windmills
];

function build() {
  setRoute([0, 151.2, -31], ringLine, [light.x - 12, light.top + 2, light.z + 20]);
  // The secret way: over the market roofs, through the cave and down the wind.
  way([20, cave.floor + 8, cave.z], [150, cave.floor + 8, cave.z], ...breeze);

  // --- Post office: the high start ---------------------------------------------------------------

  island(0, 120, 0, 36);
  launchTower();
  model('building_tavern_red', -15, 120, 10, facing(-15, 10, 2, 6));
  model('building_home_A_yellow', 17, 120, 13, facing(17, 13, 2, 6));
  model('building_home_B_blue', 19, 120, -8, facing(19, -8, 2, 6));
  model('building_well_blue', 2, 120, 7, 0, 9);
  box(-2, 120, 22, 2, 3, 2, palette.terracotta); // the postbox
  lamp(-5, 120, 20);
  lamp(9, 120, 2);
  clutter(-4, 120, 16, 8, 5);
  trees(0, 120, 0, 32, 10);
  // A letter that never left: it blew off the back of the island.
  letters.push([-2, 136, 36]);

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
    // The street runs along the ring line, centred a little short of the ring.
    const heading = facing(ringLine[0][0], ringLine[0][2], ringLine[2][0], ringLine[2][2]);
    const cx = x - 6 * Math.sin(heading);
    const cz = z - 6 * Math.cos(heading);
    island(cx, ground, cz, 50);
    const at = street(cx, cz, ground, heading, half, [
      ['building_tower_B_yellow', 'building_tower_B_red'],
      ['building_tower_A_blue', 'building_tower_A_green'],
      ['building_church_red', 'building_tavern_blue'],
      ['building_tavern_red', 'building_home_B_yellow'],
      ['building_home_B_red', 'building_home_A_blue'],
    ]);
    const [ax, az] = at(-32, -half - 6);
    const [bx, bz] = at(-32, half + 6);
    bunting([ax, ground + 35, az], [bx, ground + 35, bz], 3);
    trees(cx, ground, cz, 46, 16);
  }

  // A windmill out on its own marks the turn towards the cliff.
  hamlet(42, 84, -286, 14, ['building_windmill_red']);

  // --- Waterfall rock ------------------------------------------------------------------------------

  island(rock.x, rock.top, rock.z, 74);
  {
    // The rock is stacked round the cave: under it, either side of it and over it.
    const roof = cave.floor + cave.height;
    const north = rock.z + 65 - (cave.z + cave.width / 2);
    const south = cave.z - cave.width / 2 - (rock.z - 65);
    box(rock.x, rock.top, rock.z, 56, cave.floor - rock.top, 130, palette.cliff);
    box(rock.x, cave.floor, rock.z + 65 - north / 2, 56, cave.height, north, palette.cliff);
    box(rock.x, cave.floor, rock.z - 65 + south / 2, 56, cave.height, south, palette.cliff);
    box(rock.x, roof, rock.z, 56, rock.top + 108 - roof, 130, palette.cliff);
    // Lanterns either side of the falls give it away, and more light the way through.
    for (const side of [-1, 1]) {
      ball(cliffFace - 0.3, cave.floor + 10, cave.z + side * (cave.width / 2 + 2), 1.2, palette.lamp, false);
      for (const x of [rock.x - 16, rock.x, rock.x + 16]) ball(x, cave.floor + 13, cave.z + side * (cave.width / 2 - 0.3), 1, palette.lamp, false);
    }
    letters.push([rock.x, cave.floor + 8, cave.z]);
    streams.push({ from: breeze[0], to: breeze[1], radius: 16, speed: 30 });
  }
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
  box(cliffFace - 0.6, rock.top, cave.z, 1.2, 108, 16, palette.water, 0, false);
  cone(cliffFace - 7, rock.top, cave.z, 9, 9, 0.6, palette.water, 14);
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
  landingPad();
  // Somebody's letter went round the lamp and stuck.
  letters.push([light.x + 20, light.top + 44, light.z - 26]);
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
  hamlet(182, 84, -585, 20, ['building_tower_B_yellow', 'building_home_A_blue']);
  hamlet(14, 100, -572, 14, ['building_home_B_green']);
  hamlet(72, 106, -588, 13, ['building_home_A_yellow']);
  hamlet(-60, 110, -650, 18, ['building_church_blue', 'building_home_A_red']);
  hamlet(-14, 104, -690, 14, ['building_home_B_blue']);
  hamlet(90, 104, -700, 16, ['building_windmill_red']);

  // --- The mountains: a wall round the whole valley -----------------------------------------------

  range(60, -390, 720, 980, 18, 290, 1.4);
  range(60, -390, 1300, 1500, 14, 480, 1.9);

  // --- Far islands: the middle distance between the town and the mountains ------------------------

  farIslands(60, -390, 340, 540, 22, 50, 170);

  // --- What fills the gaps: woods below, giant trees, bridges and an aqueduct ---------------------

  // Water from the top of the rock carried over to the hamlet by the gate.
  aqueduct([rock.x + 6, 118, rock.z + 66], [122, 118, -183]);
  bridges();
  // The safe route glides down to a market updraft, climbs it and glides on to the lighthouse.
  const u = updrafts[1];
  way([0, 151, -31], [u.x, 100, u.z], [u.x, 185, u.z], [light.x, light.top + 10, light.z]);
  // The cliff the tests skim along.
  giants(12, [[cliffFace - 3, 130, -372]]);
  lowland(60, -390, 760, 1000, 700);
}

export const valley: Level = {
  id: 'valley',
  name: 'Lighthouse Run',
  blurb: 'A parcel for the lighthouse keeper.',
  destination: 'to the lighthouse',
  centre: [60, 60, -390],
  spread: [620, 820],
  mood: {
    zenith: '#2a78dc',
    middle: '#69b4f4',
    horizon: '#dcefff',
    sun: '#fffbe6',
    sunDirection: [-0.6, 0.7, -0.4],
    sunlight: '#fff1d6',
    skylight: '#dcecff',
    bounce: '#a9b6ec',
    cloudShade: '#b4c6f5',
    land: '#cfe2f2',
  },
  build,
  ...valleyStory,
};
