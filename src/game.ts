import { config } from './config';
import { stepFlight, type FlightInput, type FlightState } from './flight';
import { crossesRing, distanceToWorld, liftAt, onPad, rings, skimAt, spawn, type Vec3 } from './world';

// The rules of a delivery: launch, rings, landing and the ways a run can end.
// Pure game logic. Nothing here draws or makes a sound; main.ts reacts to the events.

export type Phase = 'ready' | 'flying' | 'crashed' | 'landed';

export type GameEvent =
  | { type: 'ring'; chain: number }
  | { type: 'landed'; perfect: boolean }
  | { type: 'crashed'; reason: 'hit' | 'hardLanding' | 'clouds' }
  | { type: 'reset' };

export interface Game {
  phase: Phase;
  glider: FlightState;
  /** Seconds since launch. */
  time: number;
  /** Rings hit in a row, and the seconds left to hit the next one. */
  chain: number;
  chainTimer: number;
  ringsHit: boolean[];
  /** Skim strength (0 to 1) and whether thrust was applied on the last step, for feedback. */
  skim: number;
  boosting: boolean;
  /** Seconds until a crashed glider is back on the deck. */
  respawnTimer: number;
}

export function createGame(): Game {
  const game = { glider: {} } as Game;
  reset(game);
  return game;
}

export function reset(game: Game) {
  game.phase = 'ready';
  Object.assign(game.glider, {
    x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw,
    pitch: config.flight.launchPitch, roll: 0, speed: 0, boost: 0,
  });
  game.time = 0;
  game.chain = 0;
  game.chainTimer = 0;
  game.ringsHit = rings.map(() => false);
  game.skim = 0;
  game.boosting = false;
  game.respawnTimer = 0;
}

export function launch(game: Game) {
  if (game.phase !== 'ready') return;
  game.phase = 'flying';
  game.glider.speed = config.flight.launchSpeed;
}

/** Advances the game by dt seconds. Returns what happened, if anything did. */
export function step(game: Game, input: FlightInput, dt: number): GameEvent | null {
  if (game.phase === 'crashed') {
    game.respawnTimer -= dt;
    if (game.respawnTimer > 0) return null;
    reset(game);
    return { type: 'reset' };
  }
  if (game.phase !== 'flying') return null;

  const g = game.glider;
  const from: Vec3 = [g.x, g.y, g.z];
  const air = { lift: liftAt(g.x, g.y, g.z), skim: game.skim };
  game.boosting = stepFlight(g, input, air, dt);
  game.time += dt;

  let event: GameEvent | null = null;

  game.chainTimer -= dt;
  if (game.chainTimer <= 0) game.chain = 0;
  const to: Vec3 = [g.x, g.y, g.z];
  rings.forEach((ring, i) => {
    if (game.ringsHit[i] || !crossesRing(ring, from, to)) return;
    const r = config.rings;
    game.ringsHit[i] = true;
    game.chain += 1;
    game.chainTimer = r.chainWindow;
    g.speed += r.kick * Math.min(r.maxMultiplier, 1 + r.chainStep * (game.chain - 1));
    event = { type: 'ring', chain: game.chain };
  });

  const clearance = distanceToWorld(g.x, g.y, g.z);
  game.skim = skimAt(clearance, g.speed);

  if (onPad(g.x, g.y, g.z)) {
    if (g.speed > config.landing.maxSpeed) return crash(game, 'hardLanding');
    game.phase = 'landed';
    game.skim = 0;
    game.boosting = false;
    return { type: 'landed', perfect: g.speed <= config.landing.perfectSpeed };
  }
  if (clearance < config.glider.radius) return crash(game, 'hit');
  if (g.y < config.world.cloudLevel) return crash(game, 'clouds');

  return event;
}

function crash(game: Game, reason: 'hit' | 'hardLanding' | 'clouds'): GameEvent {
  game.phase = 'crashed';
  game.skim = 0;
  game.boosting = false;
  game.respawnTimer = config.world.respawnDelay;
  return { type: 'crashed', reason };
}
