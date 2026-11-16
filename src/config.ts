// Every tuning value in the game. Units are metres, seconds and radians.

export const config = {
  flight: {
    // Stronger than real gravity so dives and climbs pay off quickly.
    gravity: 20,
    // Drag deceleration is  parasitic * v²  +  induced / v².
    // The two are equal at the best-glide speed (~22 m/s), where the glide ratio is ~10:1.
    // Flying slower or faster than that costs range.
    parasiticDrag: 0.00207,
    inducedDrag: 484,
    // Extra drag at full turn input, as a fraction of total drag.
    turnDrag: 1,
    // Drag multiplier while the airbrake is held.
    brakeDrag: 5,

    pitchRate: 1.7,
    turnRate: 1.5,
    maxPitch: 1.4,
    maxBank: 0.9,
    bankRate: 6,

    // Below this speed the wing stops flying: the nose drops and the glider sinks.
    stallSpeed: 11,
    stallNoseDrop: 2.4,
    stallSink: 10,
    minSpeed: 3,

    launchSpeed: 24,
    launchPitch: -0.12,
  },

  boost: {
    thrust: 30,
    // Seconds of thrust in a full meter.
    drainTime: 2.5,
    // Skimming charges when a surface is closer than this.
    skimRange: 7,
    // Seconds to fill the meter at the closest, fastest skim.
    skimChargeTime: 3.5,
    // Skimming at or above this speed charges at the full rate.
    skimFullSpeed: 30,
  },

  rings: {
    radius: 7,
    kick: 6,
    // Hit the next ring within this many seconds to extend the chain.
    chainWindow: 4.5,
    // Each link adds this much to the kick multiplier, up to the cap.
    chainStep: 0.2,
    maxMultiplier: 2,
  },

  landing: {
    maxSpeed: 20,
    perfectSpeed: 14,
  },

  glider: {
    // Collision radius.
    radius: 0.9,
  },

  camera: {
    distance: 10,
    height: 3,
    lookAhead: 12,
    // How quickly the camera catches up with the glider (higher is tighter).
    stiffness: 7,
    baseFov: 62,
    maxFov: 92,
    // Speed range over which the field of view widens.
    fovMinSpeed: 18,
    fovMaxSpeed: 65,
    boostShake: 0.12,
  },

  mouse: {
    // Radians of aim per pixel of mouse movement.
    sensitivity: 0.0022,
    // The glider turns at full rate when the aim point is at least this far off the nose.
    aimWindow: 0.25,
    // The aim point never gets further ahead of the nose than this.
    aimLimit: 0.7,
  },

  secrets: {
    // How close the glider must pass to pick up a lost letter, in metres.
    letterReach: 5,
    // How close to the tip of a steeple rings its bell.
    bellReach: 9,
  },

  world: {
    // Dropping below this height, under the clouds, means you are lost.
    cloudLevel: 6,
    // Seconds between a crash and being back on the launch deck.
    respawnDelay: 0.9,
  },
};

export type Config = typeof config;
