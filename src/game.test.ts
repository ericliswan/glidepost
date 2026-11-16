import { beforeAll, describe, expect, it } from 'vitest';
import { config } from './config';
import type { FlightInput } from './flight';
import { createGame, launch, reset, step, type Game, type GameEvent } from './game';
import { levels, loadLevel } from './levels';
import { cliffFace } from './levels/valley';
import { bells, distanceToWorld, islands, letters, liftAt, pad, peaks, placements, rings, spawn, streams, updrafts, windAt } from './world';

// The valley is what the tests below are written against. Every level gets the checks at the end.
beforeAll(() => loadLevel(levels[0]));

const DT = 1 / 120;
const HANDS_OFF: FlightInput = { pitch: 0, turn: 0, boost: false, brake: false };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A game already in flight, with the glider moved somewhere specific. */
function flyingAt(over: Partial<Game['glider']>): Game {
  const game = createGame();
  launch(game);
  Object.assign(game.glider, over);
  return game;
}

/** Steps until the flight ends one way or another, or time runs out. */
function untilEvent(game: Game, input = HANDS_OFF, seconds = 30): GameEvent | null {
  const passing = ['ring', 'letter', 'bell'];
  for (let t = 0; t < seconds; t += DT) {
    const event = step(game, input, DT);
    if (event && !passing.includes(event.type)) return event;
  }
  return null;
}

/** Autopilot: turn towards a point on the map and hold a pitch. */
function steer(game: Game, x: number, z: number, pitch: number): FlightInput {
  const g = game.glider;
  const off = Math.atan2(-(x - g.x), -(z - g.z)) - g.yaw;
  const error = Math.atan2(Math.sin(off), Math.cos(off));
  return { ...HANDS_OFF, turn: clamp(-error * 3, -1, 1), pitch: clamp((pitch - g.pitch) * 5, -1, 1) };
}

const overPad = (game: Game) => Math.hypot(game.glider.x - pad.x, game.glider.z - pad.z) < pad.radius;
const BEST_GLIDE = -0.11;

describe('level', () => {
  it('measures distance to boxes, cones and open air', () => {
    // Above the flat top of the waterfall rock (grass slab top is at y = 156).
    expect(distanceToWorld(92, 160, -385)).toBeCloseTo(4);
    // Beside the cliff face.
    expect(distanceToWorld(cliffFace - 5, 100, -385)).toBeCloseTo(5);
    // Inside the rock.
    expect(distanceToWorld(112, 100, -385)).toBeLessThan(0);
    // Above the landing pad, a cylinder.
    expect(distanceToWorld(pad.x, pad.y + 3, pad.z)).toBeCloseTo(3);
  });

  it('gives a model the shape of its outline, not of a box round it', () => {
    const home = placements.find((p) => p.name.startsWith('building_home_A'))!;
    const [x, ground, z] = home.pos;
    expect(distanceToWorld(x, ground + 5, z)).toBeLessThan(0);
    // Level with the ridge of the roof and 4 m to one side of it: inside a box, clear of a roof.
    const sideX = x + Math.cos(home.rotY) * 4;
    const sideZ = z - Math.sin(home.rotY) * 4;
    expect(distanceToWorld(sideX, ground + 12, sideZ)).toBeGreaterThan(1);
  });

  it('has lift inside updrafts and none outside', () => {
    const u = updrafts[0];
    expect(liftAt(u.x, u.base + 40, u.z)).toBe(u.strength);
    expect(liftAt(u.x + u.radius + 1, u.base + 40, u.z)).toBe(0);
    expect(liftAt(u.x, u.top + 1, u.z)).toBe(0);
  });
});

