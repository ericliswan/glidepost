// Cuts a KayKit Adventurers character down to what the game uses: the body, one sitting
// animation, and no weapons. The original is 3.6 MB, most of it animations.
//
//   node scripts/pack-courier.mjs path/to/Rogue.glb
//
// Writes public/models/courier.glb.
import { readFileSync, writeFileSync } from 'node:fs';

const KEEP_ANIMATIONS = ['Sit_Chair_Idle'];
const DROP_MESHES = ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'];
const OUT = new URL('../public/models/courier.glb', import.meta.url);

const file = readFileSync(process.argv[2]);
if (file.readUInt32LE(0) !== 0x46546c67) throw new Error('not a .glb file');
const jsonLength = file.readUInt32LE(12);
const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
const bin = file.subarray(20 + jsonLength + 8, 20 + jsonLength + 8 + file.readUInt32LE(20 + jsonLength));

json.animations = json.animations.filter((a) => KEEP_ANIMATIONS.includes(a.name));
if (json.animations.length !== KEEP_ANIMATIONS.length) throw new Error('animation not found');
for (const node of json.nodes) if (DROP_MESHES.includes(node.name)) delete node.mesh;

/** Keeps only the listed entries of an array and returns how old indices map to new ones. */
function prune(key, used) {
  const map = new Map([...used].sort((a, b) => a - b).map((old, i) => [old, i]));
  json[key] = json[key].filter((_, i) => map.has(i));
  return (old) => map.get(old);
}

const mesh = prune('meshes', new Set(json.nodes.flatMap((n) => n.mesh ?? [])));
for (const node of json.nodes) if (node.mesh !== undefined) node.mesh = mesh(node.mesh);

// Everything that points at an accessor: geometry, skins and the animation that is left.
const slots = [
  ...json.meshes.flatMap((m) => m.primitives.flatMap((p) => [[p, 'indices'], ...Object.keys(p.attributes).map((k) => [p.attributes, k])])),
  ...json.skins.map((s) => [s, 'inverseBindMatrices']),
  ...json.animations.flatMap((a) => a.samplers.flatMap((s) => [[s, 'input'], [s, 'output']])),
].filter(([owner, key]) => owner[key] !== undefined);
const accessor = prune('accessors', new Set(slots.map(([owner, key]) => owner[key])));
for (const [owner, key] of slots) owner[key] = accessor(owner[key]);

const holders = [...json.accessors, ...json.images];
const view = prune('bufferViews', new Set(holders.map((h) => h.bufferView)));
for (const holder of holders) holder.bufferView = view(holder.bufferView);

// Copy the surviving views into a new buffer, each starting on a 4-byte boundary.
const parts = [];
let length = 0;
for (const v of json.bufferViews) {
  const bytes = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const padding = Buffer.alloc((4 - (length % 4)) % 4);
  v.byteOffset = length + padding.length;
  parts.push(padding, bytes);
  length = v.byteOffset + v.byteLength;
}
parts.push(Buffer.alloc((4 - (length % 4)) % 4));
const newBin = Buffer.concat(parts);
json.buffers = [{ byteLength: newBin.length }];

let text = JSON.stringify(json);
text += ' '.repeat((4 - (Buffer.byteLength(text) % 4)) % 4);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + Buffer.byteLength(text) + newBin.length, 8);
header.writeUInt32LE(Buffer.byteLength(text), 12);
header.write('JSON', 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(newBin.length, 0);
binHeader.write('BIN\0', 4);
writeFileSync(OUT, Buffer.concat([header, Buffer.from(text), binHeader, newBin]));
console.log(`courier.glb: ${((28 + Buffer.byteLength(text) + newBin.length) / 1024).toFixed(0)} kB`);
