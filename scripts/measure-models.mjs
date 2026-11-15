// Measures every model in public/models and writes src/models.json: its size, and a stack of
// boxes that follow its outline, which is what the game collides with.
//
//   node scripts/measure-models.mjs
//
// A model is cut into horizontal slabs and each slab gets the box around the surface inside it,
// so a roof narrows towards its ridge instead of filling the whole bounding box.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

const DIR = new URL('../public/models/', import.meta.url);
const OUT = new URL('../src/models.json', import.meta.url);
const SLABS = 5;
const round = (v) => Math.round(v * 1000) / 1000;

/** Every triangle of a .gltf file as world-space corner points, with node transforms applied. */
function triangles(name) {
  const gltf = JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));
  const buffers = gltf.buffers.map((b) => readFileSync(new URL(b.uri, DIR)));
  const read = (index) => {
    const accessor = gltf.accessors[index];
    const view = gltf.bufferViews[accessor.bufferView];
    const data = buffers[view.buffer];
    const width = { SCALAR: 1, VEC3: 3 }[accessor.type];
    const [bytes, get] = { 5126: [4, 'readFloatLE'], 5125: [4, 'readUInt32LE'], 5123: [2, 'readUInt16LE'] }[accessor.componentType];
    const stride = view.byteStride ?? bytes * width;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count * width }, (_, i) => data[get](start + Math.floor(i / width) * stride + (i % width) * bytes));
  };

  const out = [];
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation ?? [0, 0, 0])),
          new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(node.scale ?? [1, 1, 1])),
        );
    const world = parent.clone().multiply(local);
    for (const primitive of node.mesh === undefined ? [] : gltf.meshes[node.mesh].primitives) {
      const position = read(primitive.attributes.POSITION);
      const indices = primitive.indices === undefined ? position.map((_, i) => i).slice(0, position.length / 3) : read(primitive.indices);
      for (const i of indices) out.push(new Vector3(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]).applyMatrix4(world));
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, new Matrix4());
  return out;
}

const models = {};
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.gltf')).sort()) {
  const corners = triangles(file);
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = min.clone().negate();
  for (const p of corners) (min.min(p), max.max(p));
  const height = max.y - min.y;

  // Sample points across every triangle, finely enough that none can skip a slab.
  const slabs = Array.from({ length: SLABS }, () => ({ min: new Vector3(Infinity, 0, Infinity), max: new Vector3(-Infinity, 0, -Infinity) }));
  const point = new Vector3();
  for (let t = 0; t < corners.length; t += 3) {
    const [a, b, c] = [corners[t], corners[t + 1], corners[t + 2]];
    const n = Math.min(24, Math.max(1, Math.ceil((Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y)) / (height / SLABS / 4))));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        point.set(0, 0, 0).addScaledVector(a, i / n).addScaledVector(b, j / n).addScaledVector(c, (n - i - j) / n);
        const slab = slabs[Math.max(0, Math.min(SLABS - 1, Math.floor(((point.y - min.y) / height) * SLABS)))];
        slab.min.min(point);
        slab.max.max(point);
      }
    }
  }

  models[file.replace('.gltf', '')] = {
    size: [max.x - min.x, height, max.z - min.z].map(round),
    // Each box: centre x, y, z, then width, height, depth, in the model's own units.
    boxes: slabs
      .map((s, i) => [(s.min.x + s.max.x) / 2, min.y + ((i + 0.5) * height) / SLABS, (s.min.z + s.max.z) / 2, s.max.x - s.min.x, height / SLABS, s.max.z - s.min.z].map(round))
      .filter((box) => box[3] > 0),
  };
  if (Math.abs(min.y) > 0.02) console.warn(`${file}: bottom is at y = ${round(min.y)}, not on the ground`);
}
writeFileSync(OUT, JSON.stringify(models, null, 1).replace(/\n\s+(?=[-\d\]])/g, ' ') + '\n');
console.log(`${Object.keys(models).length} models measured`);
