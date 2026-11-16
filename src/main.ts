import * as THREE from 'three';
import { createAudio } from './audio';
import { config } from './config';
import { createDialogue } from './dialogue';
import { createGame, launch, reset, step, type GameEvent } from './game';
import { createHud } from './hud';
import { createInput } from './input';
import { levels, loadLevel, type Level } from './levels';
import { bestTime, forget, foundLetters, saveBest, saveLetters } from './save';
import { createScene } from './scene';
import { createShell } from './shell';

// Wires the rules to the screen, speakers and controls, and runs the frame loop.

const MAX_STEP = 1 / 120;
const ready = () => `${level.name}\nSpace or click to launch`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const game = createGame();
const scene = createScene(canvas);
const input = createInput(canvas);
const audio = createAudio();
const hud = createHud();
const dialogue = createDialogue(audio.talk);
let level = levels[0];
// True while a route is being built: the frame loop draws, but nothing can be flown.
let loading = true;
// Whether the mouse was captured when the clock was stopped, and when that was.
let wasLocked = false;
let pausedAt = 0;
const briefed = new Set<Level>();
let best: number | null = null;
// A line shown for a few seconds in flight, and the time on the clock when it goes away.
let notice = '';
let noticeUntil = 0;

// Browsers only allow sound once the player has pressed something.
addEventListener('keydown', () => audio.start());
addEventListener('pointerdown', () => audio.start());

// Open the console and try `game.glider.y = 400`.
Object.assign(window, { game });

const forward = new THREE.Vector3();
const target = new THREE.Vector3();
const eye = new THREE.Vector3();
const scratch = new THREE.Vector3();
let snapCamera = true;

function updateCamera(dt: number) {
  const g = game.glider;
  const c = config.camera;
  const camera = scene.camera;
  const level = Math.cos(g.pitch);
  forward.set(-Math.sin(g.yaw) * level, Math.sin(g.pitch), -Math.cos(g.yaw) * level);

  // The camera trails behind, so it drops further back the faster you go.
  target.set(g.x, g.y + c.height, g.z).addScaledVector(forward, -c.distance);
  eye.lerp(target, snapCamera ? 1 : 1 - Math.exp(-c.stiffness * dt));
  snapCamera = false;

  camera.position.copy(eye);
  if (game.boosting) camera.position.add(scratch.randomDirection().multiplyScalar(c.boostShake));
  camera.lookAt(scratch.set(g.x, g.y, g.z).addScaledVector(forward, c.lookAhead));

  const fast = THREE.MathUtils.clamp((g.speed - c.fovMinSpeed) / (c.fovMaxSpeed - c.fovMinSpeed), 0, 1);
  camera.fov += (c.baseFov + (c.maxFov - c.baseFov) * fast - camera.fov) * Math.min(1, 4 * dt);
  camera.updateProjectionMatrix();
}

/** At the front desk the camera hangs back off one wing and drifts, with nobody flying. */
function deskCamera(time: number) {
  const g = game.glider;
  const c = config.camera;
  const angle = g.yaw + 0.55 + Math.sin(time * 0.12) * 0.22;
  eye.set(g.x + Math.sin(angle) * c.distance * 2.2, g.y + c.height * 2.2, g.z + Math.cos(angle) * c.distance * 2.2);
  scene.camera.position.copy(eye);
  scene.camera.lookAt(g.x, g.y + c.height, g.z);
  scene.camera.fov = c.baseFov;
  scene.camera.updateProjectionMatrix();
}

/** Called whenever the glider is put back on the launch deck. */
function onDeck() {
  input.centre();
  snapCamera = true;
  // The postmaster explains each job once. After that, a retry is instant.
  hud.message(briefed.has(level) ? ready() : '');
  if (!briefed.has(level)) dialogue.play(level.briefing, () => hud.message(ready()));
  briefed.add(level);
}

/** Builds a route in place of the one that was there, and puts the glider on its launch deck. */
async function choose(next: Level) {
  setLoading(true);
  level = next;
  dialogue.close();
  hud.message('Loading…');
  loadLevel(level);
  reset(game);
  // Letters stay found, and each route remembers which.
  game.found = foundLetters(level.id);
  best = bestTime(level.id);
  hud.destination(level.destination);
  try {
    await scene.setLevel(level);
  } catch {
    // Off the front desk, where the message would be hidden.
    shell.show(null);
    return hud.message('Could not load the models. Try reloading.');
  }
  // Forget any key pressed while loading, so the flight does not start by itself.
  input.takeLaunch();
  setLoading(false);
  // At the front desk the briefing waits until this route is picked.
  if (!shell.open) onDeck();
}

function setLoading(to: boolean) {
  loading = to;
  document.body.classList.toggle('loading', to);
}

/** Puts the glider back on the launch deck of the route already built. */
function toDeck() {
  shell.show(null);
  dialogue.close();
  reset(game);
  onDeck();
}

