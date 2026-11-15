import { describe, expect, it } from 'vitest';
import { config } from './config';
import { energy, stepFlight, type Air, type FlightInput, type FlightState } from './flight';

const DT = 1 / 120;
const STILL: Air = { lift: 0, skim: 0 };

const glider = (over: Partial<FlightState> = {}): FlightState => ({
  x: 0, y: 500, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 22, boost: 0, ...over,
});

const hands = (over: Partial<FlightInput> = {}): FlightInput => ({
  pitch: 0, turn: 0, boost: false, brake: false, ...over,
});

function fly(s: FlightState, seconds: number, input: FlightInput, air: Air = STILL) {
  for (let t = 0; t < seconds; t += DT) stepFlight(s, input, air, DT);
  return s;
}

/** Distance covered per metre dropped, holding a fixed pitch, measured after settling. */
function glideRatio(pitch: number) {
  const s = glider({ pitch, y: 5000 });
  fly(s, 40, hands());
  const from = { ...s };
  fly(s, 20, hands());
  return { ratio: Math.hypot(s.x - from.x, s.z - from.z) / (from.y - s.y), speed: s.speed };
}

describe('flight model', () => {
  it('flies along the nose: yaw 0 heads towards -Z', () => {
    const s = fly(glider(), 1, hands());
    expect(s.z).toBeLessThan(-15);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
  });

  it('turns right with positive turn input', () => {
    const s = fly(glider(), 1, hands({ turn: 1 }));
    expect(s.x).toBeGreaterThan(1);
    expect(s.roll).toBeLessThan(0);
  });

  it('trades height for speed in a dive', () => {
    const s = fly(glider({ pitch: -0.8 }), 2, hands());
    expect(s.speed).toBeGreaterThan(40);
    expect(s.y).toBeLessThan(460);
  });

  it('trades speed back for height in a pull-up', () => {
    const s = glider({ speed: 55 });
    while (s.speed > 22) stepFlight(s, hands({ pitch: s.pitch < 0.9 ? 1 : 0 }), STILL, DT);
    // A lossless climb from 55 to 22 m/s would gain ~63 m.
    expect(s.y - 500).toBeGreaterThan(40);
  });

  it('never gains energy without lift or boost', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const s = glider();
    let input = hands();
    let before = energy(s);
    for (let i = 0; i < 120 * 60; i++) {
      if (i % 30 === 0) input = hands({ pitch: random(), turn: random(), brake: random() > 0.7 });
      stepFlight(s, input, STILL, DT);
      const now = energy(s);
      expect(now).toBeLessThanOrEqual(before + 1e-6);
      before = now;
    }
  });

  it('has a best glide of about 10:1 near 22 m/s, and no better glide anywhere else', () => {
    const glides = [];
    for (let deg = 2; deg <= 30; deg += 1) glides.push(glideRatio((-deg * Math.PI) / 180));
    const best = glides.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    expect(best.ratio).toBeGreaterThan(9);
    expect(best.ratio).toBeLessThan(10.5);
    expect(best.speed).toBeGreaterThan(18);
    expect(best.speed).toBeLessThan(27);
  });

  it('stalls instead of hovering when the nose is held up', () => {
    const s = fly(glider(), 15, hands({ pitch: 1 }));
    expect(s.y).toBeLessThan(500);
  });

  it('sheds speed with the airbrake', () => {
    const free = fly(glider({ speed: 40 }), 1, hands());
    const braked = fly(glider({ speed: 40 }), 1, hands({ brake: true }));
    expect(braked.speed).toBeLessThan(free.speed - 8);
  });

  it('rises in an updraft', () => {
    const s = fly(glider(), 3, hands(), { lift: 15, skim: 0 });
    expect(s.y).toBeGreaterThan(520);
  });

  it('charges boost by skimming and spends it as thrust', () => {
    const s = glider();
    fly(s, config.boost.skimChargeTime + 0.1, hands(), { lift: 0, skim: 1 });
    expect(s.boost).toBe(1);

    const coasting = fly(glider({ speed: 30 }), 1, hands());
    s.speed = 30;
    fly(s, 1, hands({ boost: true }));
    expect(s.speed).toBeGreaterThan(coasting.speed + 15);
    expect(s.boost).toBeLessThan(0.7);

    fly(s, config.boost.drainTime, hands({ boost: true }));
    expect(s.boost).toBe(0);
  });
});
