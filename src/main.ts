import * as THREE from 'three';
import { createAudio } from './audio';
import { config } from './config';
import { createDialogue } from './dialogue';
import { createGame, launch, reset, step, type GameEvent } from './game';
import { createHud } from './hud';
import { createInput } from './input';
import { createScene } from './scene';
import { briefing, thanks } from './story';

// Wires the rules to the screen, speakers and controls, and runs the frame loop.

const BEST_KEY = 'glidepost.best';
const MAX_STEP = 1 / 120;
const READY = `<strong>Glidepost</strong>A parcel for the lighthouse keeper.
W / S dive and pull up · A / D turn
Space boost · Shift airbrake
Press Space or click to launch`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const game = createGame();
const scene = createScene(canvas);
const input = createInput(canvas);
const audio = createAudio();
const hud = createHud();
const dialogue = createDialogue(audio.talk);
let briefed = false;
let best = Number(localStorage.getItem(BEST_KEY)) || null;

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
  // The postmaster explains the job once. After that, a retry is instant.
  hud.message(briefed ? READY : '');
  if (!briefed) dialogue.play(briefing, () => hud.message(READY));
  briefed = true;
}

function handle(event: GameEvent) {
  if (event.type === 'ring') {
    audio.ring(event.chain);
  } else if (event.type === 'landed') {
    const newBest = !best || game.time < best;
    if (newBest) {
      best = game.time;
      localStorage.setItem(BEST_KEY, String(best));
    }
    audio.land(event.perfect);
    const notes = [`${game.time.toFixed(2)} s`, event.perfect && 'Perfect landing', newBest && 'New best!'];
    const result = `<strong>Delivered!</strong>${notes.filter(Boolean).join(' · ')}\nPress R to fly again`;
    hud.message('');
    dialogue.play(thanks(game.time, event.perfect), () => hud.message(result));
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
  const wantsLaunch = input.takeLaunch();
  const talking = dialogue.active;
  if (input.takeRestart() || (wantsLaunch && !talking && game.phase === 'landed')) {
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
    hud.message(g.speed < config.flight.stallSpeed * 1.15 ? 'Stalling! Dive to pick up speed' : '');
  }
  hud.update(game, best);
  dialogue.update(dt);

  scene.glider.position.set(g.x, g.y, g.z);
  scene.glider.rotation.set(g.pitch, g.yaw, g.roll, 'YXZ');
  scene.glider.visible = game.phase !== 'crashed';
  game.ringsHit.forEach((hit, i) => scene.setRingHit(i, hit));
  updateCamera(dt);
  audio.wind(game.phase === 'flying' ? g.speed : 0, game.boosting);
  scene.render(now / 1000);

  requestAnimationFrame(frame);
}

hud.message('Loading…');
scene.loaded.then(
  () => {
    // Forget any key pressed while loading, so the flight does not start by itself.
    input.takeLaunch();
    last = performance.now();
    onDeck();
    requestAnimationFrame(frame);
  },
  () => hud.message('Could not load the models. Try reloading.'),
);
