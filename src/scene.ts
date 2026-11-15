import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { config } from './config';
import { islands, pad, palette, placements, prims, rings, seeded, updrafts, type Prim } from './world';

// Everything you can see. Builds meshes from the level's primitives and models, and owns the
// renderer.
// The look is a storybook illustration: flat bands of light and shade, an ink line around
// every solid thing, heaped white clouds, and painted countryside far below.

// A summer afternoon: the sun high, ahead and to the left.
const SUN_DIRECTION = new THREE.Vector3(-0.6, 0.7, -0.4).normalize();
const SKY = { zenith: '#2a78dc', middle: '#69b4f4', horizon: '#dcefff', sun: '#fffbe6' };
const INK = '#5b3f4d';
const LEVEL_CENTRE = new THREE.Vector3(60, 60, -390);
const LAND_LEVEL = -420;
// The land is tinted towards the sky, as distant things are, so the islands stand out against it.
const LAND_HAZE = '#cfe2f2';

/** Repeatable 0 to 1 noise from a position, so vertices that share a corner move together. */
function noise(x: number, y: number, z: number) {
  const s = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// --- Paint and ink -----------------------------------------------------------------------------

// Light falls in three flat bands instead of a smooth gradient: shade, half-light and full sun.
// Shade starts exactly where a surface turns away from the sun, which is also where the shadow
// map takes over, so the two never disagree.
const ramp = new THREE.DataTexture(new Uint8Array([0, 0, 150, 255]), 4, 1, THREE.RedFormat);
ramp.needsUpdate = true;

const paintMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
const waterMaterial = new THREE.MeshToonMaterial({
  color: palette.water,
  emissive: palette.water,
  emissiveIntensity: 0.35,
  gradientMap: ramp,
  transparent: true,
  opacity: 0.75,
});

// The outline is a copy of each shape drawn inside out and slightly swollen, so only a rim of
// it shows around the silhouette. It swells with distance to stay about as thick on screen.
const inkMaterial = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
inkMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `float inkDepth = -(modelViewMatrix * vec4(position, 1.0)).z;
     vec3 transformed = position + normal * clamp(inkDepth, 4.0, 600.0) * 0.004;`,
  );
};

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

/** The painted surface of a primitive and its ink outline, both already in place in the world. */
function shape(prim: Prim) {
  const rocky = prim.color === palette.rock || prim.color === palette.cliff;
  const segments = (size: number) => (rocky ? Math.ceil(size / 13) : 1);
  let paint: THREE.BufferGeometry =
    prim.kind === 'box'
      ? new THREE.BoxGeometry(...prim.size, ...prim.size.map(segments))
      : prim.kind === 'cone'
        ? new THREE.CylinderGeometry(prim.rTop, prim.rBottom, prim.height, rocky ? prim.sides * 2 : prim.sides, rocky ? 4 : 1)
        : new THREE.SphereGeometry(prim.radius, prim.radius < 1 ? 6 : 14, prim.radius < 1 ? 4 : 10);
  if (rocky) roughen(paint, prim);
  paint = paint.toNonIndexed();
  paint.deleteAttribute('uv');
  // Rock and roofs keep hard facets; trunks, towers and treetops are left round.
  if (rocky || (prim.kind === 'cone' && prim.sides <= 6)) paint.computeVertexNormals();

  // Rock gets mottled faces and darker bands every few metres up. Everything else gets a
  // slight shade of its own, so no two trees or walls quite match, and is darker at the foot.
  const position = paint.attributes.position;
  const height = prim.kind === 'box' ? prim.size[1] : prim.kind === 'cone' ? prim.height : prim.radius * 2;
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(prim.color);
  const own = 0.95 + 0.1 * noise(...prim.pos);
  for (let i = 0; i < position.count; i += 3) {
    const y = prim.pos[1] + (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const speckle = noise(position.getX(i) + position.getX(i + 1), y, position.getZ(i) + position.getZ(i + 2));
    const face = (0.95 + 0.1 * speckle) * (Math.floor(y / 11 + speckle * 0.6) % 2 ? 0.9 : 1);
    for (let v = i; v < i + 3; v++) {
      const shade = rocky ? face : own * (0.86 + 0.18 * (position.getY(v) / height + 0.5));
      colors.set([base.r * shade, base.g * shade, base.b * shade], v * 3);
    }
  }
  paint.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // The outline swells along the "normal", so here that is the way out from the middle of the
  // shape. Vertices in the same place must agree on it or the outline tears at the corners.
  const away = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (prim.kind === 'box') {
      away.set([(2 * x) / prim.size[0], (2 * y) / prim.size[1], (2 * z) / prim.size[2]], i * 3);
    } else if (prim.kind === 'cone') {
      const r = Math.hypot(x, z) || 1;
      away.set([x / r, Math.abs(y) > prim.height / 2 - 0.01 ? Math.sign(y) : 0, z / r], i * 3);
    } else {
      away.set([x, y, z], i * 3);
    }
  }
  const ink = new THREE.BufferGeometry();
  ink.setAttribute('position', position.clone());
  ink.setAttribute('normal', new THREE.BufferAttribute(away, 3));

  const place = new THREE.Matrix4().makeRotationY(prim.rotY ?? 0).setPosition(...prim.pos);
  return { paint: paint.applyMatrix4(place), ink: ink.applyMatrix4(place) };
}