describe('rules', () => {
  it('waits on the deck until launched', () => {
    const game = createGame();
    step(game, HANDS_OFF, 1);
    expect(game.glider.z).toBe(spawn.z);
    launch(game);
    step(game, HANDS_OFF, DT);
    expect(game.glider.z).toBeLessThan(spawn.z);
  });

  it('crashes into the cliff, then puts the glider back on the deck', () => {
    const game = flyingAt({ x: cliffFace - 30, y: 100, z: -385, yaw: -Math.PI / 2, pitch: 0 });
    expect(untilEvent(game)).toEqual({ type: 'crashed', reason: 'hit' });
    expect(untilEvent(game)).toEqual({ type: 'reset' });
    expect(game.phase).toBe('ready');
    expect(game.glider.x).toBe(spawn.x);
  });

  it('is lost when it drops below the clouds', () => {
    const game = flyingAt({ x: -40, y: 30, z: -390, pitch: -0.5 });
    expect(untilEvent(game)).toEqual({ type: 'crashed', reason: 'clouds' });
  });

  it('lands on the pad when slow enough', () => {
    const game = flyingAt({ x: pad.x, y: pad.y + 3, z: pad.z + 8, pitch: -0.3, speed: 18 });
    expect(untilEvent(game)).toEqual({ type: 'landed', perfect: false });
    expect(game.phase).toBe('landed');
  });

  it('rewards a slow touchdown as a perfect landing', () => {
    const game = flyingAt({ x: pad.x, y: pad.y + 2, z: pad.z + 6, pitch: -0.3, speed: 12 });
    expect(untilEvent(game)).toEqual({ type: 'landed', perfect: true });
  });

  it('crashes when landing too fast', () => {
    const game = flyingAt({ x: pad.x, y: pad.y + 3, z: pad.z + 8, pitch: -0.3, speed: 40 });
    expect(untilEvent(game)).toEqual({ type: 'crashed', reason: 'hardLanding' });
  });

  it('charges boost while skimming the cliff and not in open air', () => {
    // Along the bare face above the terrace market, and far above everything.
    const skimming = flyingAt({ x: cliffFace - 3, y: 130, z: -372, pitch: -0.1, speed: 35 });
    const open = flyingAt({ x: cliffFace - 3, y: 400, z: -372, pitch: -0.1, speed: 35 });
    for (let t = 0; t < 1; t += DT) {
      step(skimming, HANDS_OFF, DT);
      step(open, HANDS_OFF, DT);
    }
    expect(skimming.phase).toBe('flying');
    expect(skimming.glider.boost).toBeGreaterThan(0.1);
    expect(open.glider.boost).toBe(0);
  });
});

describe('routes', () => {
  it('cannot reach the lighthouse by gliding straight there', () => {
    // The same glide in empty sky far to one side, so the answer does not depend on the scenery.
    const away = 5000;
    const game = flyingAt({ x: spawn.x + away });
    const short = () => Math.hypot(game.glider.x - away - pad.x, game.glider.z - pad.z) > pad.radius;
    while (game.phase === 'flying' && short()) step(game, steer(game, pad.x + away, pad.z, BEST_GLIDE), DT);
    // Either it arrives under the island or it is already below the clouds.
    expect(game.glider.y).toBeLessThan(pad.y);
  });

  it('reaches the lighthouse with height to spare by climbing a market updraft', () => {
    const game = createGame();
    launch(game);
    const u = updrafts[1];
    const fromColumn = () => Math.hypot(game.glider.x - u.x, game.glider.z - u.z);

    while (game.phase === 'flying' && fromColumn() > 10) step(game, steer(game, u.x, u.z, BEST_GLIDE), DT);
    while (game.phase === 'flying' && game.glider.y < 185) {
      // Circle: keep turning while near the middle, head back in when drifting out.
      const input = steer(game, u.x, u.z, -0.2);
      if (fromColumn() < 12) input.turn = 1;
      step(game, input, DT);
    }
    while (game.phase === 'flying' && !overPad(game)) step(game, steer(game, pad.x, pad.z, BEST_GLIDE), DT);

    expect(game.phase).toBe('flying');
    expect(game.glider.y).toBeGreaterThan(pad.y + 20);
    expect(game.time).toBeLessThan(60);
  });
});

