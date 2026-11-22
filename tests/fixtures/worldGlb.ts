import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type WorldFixture = 'building' | 'arches' | 'detailed' | 'animated' | 'variants' | 'merged';

export const encodeGlb = (metadata: object, bytes = Buffer.alloc(0)): Buffer => {
  const json = Buffer.from(JSON.stringify(metadata), 'utf8');
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const binaryLength = Math.ceil(bytes.length / 4) * 4;
  const buffer = Buffer.alloc(28 + jsonLength + binaryLength);
  buffer.writeUInt32LE(0x46546c67, 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(jsonLength, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  buffer.fill(0x20, 20, 20 + jsonLength);
  json.copy(buffer, 20);
  buffer.writeUInt32LE(binaryLength, 20 + jsonLength);
  buffer.writeUInt32LE(0x004e4942, 24 + jsonLength);
  bytes.copy(buffer, 28 + jsonLength);
  return buffer;
};

export const createWorldFixture = (style: WorldFixture, withExternalUri = false): Buffer => {
  const views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  const accessors: Array<{ bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }> = [];
  const parts: Buffer[] = [];
  let offset = 0;
  const attribute = (array: Float32Array | Uint16Array, type: string, width: number, min?: number[], max?: number[]) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const bufferView = views.length;
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    const padding = (4 - bytes.length % 4) % 4;
    parts.push(bytes, Buffer.alloc(padding));
    offset += bytes.length + padding;
    return accessors.push({ bufferView, componentType: array instanceof Float32Array ? 5126 : 5123, count: array.length / width, type, min, max }) - 1;
  };
  const primitive = (geometry: BufferGeometry) => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    return {
      attributes: {
        POSITION: attribute(geometry.getAttribute('position').array as Float32Array, 'VEC3', 3, box.min.toArray(), box.max.toArray()),
        NORMAL: attribute(geometry.getAttribute('normal').array as Float32Array, 'VEC3', 3),
      },
      indices: attribute(geometry.index!.array as Uint16Array, 'SCALAR', 1),
    };
  };
  const asset = { version: '2.0', generator: 'Skimmer-Scraper original world fixtures' };
  if (style === 'merged') {
    const source = [
      new BoxGeometry(200, 1, 240).translate(0, 0.5, 0),
      new BoxGeometry(20, 66, 24).translate(50, 33, -36),
      new BoxGeometry(30, 42, 32).translate(-50, 21, -32),
      new BoxGeometry(25, 8, 40).translate(-58, 22, 38),
    ];
    const merged = mergeGeometries(source);
    const mesh = primitive(merged);
    for (const geometry of [...source, merged]) geometry.dispose();
    const data = Buffer.concat(parts);
    return encodeGlb({
      asset, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Single joined mesh', mesh: 0 }],
      meshes: [{ primitives: [mesh] }], accessors, bufferViews: views, buffers: [{ byteLength: data.length }],
    }, data);
  }
  const box = primitive(new BoxGeometry(1, 1, 1));
  const tower = style === 'detailed' ? primitive(new CylinderGeometry(0.33, 0.5, 1, 72, 12)) : box;
  const meshes = [box, box, box, box, tower].map((mesh, material) => ({ primitives: [{ ...mesh, material }] }));
  const nodes: Array<{ name: string; mesh: number; translation: number[]; scale: number[]; extras?: { skimmerRole: string } }> = [];
  const add = (name: string, mesh: number, translation: number[], scale: number[], role?: string) =>
    nodes.push({ name, mesh, translation, scale, ...(role ? { extras: { skimmerRole: role } } : {}) }) - 1;
  add('Promenade', 0, [0, 0.5, 0], [280, 1, 340]);
  add('East Lantern Tower', 1, [55, 30, -32], [28, 60, 36]);
  add('West Atrium', 2, [-52, 24, -40], [33, 48, 43]);
  add('Skybox far', 3, [0, 98, -260], [730, 180, 1]);
  if (style !== 'building') {
    add('Rose bridge pier east', 2, [25, 16, 0], [8, 32, 16]);
    add('Rose bridge pier west', 2, [-25, 16, 0], [8, 32, 16]);
    add('Rose bridge deck', 2, [0, 32, 0], [58, 6, 16]);
    add('East overhang', 2, [40, 25, -25], [42, 5, 25]);
    add('Safety Block', 3, [0, 8, -68], [12, 16, 12], 'OBSTACLE');
  }
  if (style === 'detailed') {
    for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) {
      const height = 24 + (row * 11 + column * 17) % 57;
      add(`Faceted tower ${row}-${column}`, 4, [(column - 3.5) * 29, height / 2, -36 - row * 23], [17, height, 17]);
    }
  }
  if (style === 'variants') {
    add('North lantern', 4, [97, 45, -96], [24, 90, 32]);
    add('West terrace', 1, [-99, 31, -92], [28, 62, 26]);
    add('East harbor', 2, [91, 15, 54], [33, 30, 36]);
    add('Emerald floating garden', 1, [-75, 51, 62], [36, 9, 33]);
    add('Rose floating garden', 4, [49, 57, 80], [35, 11, 28]);
    add('West apartment', 2, [-98, 35, 103], [24, 70, 22]);
  }
  const animations = [];
  if (style === 'animated') {
    const lift = add('Lift', 1, [78, 9, 30], [14, 10, 18]);
    const input = attribute(new Float32Array([0, 1, 2]), 'SCALAR', 1, [0], [2]);
    const output = attribute(new Float32Array([78, 9, 30, 78, 44, 30, 78, 9, 30]), 'VEC3', 3);
    animations.push({ name: 'Lift cycle', channels: [{ sampler: 0, target: { node: lift, path: 'translation' } }], samplers: [{ input, output, interpolation: 'LINEAR' }] });
  }
  const data = Buffer.concat(parts);
  const materials = [[0.34, 0.25, 0.38, 1], [0.15, 0.45, 0.49, 1], [0.47, 0.22, 0.35, 1],
    [0.39, 0.16, 0.27, 1], [0.25, 0.39, 0.46, 1]].map(baseColorFactor => ({
    pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0.15, roughnessFactor: 0.66 },
  }));
  return encodeGlb({
    asset,
    scene: 0, scenes: [{ nodes: nodes.map((_, index) => index) }], nodes, meshes, materials, animations,
    accessors, bufferViews: views, buffers: [{ byteLength: data.length, ...(withExternalUri ? { uri: 'https://example.invalid/scene.bin' } : {}) }],
  }, data);
};