/** Merges a list of primitives into a few meshes, one per material. */
function build(list: Prim[]) {
  const paint: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const water: THREE.BufferGeometry[] = [];
  const ink: THREE.BufferGeometry[] = [];
  for (const prim of list) {
    const made = shape(prim);
    const lit = prim.color === palette.window || prim.color === palette.lamp;
    (lit ? glow : prim.solid === false && prim.color === palette.water ? water : paint).push(made.paint);
    // Only things you can hit are outlined, which also keeps flowers and window frames clean.
    if (prim.solid !== false) ink.push(made.ink);
  }
  const group = new THREE.Group();
  const add = (parts: THREE.BufferGeometry[], material: THREE.Material, shadows: boolean) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    mesh.castShadow = mesh.receiveShadow = shadows;
    group.add(mesh);
  };
  add(paint, paintMaterial, true);
  add(glow, glowMaterial, false);
  add(water, waterMaterial, false);
  add(ink, inkMaterial, false);
  return group;
}

// --- Imported models -----------------------------------------------------------------------------

const loader = new GLTFLoader();
const toon = (map: THREE.Texture | null) => new THREE.MeshToonMaterial({ map, gradientMap: ramp });

/** Every building and prop in the level, loaded and merged into one painted mesh and one ink mesh. */
async function buildModels() {
  let atlas: THREE.Texture | null = null;
  const templates = new Map<string, { paint: THREE.BufferGeometry; ink: THREE.BufferGeometry }>();
  await Promise.all(
    [...new Set(placements.map((p) => p.name))].map(async (name) => {
      const gltf = await loader.loadAsync(`models/${name}.gltf`);
      gltf.scene.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        // Every model in the pack is painted from the same small sheet of colours.
        atlas ??= child.material.map;
        parts.push(child.geometry.clone().applyMatrix4(child.matrixWorld).toNonIndexed());
      });
      const paint = mergeGeometries(parts);
      // The outline swells along normals shared between faces, so it does not split at corners.
      const ink = new THREE.BufferGeometry().setAttribute('position', paint.attributes.position);
      const welded = mergeVertices(ink);
      welded.computeVertexNormals();
      templates.set(name, { paint, ink: welded.toNonIndexed() });
    }),
  );

  const paint: THREE.BufferGeometry[] = [];
  const ink: THREE.BufferGeometry[] = [];
  const turn = new THREE.Quaternion();
  const place = new THREE.Matrix4();
  for (const { name, pos, rotY, scale } of placements) {
    place.compose(new THREE.Vector3(...pos), turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY), new THREE.Vector3(scale, scale, scale));
    const template = templates.get(name)!;
    paint.push(template.paint.clone().applyMatrix4(place));
    ink.push(template.ink.clone().applyMatrix4(place));
  }
  const painted = new THREE.Mesh(mergeGeometries(paint), toon(atlas));
  painted.castShadow = painted.receiveShadow = true;
  return new THREE.Group().add(painted, new THREE.Mesh(mergeGeometries(ink), inkMaterial));
}