describe('secrets', () => {
  it('has wind inside a stream, blowing along it, and none outside', () => {
    const s = streams[0];
    const middle = s.from.map((from, axis) => (from + s.to[axis]) / 2);
    const wind = windAt(middle[0], middle[1], middle[2]);
    expect(Math.hypot(...wind)).toBeCloseTo(s.speed);
    // Towards the far end.
    expect(wind[2] * (s.to[2] - s.from[2])).toBeGreaterThan(0);
    expect(windAt(middle[0], middle[1] + s.radius + 1, middle[2])).toEqual([0, 0, 0]);
    expect(windAt(...s.from)).toEqual([0, 0, 0]);
  });

  it('picks up a lost letter once, and keeps it through a crash', () => {
    const [x, y, z] = letters[0];
    const game = flyingAt({ x, y, z: z + 2, speed: 20 });
    expect(step(game, HANDS_OFF, DT)).toEqual({ type: 'letter', index: 0 });
    expect(step(game, HANDS_OFF, DT)).toBeNull();
    reset(game);
    expect(game.found).toEqual([true, false, false]);
  });

  it('rings a church bell once for each pass by the steeple', () => {
    // A steeple with open air on the near side of it.
    const [x, y, z] = bells.find((tip) => distanceToWorld(tip[0], tip[1] + 5, tip[2] + 12) > 4)!;
    const game = flyingAt({ x, y: y + 5, z: z + 12, pitch: 0, speed: 20 });
    const events: (GameEvent | null)[] = [];
    for (let t = 0; t < 1.5; t += DT) events.push(step(game, HANDS_OFF, DT));
    expect(events.filter((event) => event?.type === 'bell')).toHaveLength(1);
    expect(game.phase).toBe('flying');
  });

  it('can be flown through the cave behind the waterfall and round to the lighthouse on the breeze', () => {
    const cave = letters[1];
    const breeze = streams[0];
    // Level with the mouth, having climbed the mist beside it.
    const game = flyingAt({ x: 50, y: cave[1] + 2, z: cave[2], yaw: -Math.PI / 2, pitch: 0, speed: 28 });
    const g = game.glider;
    while (game.phase === 'flying' && g.x < 150) step(game, steer(game, 200, cave[2], -0.02), DT);
    expect(game.found[1]).toBe(true);
    while (game.phase === 'flying' && g.z > breeze.to[2] + 10) step(game, steer(game, breeze.to[0], breeze.to[2], BEST_GLIDE), DT);
    while (game.phase === 'flying' && !overPad(game)) step(game, steer(game, pad.x, pad.z, BEST_GLIDE), DT);

    expect(game.phase).toBe('flying');
    expect(g.y).toBeGreaterThan(pad.y);
  });
});

// How long the ring line may take in each level, in seconds.
const PAR: Record<string, number> = { valley: 25, gorge: 55 };

describe.each(levels)('$name', (level) => {
  beforeAll(() => loadLevel(level));

  it('starts the glider clear of the launch deck', () => {
    expect(distanceToWorld(spawn.x, spawn.y, spawn.z)).toBeGreaterThan(config.glider.radius * 2);
  });

  it('leaves room to fly through every ring', () => {
    for (const ring of rings) {
      expect(distanceToWorld(...ring.pos)).toBeGreaterThan(config.rings.radius + config.glider.radius);
    }
  });

  it('keeps the whole ring line clear', () => {
    // From the first ring on: the glider starts on the deck, which is nearer than that.
    const line = [...rings.map((ring) => ring.pos), [pad.x, pad.y + 12, pad.z]];
    for (let i = 1; i < line.length; i++) {
      for (let t = 0; t <= 1; t += 0.02) {
        const [x, y, z] = line[i].map((to, axis) => line[i - 1][axis] + (to - line[i - 1][axis]) * t);
        expect(distanceToWorld(x, y, z), `leg ${i} at ${t.toFixed(2)}`).toBeGreaterThan(7);
      }
    }
  });

  it('stands the mountains clear of every island and of the route', () => {
    const gap = (x: number, y: number, z: number, peak: (typeof peaks)[number]) => {
      const up = (y - (peak.pos[1] - peak.height / 2)) / peak.height;
      return Math.hypot(x - peak.pos[0], z - peak.pos[2]) - peak.rBottom * (1 - up);
    };
    for (const peak of peaks) {
      for (const island of islands) expect(gap(island.x, island.top, island.z, peak) - island.r).toBeGreaterThan(20);
      for (const ring of rings) expect(gap(...ring.pos, peak)).toBeGreaterThan(100);
      expect(gap(pad.x, pad.y, pad.z, peak)).toBeGreaterThan(100);
    }
  });

  it('hides three letters, each with room to fly up to it', () => {
    expect(letters).toHaveLength(3);
    for (const letter of letters) expect(distanceToWorld(...letter)).toBeGreaterThan(config.glider.radius * 4);
  });

  it('can be flown down the ring line, chaining every ring', () => {
    const game = createGame();
    launch(game);
    let next = 0;
    let topSpeed = 0;
    while (game.phase === 'flying' && !(next === rings.length && overPad(game))) {
      const g = game.glider;
      while (next < rings.length && (game.ringsHit[next] || g.z < rings[next].pos[2] - 5)) next++;
      const [x, y, z] = rings[next]?.pos ?? [pad.x, pad.y + 25, pad.z];
      const climb = Math.atan2(y - g.y, Math.hypot(x - g.x, z - g.z));
      step(game, steer(game, x, z, clamp(climb, -1.2, 1)), DT);
      topSpeed = Math.max(topSpeed, g.speed);
    }

    expect(game.phase).toBe('flying');
    expect(game.ringsHit).not.toContain(false);
    expect(game.chain).toBe(rings.length);
    expect(game.time).toBeLessThan(PAR[level.id]);
    // Fast, but not so fast the rings stop being flyable.
    expect(topSpeed).toBeGreaterThan(50);
    expect(topSpeed).toBeLessThan(75);
  });
});