function pause(locked = document.pointerLockElement === canvas) {
  if (loading || shell.open) return;
  wasLocked = locked;
  pausedAt = performance.now();
  shell.show('paused');
}

function resume() {
  shell.show(null);
  // Browsers refuse the mouse for a moment after Esc gave it up. Then the next click takes it.
  if (wasLocked) Promise.resolve(canvas.requestPointerLock()).catch(() => {});
}

const shell = createShell({
  route(next) {
    if (loading) return;
    if (next === level) return toDeck();
    shell.show(null);
    choose(next);
  },
  resume,
  restart: toDeck,
  desk() {
    dialogue.close();
    reset(game);
    shell.refresh();
    shell.show('desk');
  },
  settings(settings) {
    audio.volume(settings.volume);
    input.options.sensitivity = settings.sensitivity;
    input.options.invert = settings.invert;
  },
  forget() {
    forget();
    best = null;
    game.found.fill(false);
    shell.refresh();
  },
});

addEventListener('keydown', (event) => {
  if (event.code !== 'Escape') return;
  const menu = shell.open;
  if (menu === 'settings') shell.closeSettings();
  // Letting go of the mouse with Esc stops the clock too, and must not start it again in the same press.
  else if (menu === 'paused' && performance.now() - pausedAt > 300) resume();
  else if (!menu) pause();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) pause(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'flying') pause();
});

const carried = () => game.found.filter(Boolean).length;

function handle(event: GameEvent) {
  if (event.type === 'ring') {
    audio.ring(event.chain);
  } else if (event.type === 'bell') {
    audio.bell();
  } else if (event.type === 'letter') {
    audio.letter();
    saveLetters(level.id, game.found);
    notice = `Lost letter found · ${carried()} of ${game.found.length}`;
    noticeUntil = performance.now() + 3000;
  } else if (event.type === 'landed') {
    const newBest = !best || game.time < best;
    if (newBest) saveBest(level.id, (best = game.time));
    audio.land(event.perfect);
    hud.message('');
    const rows: [string, string][] = [
      ['Route', level.name],
      ['Time', `${game.time.toFixed(2)} s`],
      ['Best', newBest ? 'A new best' : `${best!.toFixed(2)} s`],
      ['Landing', event.perfect ? 'Soft as a feather' : 'With a bump'],
      ['Lost letters', `${carried()} of ${game.found.length}`],
    ];
    dialogue.play(level.thanks(game.time, event.perfect, carried()), () => shell.receipt(rows));
  } else if (event.type === 'crashed') {
    audio.crash();
    hud.message(
      event.reason === 'clouds'
        ? 'Too low! Lost beneath the clouds'
        : event.reason === 'hardLanding'
          ? `Too fast! Land under ${Math.round(config.landing.maxSpeed * 3.6)} km/h`
          : 'Bumped!',
    );
  } else {
    onDeck();
  }
}

let last = performance.now();

function frame(now: number) {
  // A background tab can pause for seconds; never simulate more than a tenth of one.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // While someone is talking, Space and click turn the page and R cuts them short.
  const menu = shell.open;
  const wantsLaunch = input.takeLaunch() && !loading && !menu;
  const wantsRestart = input.takeRestart() && !loading && (!menu || menu === 'result');
  if (wantsRestart) {
    toDeck();
  } else if (dialogue.active) {
    if (wantsLaunch) dialogue.advance();
  } else if (wantsLaunch && game.phase === 'ready') {
    input.centre();
    launch(game);
  }

  // Nothing moves behind a menu. Small steps keep fast flight from tunnelling through rings and walls.
  const steps = menu ? 0 : Math.ceil(dt / MAX_STEP);
  for (let i = 0; i < steps; i++) {
    const event = step(game, input.read(dt / steps), dt / steps);
    if (event) handle(event);
  }

  const g = game.glider;
  if (game.phase === 'flying') {
    hud.message(g.speed < config.flight.stallSpeed * 1.15 ? 'Stalling! Dive to pick up speed' : now < noticeUntil ? notice : '');
  }
  hud.update(game, best);
  if (!menu) dialogue.update(dt);

  scene.glider.position.set(g.x, g.y, g.z);
  scene.glider.rotation.set(g.pitch, g.yaw, g.roll, 'YXZ');
  scene.glider.visible = game.phase !== 'crashed';
  game.ringsHit.forEach((hit, i) => scene.setRingHit(i, hit));
  game.found.forEach((found, i) => scene.setLetterFound(i, found));
  if (shell.atDesk) deskCamera(now / 1000);
  else if (!menu) updateCamera(dt);
  audio.wind(game.phase === 'flying' && !menu ? g.speed : 0, game.boosting && !menu);
  scene.render(now / 1000);

  requestAnimationFrame(frame);
}

Promise.all([scene.loaded, choose(level)]).then(() => {
  last = performance.now();
  requestAnimationFrame(frame);
});
