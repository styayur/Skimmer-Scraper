import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { dragonHeight } from '../src/world/dragonTerrain.ts';

const [output, tier = 'high'] = process.argv.slice(2);
if (!output || !['web', 'high'].includes(tier))
  throw Error(
    'Usage: node scripts/build-dragon-pack.mjs <output directory> [web|high]',
  );
await mkdir(output, { recursive: true });
const seed = 334458,
  tileSize = 220,
  resolution = tier === 'high' ? 200 : 40;
const files = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function terrainGLB(cx, cz) {
  const n = resolution + 1,
    count = n * n;
  const positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3),
    colors = new Uint8Array(count * 4);
  const indices = new Uint16Array(resolution * resolution * 6);
  let min = Infinity,
    max = -Infinity;
  // Interpolate the same triangular surface used by the shared collision tiles.
  function surface(x, z) {
    const gx = Math.floor(x / 11),
      gz = Math.floor(z / 11),
      u = x / 11 - gx,
      v = z / 11 - gz;
    const at = (i, j) => dragonHeight((gx + i) * 11, (gz + j) * 11, seed);
    if (u + v <= 1) return at(0, 0) * (1 - u - v) + at(1, 0) * u + at(0, 1) * v;
    return at(1, 1) * (u + v - 1) + at(1, 0) * (1 - v) + at(0, 1) * (1 - u);
  }
  function height(x, z) {
    return (
      surface(x, z) + 0.075 * Math.sin(0.9 * x + 0.54 * z) * Math.sin(0.57 * z)
    );
  }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i,
        x = (i * tileSize) / resolution,
        z = (j * tileSize) / resolution;
      const wx = cx * tileSize + x,
        wz = cz * tileSize + z,
        y = height(wx, wz);
      positions.set([x, y, z], 3 * k);
      min = Math.min(min, y);
      max = Math.max(max, y);
      const nx = (height(wx - 0.45, wz) - height(wx + 0.45, wz)) / 0.9,
        nz = (height(wx, wz - 0.45) - height(wx, wz + 0.45)) / 0.9;
      const len = Math.hypot(nx, 1, nz);
      normals.set([nx / len, 1 / len, nz / len], 3 * k);
      const vein =
        Math.max(
          0,
          Math.cos(0.35 * y + 0.057 * wx + 0.75 * Math.sin(0.08 * wz)),
        ) ** 10;
      const moss = Math.max(0, 1 / len - 0.67) * 2.7,
        grit = 3.2 * Math.sin(wx * 1.3 + wz * 0.95);
      colors.set(
        [
          51 + vein * 30 + moss * 9 + grit,
          72 + vein * 16 + moss * 16 + grit,
          66 + vein * 6 + moss * 4 + grit,
          255,
        ],
        4 * k,
      );
      if (i < resolution && j < resolution)
        indices.set(
          [k, k + n, k + 1, k + 1, k + n, k + n + 1],
          (j * resolution + i) * 6,
        );
    }
  const buffers = [positions, normals, colors, indices].map((a) =>
    Buffer.from(a.buffer),
  );
  let byteOffset = 0;
  const views = buffers.map((b, i) => {
    const view = {
      buffer: 0,
      byteOffset,
      byteLength: b.length,
      target: i === 3 ? 34963 : 34962,
    };
    byteOffset += b.length;
    return view;
  });
  const gltf = {
    asset: { version: '2.0', generator: 'Skimmer-Scraper Dragonspine 1' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      { pbrMetallicRoughness: { metallicFactor: 0.13, roughnessFactor: 0.86 } },
    ],
    buffers: [{ byteLength: byteOffset }],
    bufferViews: views,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count,
        type: 'VEC3',
        min: [0, Math.fround(min), 0],
        max: [220, Math.fround(max), 220],
      },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
      {
        bufferView: 2,
        componentType: 5121,
        normalized: true,
        count,
        type: 'VEC4',
      },
      {
        bufferView: 3,
        componentType: 5123,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
  };
  const raw = Buffer.from(JSON.stringify(gltf)),
    json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
  raw.copy(json);
  const header = Buffer.alloc(20),
    bin = Buffer.alloc(8);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + byteOffset, 8);
  header.writeUInt32LE(json.length, 12);
  header.write('JSON', 16);
  bin.writeUInt32LE(byteOffset);
  bin.write('BIN', 4);
  return { bytes: Buffer.concat([header, json, bin, ...buffers]), min, max };
}
for (let cz = -17; cz <= 2; cz++)
  for (let cx = -2; cx <= 2; cx++) {
    const { bytes, min, max } = terrainGLB(cx, cz);
    const name = 'ridge_' + cx + '_' + cz + '.glb';
    await writeFile(path.join(output, name), bytes);
    files.push({
      name,
      sha256: hash(bytes),
      bytes: bytes.length,
      cx,
      cz,
      bounds: [cx * 220, min, cz * 220, (cx + 1) * 220, max, (cz + 1) * 220],
    });
  }
const builtinResources = [];
for (const [name, role] of [
  ['bronze-crest.glb', 'animated-dragon'],
  ['bronze-crest-far.glb', 'distant-dragon'],
  ['strata-normal.png', 'terrain-normal'],
]) {
  const data = await readFile(
    new URL('../public/realms/dragonspine/' + name, import.meta.url),
  );
  builtinResources.push({
    name,
    role,
    provider: 'bundled',
    bytes: data.length,
    sha256: hash(data),
  });
}
const manifest = {
  schema: 1,
  id: 'dragonspine-' + tier + '-1',
  theme: 'dragon',
  seed,
  generatorVersion: 1,
  packVersion: '1.0.0',
  minimumClient: '0.8.0',
  tier,
  builtinResources,
  space: {
    type: 'terrain-grid',
    parent: 'dragonspine-realm',
    landmarkTypes: ['stone-arch', 'roost', 'temple', 'broken-bridge', 'ruins'],
  },
  entities: [
    {
      id: 'bronze-crest',
      animations: ['LeftWing', 'RightWing', 'TailBase'],
      proxies: ['body', 'neck', 'left', 'right', 'tail'],
    },
  ],
  chunkMeters: 220,
  collision: 'dragonspine-base-1',
  source: 'Skimmer-Scraper original',
  license: 'AGPL-3.0-only',
  files,
};
await writeFile(
  path.join(output, 'world-pack.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    tier,
    tiles: files.length,
    bytes: files.reduce((total, f) => total + f.bytes, 0),
  }),
);
