import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const positions = new Float32Array([
  0, 0, -1.5,
  -2, 0, 1.2,
  2, 0, 1.2,
  0, 0.55, 0.55,
]);
const indices = new Uint16Array([
  0, 1, 3,
  0, 3, 2,
  1, 2, 3,
  0, 2, 1,
]);
const positionBytes = new Uint8Array(positions.buffer);
const indexBytes = new Uint8Array(indices.buffer);
const binary = Buffer.alloc(positionBytes.length + indexBytes.length);
binary.set(positionBytes, 0);
binary.set(indexBytes, positionBytes.length);

const json = {
  asset: { version: '2.0', generator: 'Skimmer-Scraper test fixture' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'Test Aircraft' }],
  meshes: [{
    name: 'Dart',
    primitives: [{
      attributes: { POSITION: 0 },
      indices: 1,
      material: 0,
      mode: 4,
    }],
  }],
  materials: [{
    name: 'Test Teal',
    pbrMetallicRoughness: {
      baseColorFactor: [0.18, 0.86, 0.72, 1],
      metallicFactor: 0.42,
      roughnessFactor: 0.3,
    },
    doubleSided: true,
  }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 4,
      type: 'VEC3',
      min: [-2, 0, -1.5],
      max: [2, 0.55, 1.2],
    },
    {
      bufferView: 1,
      componentType: 5123,
      count: 12,
      type: 'SCALAR',
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
    { buffer: 0, byteOffset: positionBytes.length, byteLength: indexBytes.length, target: 34963 },
  ],
  buffers: [{ byteLength: binary.length }],
};

const jsonRaw = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPadded = Buffer.alloc(Math.ceil(jsonRaw.length / 4) * 4, 0x20);
jsonRaw.copy(jsonPadded);
const binPadded = Buffer.alloc(Math.ceil(binary.length / 4) * 4, 0);
binary.copy(binPadded);

const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
const glb = Buffer.alloc(totalLength);
glb.writeUInt32LE(0x46546c67, 0);
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(totalLength, 8);
let offset = 12;
glb.writeUInt32LE(jsonPadded.length, offset);
glb.writeUInt32LE(0x4e4f534a, offset + 4);
jsonPadded.copy(glb, offset + 8);
offset += 8 + jsonPadded.length;
glb.writeUInt32LE(binPadded.length, offset);
glb.writeUInt32LE(0x004e4942, offset + 4);
binPadded.copy(glb, offset + 8);

const output = resolve('tests/fixtures/test-aircraft.glb');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, glb);
console.log(`Wrote ${output} (${glb.length} bytes)`);
