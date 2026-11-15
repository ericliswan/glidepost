import * as THREE from 'three';
import { config } from './config';
import { pad, palette, prims, rings, updrafts, type Prim } from './world';

// Everything you can see. Builds meshes from the level's primitives and owns the renderer.

// Late afternoon: a low warm sun ahead and to the left, with cool lavender shade.
const SUN_DIRECTION = new THREE.Vector3(-0.75, 0.5, -0.4).normalize();
const SKY = { zenith: '#3f8fe0', middle: '#a5d3f5', horizon: '#ffd9c4', sun: '#fff1d0' };
const LEVEL_CENTRE = new THREE.Vector3(60, 60, -390);

/** Small seeded generator so the clouds are in the same place on every load. */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** Repeatable 0 to 1 noise from a position, so vertices that share a corner move together. */
function noise(x: number, y: number, z: number) {
  const s = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// --- Level geometry ----------------------------------------------------------------------------

const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const waterMaterial = new THREE.MeshLambertMaterial({
  color: palette.water,
  emissive: palette.water,
  emissiveIntensity: 0.35,
  transparent: true,
  opacity: 0.75,
});

/**
 * Chips the sides of a rock inwards so it reads as stone, not as a box. Vertices only ever move
 * in, and tops stay flat, so the collision shape is never smaller than what you see.
 */
function roughen(geometry: THREE.BufferGeometry, prim: Prim) {
  const position = geometry.attributes.position;
  const [px, py, pz] = prim.pos;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const chip = noise(x + px, y + py, z + pz);
    if (prim.kind === 'box') {
      const chipZ = noise(z + pz, y + py, x + px);
      if (Math.abs(Math.abs(x) - prim.size[0] / 2) < 0.01) position.setX(i, x - Math.sign(x) * chip * 1.6);
      if (Math.abs(Math.abs(z) - prim.size[2] / 2) < 0.01) position.setZ(i, z - Math.sign(z) * chipZ * 1.6);
    } else if (prim.kind === 'cone' && y < prim.height / 2 - 0.01) {
      position.setX(i, x * (1 - chip * 0.16));
      position.setZ(i, z * (1 - chip * 0.16));
    }
  }
}

