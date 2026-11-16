import { beforeAll, describe, expect, it } from 'vitest';
import { config } from './config';
import type { FlightInput } from './flight';
import { createGame, launch, step, type Game, type GameEvent } from './game';
import { levels, loadLevel } from './levels';
import { cliffFace } from './levels/valley';
import { distanceToWorld, islands, liftAt, pad, peaks, placements, rings, spawn, updrafts } from './world';

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

/** Steps until the game produces an event that is not a ring, or time runs out. */
function untilEvent(game: Game, input = HANDS_OFF, seconds = 30): GameEvent | null {
  for (let t = 0; t < seconds; t += DT) {
    const event = step(game, input, DT);
    if (event && event.type !== 'ring') return event;
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
