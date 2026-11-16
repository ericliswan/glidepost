import * as THREE from 'three';
import { createAudio } from './audio';
import { config } from './config';
import { createDialogue } from './dialogue';
import { createGame, launch, reset, step, type GameEvent } from './game';
import { createHud } from './hud';
import { createInput } from './input';
import { levels, loadLevel, type Level } from './levels';
import { createScene } from './scene';
import { letters } from './world';

// Wires the rules to the screen, speakers and controls, and runs the frame loop.

const BEST_KEY = 'glidepost.best';
const LETTERS_KEY = 'glidepost.letters';
const MAX_STEP = 1 / 120;
const ready = () => `<strong>${level.name}</strong>${level.blurb}
W / S dive and pull up · A / D turn
Space boost · Shift airbrake
Press Space or click to launch · ${levels.map((_, i) => i + 1).join(' / ')} to change route`;

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
  loading = true;
  level = next;
  dialogue.close();
  hud.message('Loading…');
  loadLevel(level);
  reset(game);
  // Letters stay found: each route remembers which, as a row of 1s and 0s.
  const kept = localStorage.getItem(`${LETTERS_KEY}.${level.id}`) ?? '';
  game.found = letters.map((_, i) => kept[i] === '1');
  // Times from before there was more than one route belong to the first.
  best = Number(localStorage.getItem(`${BEST_KEY}.${level.id}`) ?? (level === levels[0] ? localStorage.getItem(BEST_KEY) : null)) || null;
  hud.destination(level.destination);
  try {
    await scene.setLevel(level);
  } catch {
    return hud.message('Could not load the models. Try reloading.');
  }
  // Forget any key pressed while loading, so the flight does not start by itself.
  input.takeLaunch();
  loading = false;
  onDeck();
}

// shortcut: routes are picked with the number keys, until there is a proper menu to pick them from.
addEventListener('keydown', (event) => {
  const picked = levels[Number(event.code.replace('Digit', '')) - 1];
  if (picked && picked !== level && !loading && (game.phase === 'ready' || game.phase === 'landed')) choose(picked);
});

const carried = () => game.found.filter(Boolean).length;

function handle(event: GameEvent) {
  if (event.type === 'ring') {
    audio.ring(event.chain);
  } else if (event.type === 'bell') {
    audio.bell();
  } else if (event.type === 'letter') {
    audio.letter();
    localStorage.setItem(`${LETTERS_KEY}.${level.id}`, game.found.map(Number).join(''));
    notice = `Lost letter found · ${carried()} of ${letters.length}`;
    noticeUntil = performance.now() + 3000;
  } else if (event.type === 'landed') {
    const newBest = !best || game.time < best;
    if (newBest) {
      best = game.time;
      localStorage.setItem(`${BEST_KEY}.${level.id}`, String(best));
    }
    audio.land(event.perfect);
    const notes = [`${game.time.toFixed(2)} s`, event.perfect && 'Perfect landing', newBest && 'New best!', `Lost letters ${carried()} of ${letters.length}`];
    const result = `<strong>Delivered!</strong>${notes.filter(Boolean).join(' · ')}\nPress R to fly again`;
    hud.message('');
    dialogue.play(level.thanks(game.time, event.perfect, carried()), () => hud.message(result));
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
  const wantsLaunch = input.takeLaunch() && !loading;
  const wantsRestart = input.takeRestart() && !loading;
  const talking = dialogue.active;
  if (wantsRestart || (wantsLaunch && !talking && game.phase === 'landed')) {
    dialogue.close();
    reset(game);
    onDeck();
  } else if (talking) {
    if (wantsLaunch) dialogue.advance();
  } else if (wantsLaunch && game.phase === 'ready') {
    input.centre();
    launch(game);
  }

  // Small steps keep fast flight from tunnelling through rings and walls.
  const steps = Math.ceil(dt / MAX_STEP);
  for (let i = 0; i < steps; i++) {
    const event = step(game, input.read(dt / steps), dt / steps);
    if (event) handle(event);
  }

  const g = game.glider;
  if (game.phase === 'flying') {
    hud.message(g.speed < config.flight.stallSpeed * 1.15 ? 'Stalling! Dive to pick up speed' : now < noticeUntil ? notice : '');
  }
  hud.update(game, best);
  dialogue.update(dt);

  scene.glider.position.set(g.x, g.y, g.z);
  scene.glider.rotation.set(g.pitch, g.yaw, g.roll, 'YXZ');
  scene.glider.visible = game.phase !== 'crashed';
  game.ringsHit.forEach((hit, i) => scene.setRingHit(i, hit));
  game.found.forEach((found, i) => scene.setLetterFound(i, found));
  updateCamera(dt);
  audio.wind(game.phase === 'flying' ? g.speed : 0, game.boosting);
  scene.render(now / 1000);

  requestAnimationFrame(frame);
}

Promise.all([scene.loaded, choose(level)]).then(() => {
  last = performance.now();
  requestAnimationFrame(frame);
});
