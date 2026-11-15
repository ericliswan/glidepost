import * as THREE from 'three';
import { config } from './config';
import { pad, prims, rings, updrafts, type Prim } from './world';

// Everything you can see. Builds meshes from the level's primitives and owns the renderer.

const SKY_TOP = '#86bfe8';
const HORIZON = '#fde3cc';
const CLOUD = '#fffaf3';

/** Small seeded generator so the clouds are in the same place on every load. */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const materials = new Map<string, THREE.Material>();
function materialFor(prim: Prim) {
  const see = prim.solid === false;
  const key = prim.color + see;
  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshLambertMaterial({ color: prim.color, flatShading: true, transparent: see, opacity: see ? 0.7 : 1 }),
    );
  }
  return materials.get(key)!;
}

function meshFor(prim: Prim) {
  const geometry =
    prim.kind === 'box'
      ? new THREE.BoxGeometry(...prim.size)
      : prim.kind === 'cone'
        ? new THREE.CylinderGeometry(prim.rTop, prim.rBottom, prim.height, prim.sides)
        : new THREE.IcosahedronGeometry(prim.radius, 1);
  const mesh = new THREE.Mesh(geometry, materialFor(prim));
  mesh.position.set(...prim.pos);
  mesh.rotation.y = prim.rotY ?? 0;
  return mesh;
}

function buildSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(3000, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(SKY_TOP) }, horizon: { value: new THREE.Color(HORIZON) } },
      vertexShader: `
        varying float height;
        void main() {
          height = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        varying float height;
        void main() {
          gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.55, height)), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
}

function buildClouds() {
  const group = new THREE.Group();

  const sea = new THREE.Mesh(new THREE.CircleGeometry(3000, 48), new THREE.MeshBasicMaterial({ color: CLOUD }));
  sea.rotation.x = -Math.PI / 2;
  group.add(sea);

  // Puffs: most resting on the sea, some drifting higher, well off to the sides of the route.
  const count = 150;
  const puffs = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: CLOUD, flatShading: true }),
    count,
  );
  const random = seeded(11);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const high = i % 4 === 0;
    const angle = random() * Math.PI * 2;
    const reach = high ? 350 + random() * 900 : 60 + random() * 1300;
    const size = 14 + random() * 26;
    dummy.position.set(Math.cos(angle) * reach, high ? 90 + random() * 200 : random() * 5, -380 + Math.sin(angle) * reach);
    dummy.scale.set(size * (1.6 + random()), size * 0.55, size * (1.2 + random()));
    dummy.rotation.y = random() * Math.PI;
    dummy.updateMatrix();
    puffs.setMatrixAt(i, dummy.matrix);
  }
  group.add(puffs);
  return group;
}

function buildGlider() {
  const glider = new THREE.Group();
  const flat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });

  // The nose points down -Z. Wing tips are raised slightly.
  const wing = new THREE.BufferGeometry();
  const nose = [0, 0, -1.7];
  const tail = [0, 0, 0.4];
  const left = [-2.4, 0.25, 1];
  const right = [2.4, 0.25, 1];
  wing.setAttribute('position', new THREE.Float32BufferAttribute([...nose, ...left, ...tail, ...nose, ...tail, ...right], 3));
  wing.computeVertexNormals();
  glider.add(new THREE.Mesh(wing, flat('#ff8f70')));

  const part = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
    mesh.position.set(x, y, z);
    glider.add(mesh);
  };
  part(0.16, 0.16, 2.3, 0, -0.08, -0.45, '#d9b48f'); // keel
  part(0.42, 0.5, 0.95, 0, -0.5, 0.2, '#5d6d8e'); // pilot
  part(0.36, 0.36, 0.36, 0, -0.42, -0.5, '#fbe3c8'); // head
  part(0.14, 0.06, 1.1, 0.1, -0.3, 0.75, '#e5566d'); // scarf
  part(0.55, 0.42, 0.55, 0, -0.95, 0.15, '#c79a6b'); // parcel
  return glider;
}

function buildRings() {
  return rings.map((ring) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(config.rings.radius, 0.45, 6, 28),
      new THREE.MeshBasicMaterial({ color: '#ffc857', transparent: true }),
    );
    mesh.position.set(...ring.pos);
    mesh.lookAt(ring.pos[0] + ring.normal[0], ring.pos[1] + ring.normal[1], ring.pos[2] + ring.normal[2]);
    return mesh;
  });
}

/** Motes spiralling up each updraft so the lift is visible. Returns the points and their animator. */
function buildUpdrafts() {
  const perColumn = 110;
  const random = seeded(5);
  const motes = updrafts.flatMap((u) =>
    Array.from({ length: perColumn }, () => ({ u, angle: random() * Math.PI * 2, reach: Math.sqrt(random()) * 0.8, phase: random() })),
  );
  const positions = new Float32Array(motes.length * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#ffffff', size: 1.5, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  points.frustumCulled = false;

  const animate = (time: number) => {
    motes.forEach((m, i) => {
      const rise = (m.phase + (time * m.u.strength) / (m.u.top - m.u.base)) % 1;
      const angle = m.angle + time * 0.5;
      positions[i * 3] = m.u.x + Math.cos(angle) * m.reach * m.u.radius;
      positions[i * 3 + 1] = m.u.base + rise * (m.u.top - m.u.base);
      positions[i * 3 + 2] = m.u.z + Math.sin(angle) * m.reach * m.u.radius;
    });
    geometry.attributes.position.needsUpdate = true;
  };
  return { points, animate };
}

function buildBeacon() {
  const height = 600;
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, height, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffb84d', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beacon.position.set(pad.x, pad.y + height / 2, pad.z);
  return beacon;
}

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 350, 2400);
  const camera = new THREE.PerspectiveCamera(config.camera.baseFov, 1, 0.5, 4000);

  scene.add(new THREE.HemisphereLight('#dcefff', '#f6cfb8', 1.5));
  const sun = new THREE.DirectionalLight('#fff0d4', 1.9);
  sun.position.set(-0.6, 1, 0.5);
  scene.add(sun);

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
      (ringMeshes[index].material as THREE.MeshBasicMaterial).opacity = hit ? 0.18 : 1;
    },
    render(time: number) {
      updraftMotes.animate(time);
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
    },
  };
}
