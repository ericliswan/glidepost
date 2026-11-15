import { config } from './config';
import type { FlightInput } from './flight';

// Keyboard and mouse. Keys push the stick directly; the mouse moves an aim point that the
// glider then turns towards at its own rate, so a flick commits to a turn instead of snapping.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createInput(canvas: HTMLCanvasElement) {
  const keys = new Set<string>();
  const mouse = { boost: false, brake: false };
  // How far the aim point is from the nose, in radians.
  const aim = { turn: 0, pitch: 0 };
  // Smoothed keyboard stick, so taps are not a hard jerk.
  const stick = { turn: 0, pitch: 0 };
  let launchQueued = false;
  let restartQueued = false;

  const held = (...codes: string[]) => codes.some((code) => keys.has(code));

  addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') launchQueued = true;
    if (e.code === 'KeyR') restartQueued = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    mouse.boost = mouse.brake = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    if (e.button === 0) {
      mouse.boost = true;
      launchQueued = true;
    }
    if (e.button === 2) mouse.brake = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.boost = false;
    if (e.button === 2) mouse.brake = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    const { sensitivity, aimLimit } = config.mouse;
    aim.turn = clamp(aim.turn + e.movementX * sensitivity, -aimLimit, aimLimit);
    aim.pitch = clamp(aim.pitch - e.movementY * sensitivity, -aimLimit, aimLimit);
  });

  return {
    /** True once per launch press (Space or click). */
    takeLaunch() {
      const queued = launchQueued;
      launchQueued = false;
      return queued;
    },
    /** True once per restart press (R). */
    takeRestart() {
      const queued = restartQueued;
      restartQueued = false;
      return queued;
    },
    /** Forget any pending aim, so a new run starts flying straight. */
    centre() {
      aim.turn = aim.pitch = stick.turn = stick.pitch = 0;
    },
    /** The controls for the next dt seconds of flight. */
    read(dt: number): FlightInput {
      const { turnRate, pitchRate } = config.flight;
      const ease = Math.min(1, 12 * dt);
      const keyTurn = Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft'));
      const keyPitch = Number(held('KeyS', 'ArrowDown')) - Number(held('KeyW', 'ArrowUp'));
      stick.turn += (keyTurn - stick.turn) * ease;
      stick.pitch += (keyPitch - stick.pitch) * ease;

      // Steer towards the aim point, and move the aim point back by however far we just turned.
      const aimTurn = clamp(aim.turn / config.mouse.aimWindow, -1, 1);
      const aimPitch = clamp(aim.pitch / config.mouse.aimWindow, -1, 1);
      aim.turn -= aimTurn * turnRate * dt;
      aim.pitch -= aimPitch * pitchRate * dt;

      return {
        turn: clamp(stick.turn + aimTurn, -1, 1),
        pitch: clamp(stick.pitch + aimPitch, -1, 1),
        boost: mouse.boost || held('Space'),
        brake: mouse.brake || held('ShiftLeft', 'ShiftRight'),
      };
    },
  };
}