/** The courier, sitting. Returns the model and a function that moves it to a moment in time. */
async function buildCourier() {
  const gltf = await loader.loadAsync('models/courier.glb');
  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = toon(child.material.map);
    child.castShadow = true;
    // The bones move the body outside the box three.js would cull it by.
    child.frustumCulled = false;
  });
  // The model faces +Z and the glider flies down -Z.
  gltf.scene.rotation.y = Math.PI;
  gltf.scene.scale.setScalar(0.8);
  gltf.scene.position.set(0, -0.72, 0.3);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations[0]).play();
  return { model: gltf.scene, animate: (time: number) => mixer.setTime(time) };
}

// --- Sky, clouds and the land below ------------------------------------------------------------

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
          vec3 color = mix(horizon, middle, smoothstep(0.0, 0.2, up));
          color = mix(color, zenith, smoothstep(0.12, 0.7, up));
          // A wide soft glow, then the disc itself.
          float towardsSun = max(dot(dir, sunDirection), 0.0);
          color += sunColor * 0.2 * pow(towardsSun, 6.0);
          color = mix(color, sunColor, smoothstep(0.9985, 0.9990, towardsSun));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
}

/** Countryside far below, painted once onto a canvas: meadows, fields, woods, a river, villages. */
function buildLand() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(23);
  const pick = (colors: string[]) => colors[Math.floor(random() * colors.length)];
  const blob = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  };
  /** A wandering line from one edge of the map to the other. */
  const wander = (width: number, color: string) => {
    let x = random() * size;
    let y = 0;
    let heading = Math.PI / 2 + (random() - 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < size) {
      heading += (random() - 0.5) * 0.5 + (Math.PI / 2 - heading) * 0.08;
      x += Math.cos(heading) * 30;
      y += Math.sin(heading) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  ctx.fillStyle = '#8fd06c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 320; i++) blob(random() * size, random() * size, 40 + random() * 110, pick(['#9bd874', '#7fc866', '#b2e07c', '#88cf70', '#a3db6e']));

  // Fields: tilted rectangles of crops, striped along the plough lines.
  for (let i = 0; i < 110; i++) {
    const w = 30 + random() * 70;
    const h = 20 + random() * 50;
    ctx.save();
    ctx.translate(random() * size, random() * size);
    ctx.rotate(random() * Math.PI);
    ctx.fillStyle = pick(['#eedd8c', '#d9e389', '#c5dc78', '#f3e6a4', '#e6c877']);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgb(255 255 255 / 22%)';
    for (let s = -h / 2 + 3; s < h / 2; s += 6) ctx.fillRect(-w / 2, s, w, 2);
    ctx.restore();
  }

  wander(16, '#8fd4f2');
  wander(7, '#8fd4f2');
  for (let i = 0; i < 5; i++) wander(2.5, '#f6ecd0');

  // Woods: clumps of round treetops.
  for (let i = 0; i < 90; i++) {
    const x = random() * size;
    const y = random() * size;
    const spread = 20 + random() * 70;
    for (let t = 0; t < spread; t++) {
      blob(x + (random() - 0.5) * spread * 2, y + (random() - 0.5) * spread * 1.4, 5 + random() * 8, pick(['#3f9470', '#4ba66c', '#58b46c', '#368a6c']));
    }
  }

  // Villages: a scatter of little roofs.
  for (let i = 0; i < 26; i++) {
    const x = random() * size;
    const y = random() * size;
    for (let h = 0; h < 14; h++) {
      ctx.save();
      ctx.translate(x + (random() - 0.5) * 70, y + (random() - 0.5) * 70);
      ctx.rotate(random() * Math.PI);
      ctx.fillStyle = '#fff3dc';
      ctx.fillRect(-4.5, -3.5, 9, 7);
      ctx.fillStyle = pick([palette.terracotta, palette.terracotta, palette.teal, palette.copper]);
      ctx.fillRect(-3.5, -2.5, 7, 5);
      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const land = new THREE.Mesh(new THREE.CircleGeometry(3000, 48), new THREE.MeshBasicMaterial({ map: texture, color: LAND_HAZE }));
  land.rotation.x = -Math.PI / 2;
  land.position.set(LEVEL_CENTRE.x, LAND_LEVEL, LEVEL_CENTRE.z);
  return land;
}

function buildClouds() {
  const random = seeded(11);
  const near: THREE.Matrix4[] = [];
  const far: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const puff = (list: THREE.Matrix4[], x: number, y: number, z: number, size: number, flat: number) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(size, size * flat, size);
    dummy.updateMatrix();
    list.push(dummy.matrix.clone());
  };
  /** One cloud: a big puff with smaller ones heaped round it, and smaller tiers stacked on top. */
  const heap = (list: THREE.Matrix4[], x: number, y: number, z: number, size: number, flat: number, tiers = 1) => {
    for (let t = 0; t < tiers; t++) {
      puff(list, x, y, z, size, flat);
      for (let i = 0; i < 6; i++) {
        const angle = random() * Math.PI * 2;
        const out = size * (0.6 + random() * 0.5);
        const s = size * (0.4 + random() * 0.3);
        puff(list, x + Math.cos(angle) * out, y - (size - s) * flat * (0.5 + random() * 0.5), z + Math.sin(angle) * out, s, flat);
      }
      x += (random() - 0.5) * size * 0.6;
      z += (random() - 0.5) * size * 0.6;
      y += size * flat * 0.75;
      size *= 0.68;
    }
  };

  // A broken layer of low cloud with the land showing through the gaps. The tops are at the
  // height where the game calls you lost.
  for (let i = 0; i < 85; i++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * 1700;
    const size = 40 + random() * 60;
    heap(near, LEVEL_CENTRE.x + Math.cos(angle) * reach, config.world.cloudLevel - size * 0.2, LEVEL_CENTRE.z + Math.sin(angle) * reach, size, 0.2);
  }

  // Each island rides on a wreath of cloud. You can fly through it, but there is rock inside.
  for (const { x, top, z, r } of islands) {
    for (let i = 0; i < r / 2.5; i++) {
      const angle = random() * Math.PI * 2;
      const s = r * (0.14 + random() * 0.12);
      const drop = s + random() * r * 0.45;
      // The rock narrows as it goes down, so the wreath closes in with it.
      const out = Math.max(0, r * 0.95 - drop * 0.7);
      puff(near, x + Math.cos(angle) * out, top - 4 - drop, z + Math.sin(angle) * out, s, 0.75);
    }
  }

  // A few small clouds drifting above the route.
  for (let i = 0; i < 9; i++) {
    const angle = random() * Math.PI * 2;
    const reach = 250 + random() * 600;
    heap(near, LEVEL_CENTRE.x + Math.cos(angle) * reach, 270 + random() * 160, LEVEL_CENTRE.z + Math.sin(angle) * reach, 22 + random() * 22, 0.6);
  }

  // Great towers of cumulus standing all round the horizon.
  for (let i = 0; i < 18; i++) {
    const angle = (i + random() * 0.7) * ((Math.PI * 2) / 18);
    const reach = 1400 + random() * 900;
    const size = 190 + random() * 200;
    heap(far, LEVEL_CENTRE.x + Math.cos(angle) * reach, -160 + random() * 200, LEVEL_CENTRE.z + Math.sin(angle) * reach, size, 0.7, 3);
  }

  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  for (const [list, fog] of [[near, true], [far, false]] as const) {
    // Emissive keeps the shaded side of a cloud a soft blue instead of grey.
    const material = new THREE.MeshToonMaterial({ color: '#ffffff', emissive: '#b4c6f5', emissiveIntensity: 0.55, gradientMap: ramp, fog });
    const mesh = new THREE.InstancedMesh(sphere, material, list.length);
    list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.receiveShadow = fog;
    group.add(mesh);
  }
  return group;
}

// --- Things that move or glow --------------------------------------------------------------------

function buildGlider() {
  // A paper dart with a seat. The nose points down -Z; a cream centre panel between two coral
  // ones, tips raised. The courier is added once loaded.
  const nose = [0, 0, -2.3];
  const tail = [0, 0.05, 0.9];
  const tip = (side: number) => [side * 2.7, 0.32, 1.5];
  const seam = (side: number) => [side * 1.05, 0.1, 1.2];
  const coral = [0.96, 0.33, 0.24];
  const cream = [1, 0.9, 0.72];

  const wing = new THREE.BufferGeometry();
  wing.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-1, 1].flatMap((side) => [...nose, ...tip(side), ...seam(side), ...nose, ...seam(side), ...tail]),
      3,
    ),
  );
  wing.setAttribute('color', new THREE.Float32BufferAttribute([0, 1].flatMap(() => [...coral, ...coral, ...coral, ...cream, ...cream, ...cream]), 3));
  wing.computeVertexNormals();
  const sail = new THREE.Mesh(wing, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp, side: THREE.DoubleSide }));
  sail.add(new THREE.LineSegments(new THREE.EdgesGeometry(wing, 1), new THREE.LineBasicMaterial({ color: INK })));
  sail.position.y = -0.55;

  // The frame, seat and parcel are primitives like the level, so they get the same paint and ink.
  const part = (w: number, h: number, d: number, x: number, y: number, z: number, color: string): Prim => ({
    kind: 'box',
    pos: [x, y, z],
    size: [w, h, d],
    color,
  });
  const glider = build([
    part(0.3, 0.16, 3.2, 0, -0.66, -0.5, '#b98a62'), // keel
    part(0.6, 0.3, 0.7, 0, -0.42, 0.32, '#4f6291'), // seat
    part(0.7, 0.5, 0.6, 0, -0.3, 1.2, '#c08a55'), // parcel, strapped on behind
    part(0.74, 0.1, 0.14, 0, -0.3, 1.2, '#f4ead8'), // parcel string
    part(0.14, 0.54, 0.64, 0, -0.3, 1.2, '#f4ead8'),
  ]);
  glider.add(sail);
  // Drawn larger than it collides, so the courier reads from the chase camera.
  glider.scale.setScalar(1.3);
  glider.traverse((child) => (child.castShadow = child instanceof THREE.Mesh && child.material !== inkMaterial));
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
  scene.fog = new THREE.Fog(SKY.horizon, 600, 2900);
  const camera = new THREE.PerspectiveCamera(config.camera.baseFov, 1, 0.5, 4000);

  // The sky light is what shade is painted with, so it is strong and blue.
  scene.add(new THREE.HemisphereLight('#dcecff', '#a9b6ec', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  sun.position.copy(LEVEL_CENTRE).addScaledVector(SUN_DIRECTION, 1000);
  sun.target.position.copy(LEVEL_CENTRE);
  // One shadow map covers the whole level, so islands shade each other and the clouds below.
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 1.2;
  sun.shadow.bias = -0.0003;
  Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 200, far: 1900 });
  scene.add(sun, sun.target);

  const sky = buildSky();
  const glider = buildGlider();
  const ringMeshes = buildRings();
  const updraftMotes = buildUpdrafts();
  let animateCourier = (_time: number) => {};
  scene.add(sky, buildLand(), buildClouds(), buildBeacon(), glider, updraftMotes.points, ...ringMeshes, build(prims.filter((p) => !p.hidden)));

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
    /** Settles once the models are in the scene. */
    loaded: Promise.all([
      buildModels().then((town) => scene.add(town)),
      buildCourier().then((courier) => {
        glider.add(courier.model);
        animateCourier = courier.animate;
      }),
    ]),
    /** Dims a ring once it has been flown through. */
    setRingHit(index: number, hit: boolean) {
      const ring = ringMeshes[index];
      (ring.material as THREE.MeshBasicMaterial).opacity = hit ? 0.18 : 1;
      ring.children[0].visible = !hit;
    },
    render(time: number) {
      updraftMotes.animate(time);
      animateCourier(time);
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
    },
  };
}
