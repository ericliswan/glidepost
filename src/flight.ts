import { config } from './config';

// The flight model. A pure function of state, input and timestep: no rendering, no world.
//
// The glider always moves along its nose. Speed changes by gravity along the nose minus drag,
// so with E = g*h + v²/2 the only thing that ever removes energy is drag, and the only things
// that add it are updrafts and boost.

export interface FlightState {
  x: number;
  y: number;
  z: number;
  /** Heading. 0 faces -Z; positive turns left (counter-clockwise from above). */
  yaw: number;
  /** Positive is nose up. */
  pitch: number;
  /** Visual bank only. Negative is right wing down. */
  roll: number;
  speed: number;
  /** Boost meter, 0 to 1. */
  boost: number;
}

export interface FlightInput {
  /** -1 (dive) to 1 (pull up). */
  pitch: number;
  /** -1 (left) to 1 (right). */
  turn: number;
  boost: boolean;
  brake: boolean;
}

/** What the surrounding air is doing to the glider this step. */
export interface Air {
  /** Vertical speed of the air, m/s. */
  lift: number;
  /** How hard the glider is skimming a surface, 0 to 1. */
  skim: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Drag deceleration at a given speed, before turn and brake multipliers. */
export function dragAt(speed: number): number {
  const f = config.flight;
  // Induced drag is capped at its stall-speed value so a stalled glider can still dive out.
  const v = Math.max(speed, f.stallSpeed);
  return f.parasiticDrag * speed * speed + f.inducedDrag / (v * v);
}

/** Advances the glider by dt seconds. Returns true while boost thrust is being applied. */
export function stepFlight(s: FlightState, input: FlightInput, air: Air, dt: number): boolean {
  const f = config.flight;
  const b = config.boost;

  // 0 in normal flight, rising to 1 as speed falls from stall speed to zero.
  const stall = clamp(1 - s.speed / f.stallSpeed, 0, 1);

  s.yaw -= input.turn * f.turnRate * dt;
  s.pitch += input.pitch * f.pitchRate * (1 - 0.7 * stall) * dt - stall * f.stallNoseDrop * dt;
  s.pitch = clamp(s.pitch, -f.maxPitch, f.maxPitch);
  s.roll += (-input.turn * f.maxBank - s.roll) * Math.min(1, f.bankRate * dt);

  let drag = dragAt(s.speed) * (1 + f.turnDrag * input.turn * input.turn);
  if (input.brake) drag *= f.brakeDrag;

  let accel = -f.gravity * Math.sin(s.pitch) - drag;

  const boosting = input.boost && s.boost > 0;
  if (boosting) {
    accel += b.thrust;
    s.boost = Math.max(0, s.boost - dt / b.drainTime);
  }
  s.boost = Math.min(1, s.boost + (air.skim * dt) / b.skimChargeTime);

  s.speed = Math.max(f.minSpeed, s.speed + accel * dt);

  const cp = Math.cos(s.pitch);
  s.x -= Math.sin(s.yaw) * cp * s.speed * dt;
  s.z -= Math.cos(s.yaw) * cp * s.speed * dt;
  s.y += (Math.sin(s.pitch) * s.speed + air.lift - stall * f.stallSink) * dt;

  return boosting;
}

/** Height-plus-speed energy per unit mass. Used by tests and nothing else. */
export function energy(s: FlightState): number {
  return config.flight.gravity * s.y + (s.speed * s.speed) / 2;
}