describe('the gorge, the long way', () => {
  beforeAll(() => loadLevel(levels[1]));

  it('can be flown through the Hollow and down the gust to the aqueduct', () => {
    const [draught, gust] = streams;
    const arch = rings.reduce((nearest, ring) => (Math.abs(ring.pos[2] - gust.to[2]) < Math.abs(nearest.pos[2] - gust.to[2]) && ring.pos[2] < gust.to[2] ? ring : nearest), rings[rings.length - 1]).pos;
    // Off the route to the east, past the Needles, at the height of the rim.
    const game = flyingAt({ x: 120, y: 152, z: -620, yaw: -0.4, pitch: 0, speed: 30 });
    const g = game.glider;
    while (game.phase === 'flying' && g.z > draught.from[2] - 26) step(game, steer(game, draught.from[0], draught.from[2] - 36, -0.05), DT);
    while (game.phase === 'flying' && g.z > draught.to[2]) step(game, steer(game, draught.to[0], draught.to[2] - 40, -0.03), DT);
    expect(game.found[1]).toBe(true);
    // A glide alone would have stalled in there.
    expect(g.speed).toBeGreaterThan(config.flight.stallSpeed * 1.5);
    while (game.phase === 'flying' && g.z > gust.to[2] + 10) step(game, steer(game, gust.to[0], gust.to[2], BEST_GLIDE), DT);
    while (game.phase === 'flying' && g.z > arch[2]) step(game, steer(game, arch[0], arch[2], BEST_GLIDE), DT);

    expect(game.phase).toBe('flying');
    expect(Math.hypot(g.x - arch[0], g.y - arch[1])).toBeLessThan(config.rings.radius);
  }, 20_000);

  it('is too far to glide straight to the keep', () => {
    const away = 5000;
    const game = flyingAt({ x: spawn.x + away });
    const short = () => Math.hypot(game.glider.x - away - pad.x, game.glider.z - pad.z) > pad.radius;
    while (game.phase === 'flying' && short()) step(game, steer(game, pad.x + away, pad.z, BEST_GLIDE), DT);
    expect(game.glider.y).toBeLessThan(pad.y);
  }, 20_000);

  it('reaches the keep over the rim, by climbing the warm air off the baker\'s chimney', () => {
    const game = createGame();
    launch(game);
    // The baker's chimney in the Needles: the first column built.
    const u = updrafts[0];
    const fromColumn = () => Math.hypot(game.glider.x - u.x, game.glider.z - u.z);

    // Out over the gate first, above the bunting, then right towards the smoke.
    const gate = rings[0].pos;
    while (game.phase === 'flying' && game.glider.z > gate[2]) step(game, steer(game, gate[0], gate[2] - 20, BEST_GLIDE), DT);
    while (game.phase === 'flying' && fromColumn() > 10) step(game, steer(game, u.x, u.z, BEST_GLIDE), DT);
    while (game.phase === 'flying' && game.glider.y < 285) {
      const input = steer(game, u.x, u.z, -0.2);
      if (fromColumn() < 12) input.turn = 1;
      step(game, input, DT);
    }
    while (game.phase === 'flying' && !overPad(game)) step(game, steer(game, pad.x, pad.z, BEST_GLIDE), DT);

    expect(game.phase).toBe('flying');
    expect(game.glider.y).toBeGreaterThan(pad.y + 20);
    // Slow enough that the warden can tell which way you came.
    expect(game.time).toBeGreaterThan(60);
  }, 20_000);
});