function meshFor(prim: Prim) {
  const rocky = prim.color === palette.rock || prim.color === palette.cliff;
  const segments = (size: number) => (rocky ? Math.ceil(size / 13) : 1);
  let geometry: THREE.BufferGeometry =
    prim.kind === 'box'
      ? new THREE.BoxGeometry(...prim.size, ...prim.size.map(segments))
      : prim.kind === 'cone'
        ? new THREE.CylinderGeometry(prim.rTop, prim.rBottom, prim.height, rocky ? prim.sides * 2 : prim.sides, rocky ? 4 : 1)
        : new THREE.IcosahedronGeometry(prim.radius, 1);
  if (rocky) roughen(geometry, prim);
  if (geometry.index) geometry = geometry.toNonIndexed();

  // One colour per triangle. Rock gets mottled faces and darker bands every few metres up;
  // everything else gets a slight shade of its own so no two trees or walls quite match.
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(prim.color);
  const own = 0.95 + 0.1 * noise(...prim.pos);
  for (let i = 0; i < position.count; i += 3) {
    let shade = own;
    if (rocky) {
      const y = prim.pos[1] + (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
      const speckle = noise(position.getX(i) + position.getX(i + 1), y, position.getZ(i) + position.getZ(i + 2));
      shade = (0.88 + 0.2 * speckle) * (Math.floor(y / 11 + speckle * 0.6) % 2 ? 0.9 : 1);
    }
    for (let v = 0; v < 3; v++) colors.set([base.r * shade, base.g * shade, base.b * shade], (i + v) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const see = prim.solid === false;
  const mesh = new THREE.Mesh(geometry, see ? waterMaterial : solidMaterial);
  mesh.position.set(...prim.pos);
  mesh.rotation.y = prim.rotY ?? 0;
  mesh.castShadow = !see;
  mesh.receiveShadow = !see;
  return mesh;
}

// --- Sky and clouds ----------------------------------------------------------------------------

function buildSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color(SKY.zenith) },
        middle: { value: new THREE.Color(SKY.middle) },
        horizon: { value: new THREE.Color(SKY.horizon) },
        sunColor: { value: new THREE.Color(SKY.sun) },
        sunDirection: { value: SUN_DIRECTION },
      },
      vertexShader: `
        varying vec3 direction;
        void main() {
          direction = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 zenith;
        uniform vec3 middle;
        uniform vec3 horizon;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        varying vec3 direction;
        void main() {
          vec3 dir = normalize(direction);
          float up = max(dir.y, 0.0);
          vec3 color = mix(horizon, middle, smoothstep(0.0, 0.22, up));
          color = mix(color, zenith, smoothstep(0.15, 0.75, up));
          // A wide warm glow, a tighter halo, then the disc itself.
          float towardsSun = max(dot(dir, sunDirection), 0.0);
          color += sunColor * (0.22 * pow(towardsSun, 5.0) + 0.35 * pow(towardsSun, 80.0));
          color = mix(color, sunColor, smoothstep(0.9990, 0.9994, towardsSun));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
}

function buildClouds() {
  const group = new THREE.Group();
  // Emissive keeps the shaded side of a cloud a soft colour instead of grey: cool for the sea
  // below, and a warm pink for the undersides of the clouds above.
  const material = (color: string, emissive: string, emissiveIntensity: number) =>
    new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true });

  const sea = new THREE.Mesh(new THREE.CircleGeometry(3000, 48), material('#f3eef6', '#aab2e2', 0.42));
  sea.rotation.x = -Math.PI / 2;
  sea.receiveShadow = true;
  group.add(sea);

  const seaPuffs = 520;
  const skyClouds = 26;
  const puffsPerCloud = 5;
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const low = new THREE.InstancedMesh(puff, material('#ffffff', '#aab2e2', 0.42), seaPuffs);
  const high = new THREE.InstancedMesh(puff, material('#ffffff', '#f0c6c4', 0.55), skyClouds * puffsPerCloud);
  low.receiveShadow = true;
  const random = seeded(11);
  const dummy = new THREE.Object3D();
  const place = (puffs: THREE.InstancedMesh, index: number, x: number, y: number, z: number, w: number, h: number, d: number) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.y = random() * Math.PI;
    dummy.updateMatrix();
    puffs.setMatrixAt(index, dummy.matrix);
  };

  // The sea: low domes, thickest under the route. Their tops stay at about the height where
  // the game calls you lost, so what looks like cloud is cloud.
  for (let i = 0; i < seaPuffs; i++) {
    const angle = random() * Math.PI * 2;
    const reach = random() * 1500;
    const height = 7 + random() * 12;
    const width = 26 + random() * 50;
    place(low, i, Math.cos(angle) * reach, config.world.cloudLevel - height * 0.8 + random() * 2, -380 + Math.sin(angle) * reach, width, height, width * (0.6 + random() * 0.5));
  }

  // Clouds in the sky: a row of puffs each, biggest in the middle, high above or far off to the side.
  for (let i = 0; i < skyClouds; i++) {
    const far = i % 2 === 0;
    const angle = random() * Math.PI * 2;
    const reach = far ? 1100 + random() * 900 : 300 + random() * 700;
    const x = Math.cos(angle) * reach;
    const y = far ? 120 + random() * 320 : 300 + random() * 160;
    const z = -380 + Math.sin(angle) * reach;
    const size = (far ? 60 : 34) * (0.7 + random() * 0.8);
    const turn = random() * Math.PI;
    for (let p = 0; p < puffsPerCloud; p++) {
      const along = (p - (puffsPerCloud - 1) / 2) * size * 0.75;
      const s = size * (1 - Math.abs(p - 2) * 0.24) * (0.85 + random() * 0.3);
      place(high, i * puffsPerCloud + p, x + Math.cos(turn) * along, y + s * 0.3, z + Math.sin(turn) * along, s, s * 0.6, s * 0.9);
    }
  }
  group.add(low, high);
  return group;
}

// --- Things that move or glow --------------------------------------------------------------------

function buildGlider() {
  const glider = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

  // The nose points down -Z. A cream centre panel between two coral ones, tips raised.
  const nose = [0, 0, -1.8];
  const tail = [0, 0.05, 0.45];
  const tip = (side: number) => [side * 2.7, 0.32, 1.15];
  const seam = (side: number) => [side * 1.05, 0.1, 0.8];
  const coral = [0.96, 0.33, 0.24];
  const cream = [1, 0.9, 0.72];
  const wing = new THREE.BufferGeometry();
  wing.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, 1].flatMap((side) => [...nose, ...tip(side), ...seam(side), ...nose, ...seam(side), ...tail]), 3),
  );
  wing.setAttribute('color', new THREE.Float32BufferAttribute([0, 1].flatMap(() => [...coral, ...coral, ...coral, ...cream, ...cream, ...cream]), 3));
  glider.add(new THREE.Mesh(wing, material));

  const part = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
    const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const c = new THREE.Color(color);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 36 }, () => [c.r, c.g, c.b]).flat(), 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    glider.add(mesh);
  };
  part(0.14, 0.14, 2.4, 0, -0.06, -0.5, '#b98a62'); // keel
  part(4.2, 0.1, 0.1, 0, 0.12, 0.55, '#b98a62'); // cross bar
  part(0.4, 0.42, 1.0, 0, -0.55, 0.25, '#4f6291'); // pilot
  part(0.34, 0.34, 0.34, 0, -0.45, -0.45, '#f6d2b0'); // head
  part(0.38, 0.14, 0.38, 0, -0.24, -0.45, '#7a5a48'); // cap
  part(0.12, 0.06, 1.2, 0.12, -0.34, 0.5, '#e5445a'); // scarf
  part(0.6, 0.45, 0.6, 0, -1.0, 0.2, '#c08a55'); // parcel
  part(0.64, 0.1, 0.14, 0, -1.0, 0.2, '#f4ead8'); // parcel string
  glider.traverse((child) => (child.castShadow = true));
  return glider;
}

function buildRings() {
  const glow = new THREE.MeshBasicMaterial({
    color: '#ffd76a',
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  return rings.map((ring) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(config.rings.radius, 0.5, 8, 32),
      new THREE.MeshBasicMaterial({ color: '#ffc23d', transparent: true, fog: false }),
    );
    mesh.add(new THREE.Mesh(new THREE.CircleGeometry(config.rings.radius, 32), glow));
    mesh.position.set(...ring.pos);
    mesh.lookAt(ring.pos[0] + ring.normal[0], ring.pos[1] + ring.normal[1], ring.pos[2] + ring.normal[2]);
    return mesh;
  });
}

/** A soft round dot, so particles are not squares. */
function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  fade.addColorStop(0, 'rgb(255 255 255 / 100%)');
  fade.addColorStop(0.4, 'rgb(255 255 255 / 70%)');
  fade.addColorStop(1, 'rgb(255 255 255 / 0%)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

/** Motes spiralling up each updraft so the lift is visible. Returns the points and their animator. */
function buildUpdrafts() {
  const perColumn = 140;
  const random = seeded(5);
  const motes = updrafts.flatMap((u) =>
    Array.from({ length: perColumn }, () => ({ u, angle: random() * Math.PI * 2, reach: Math.sqrt(random()) * 0.8, phase: random() })),
  );
  const positions = new Float32Array(motes.length * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#fff3cf', map: dotTexture(), size: 3.2, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),
  );
  points.frustumCulled = false;

  const animate = (time: number) => {
    motes.forEach((m, i) => {
      const rise = (m.phase + (time * m.u.strength) / (m.u.top - m.u.base)) % 1;
      const angle = m.angle + time * 0.5 + rise * 3;
      positions[i * 3] = m.u.x + Math.cos(angle) * m.reach * m.u.radius;
      positions[i * 3 + 1] = m.u.base + rise * (m.u.top - m.u.base);
      positions[i * 3 + 2] = m.u.z + Math.sin(angle) * m.reach * m.u.radius;
    });
    geometry.attributes.position.needsUpdate = true;
  };
  return { points, animate };
}

/** A shaft of light over the landing pad, visible from the launch deck. */
function buildBeacon() {
  const height = 300;
  // Fades out towards the top so it reads as light, not as a pole.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createLinearGradient(0, 64, 0, 0);
  fade.addColorStop(0, 'rgb(255 205 100 / 75%)');
  fade.addColorStop(0.3, 'rgb(255 215 130 / 45%)');
  fade.addColorStop(1, 'rgb(255 225 160 / 0%)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1, 64);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 3.5, height, 20, 1, true),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beacon.position.set(pad.x, pad.y + height / 2, pad.z);
  return beacon;
}

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon, 500, 2600);
  const camera = new THREE.PerspectiveCamera(config.camera.baseFov, 1, 0.5, 4000);

  scene.add(new THREE.HemisphereLight('#d6e9ff', '#c3a6e6', 1.5));
  const sun = new THREE.DirectionalLight('#ffdcae', 2.6);
  sun.position.copy(LEVEL_CENTRE).addScaledVector(SUN_DIRECTION, 1000);
  sun.target.position.copy(LEVEL_CENTRE);
  // One shadow map covers the whole level, so islands shade each other and the clouds below.
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 0.5;
  Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 200, far: 1900 });
  scene.add(sun, sun.target);

  const sky = buildSky();
  const glider = buildGlider();
  const ringMeshes = buildRings();
  const updraftMotes = buildUpdrafts();
  scene.add(sky, buildClouds(), buildBeacon(), glider, updraftMotes.points, ...ringMeshes, ...prims.map(meshFor));

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  return {
    camera,
    glider,
    /** Dims a ring once it has been flown through. */
    setRingHit(index: number, hit: boolean) {
      const ring = ringMeshes[index];
      (ring.material as THREE.MeshBasicMaterial).opacity = hit ? 0.18 : 1;
      ring.children[0].visible = !hit;
    },
    render(time: number) {
      updraftMotes.animate(time);
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
    },
  };
}
