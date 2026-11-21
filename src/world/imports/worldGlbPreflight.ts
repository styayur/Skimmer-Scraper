import { readGlbContainer } from '../../model/glb';
import { WORLD_IMPORT_LIMITS as limits } from './worldManifest';

interface EmbeddedSource {
  uri?: string;
  byteLength?: number;
  bufferView?: number;
  mimeType?: string;
}

interface BufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  extensions?: Record<string, { count?: number; byteStride?: number }>;
}

const dataUri = /^data:([\w./+-]+);base64,([a-zA-Z0-9+/=]+)$/;
const supportedExtensions = new Set([
  'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression', 'EXT_mesh_gpu_instancing',
  'KHR_mesh_quantization', 'KHR_texture_basisu', 'KHR_texture_transform', 'EXT_texture_webp', 'KHR_lights_punctual',
  'KHR_materials_clearcoat', 'KHR_materials_diffuse_roughness', 'KHR_materials_dispersion', 'KHR_materials_ior',
  'KHR_materials_sheen', 'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_iridescence',
  'KHR_materials_anisotropy', 'KHR_materials_unlit', 'KHR_materials_volume', 'KHR_materials_emissive_strength', 'EXT_materials_bump',
]);

const decode = (uri: string): { mime: string; bytes: Uint8Array } => {
  const match = dataUri.exec(uri);
  if (!match) throw new Error('场景只接受二进制内嵌资源或 Base64 数据。');
  const bytes = Uint8Array.from(atob(match[2]!), byte => byte.charCodeAt(0));
  return { mime: match[1]!, bytes };
};

const imageSize = (bytes: Uint8Array, mime: string): [number, number] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452) {
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (mime === 'image/ktx2' && bytes.length >= 48 && view.getUint32(0) === 0xab4b5458 && view.getUint32(4) === 0x203230bb) {
    if (view.getUint32(28, true) !== 0 || view.getUint32(32, true) > 1 || view.getUint32(36, true) !== 1) {
      throw new Error('世界材质只支持二维 KTX2 纹理。');
    }
    return [view.getUint32(20, true), view.getUint32(24, true)];
  }
  if (mime === 'image/jpeg' && bytes.length > 4 && view.getUint16(0) === 0xffd8) {
    for (let offset = 2; offset + 10 < bytes.length;) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1]!;
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
        return [view.getUint16(offset + 7), view.getUint16(offset + 5)];
      }
      offset += 2 + length;
    }
  }
  if (mime === 'image/webp' && bytes.length >= 25 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const encoding = view.getUint32(12);
    if (encoding === 0x56503858 && bytes.length >= 30) {
      const read24 = (offset: number) => (view.getUint16(offset, true) | (bytes[offset + 2]! << 16)) + 1;
      return [read24(24), read24(27)];
    }
    if (encoding === 0x5650384c && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (encoding === 0x56503820 && bytes.length >= 30 && bytes[23] === 0x9d && view.getUint16(24) === 0x012a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
  }
  throw new Error('世界纹理格式或尺寸无效。支持 PNG、JPEG、WebP 和二维 KTX2。');
};

export const inspectWorldGlb = (data: ArrayBuffer) => {
  const { json, binary } = readGlbContainer(data, limits.bytes, { strict: true, maxJsonBytes: 16 * 1024 * 1024 });
  const source = json as typeof json & {
    accessors?: Array<{ count: number; type: string }>;
    buffers?: EmbeddedSource[];
    bufferViews?: BufferView[];
    images?: EmbeddedSource[];
    materials?: unknown[];
    nodes?: Array<{ children?: number[] }>;
    textures?: unknown[];
    extensionsUsed?: string[];
    extensionsRequired?: string[];
  };
  if ((source.nodes?.length ?? 0) > limits.nodes || (source.materials?.length ?? 0) > limits.materials ||
      (source.textures?.length ?? 0) > limits.textures || (source.images?.length ?? 0) > limits.textures) {
    throw new Error('世界超过节点、材质或纹理预算。');
  }
  const unsupported = source.extensionsRequired?.find(extension => !supportedExtensions.has(extension));
  if (unsupported) throw new Error(`此世界需要暂不支持的 glTF 扩展 ${unsupported}。`);
  const nodes = source.nodes ?? [];
  const parents = new Uint16Array(nodes.length);
  for (const node of nodes) {
    for (const child of node.children ?? []) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length || parents[child] !== 0) {
        throw new Error('世界节点层级无效。');
      }
      parents[child] = 1;
    }
  }
  const pending = nodes.flatMap((_, index) => parents[index] ? [] : [index]);
  for (let index = 0; index < pending.length; index++) pending.push(...nodes[pending[index]!]!.children ?? []);
  if (pending.length !== nodes.length) throw new Error('世界节点层级包含循环。');
  const widths: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  let components = 0;
  for (const accessor of source.accessors ?? []) {
    const width = widths[accessor.type];
    if (!width || !Number.isSafeInteger(accessor.count) || accessor.count < 1 || accessor.count > limits.triangles * 3) {
      throw new Error('世界顶点数据无效或超过预算。');
    }
    components += width * accessor.count;
  }
  if (components > 64_000_000) throw new Error('世界解码后的几何数据超过预算。');
  let decodedBytes = 0;
  for (const view of source.bufferViews ?? []) {
    const compressed = view.extensions?.EXT_meshopt_compression ?? view.extensions?.KHR_meshopt_compression;
    if (!compressed) continue;
    const { count, byteStride } = compressed;
    if (!Number.isSafeInteger(count) || count! < 1 || !Number.isSafeInteger(byteStride) || byteStride! < 1 || byteStride! > 256) {
      throw new Error('Meshopt 缓冲区无效。');
    }
    decodedBytes += count! * byteStride!;
  }
  if (decodedBytes > limits.bytes) throw new Error('Meshopt 解码后的场景超过预算。');

  const localBuffers = new Map<number, Uint8Array>();
  let texturePixels = 0;
  for (const image of source.images ?? []) {
    let resource: { bytes: Uint8Array; mime: string };
    if (image.uri) {
      resource = decode(image.uri);
    } else {
      const view = source.bufferViews?.[image.bufferView ?? -1];
      const buffer = view && source.buffers?.[view.buffer];
      if (!view || !buffer || !image.mimeType) throw new Error('世界纹理缺少内嵌数据。');
      let bytes = localBuffers.get(view.buffer);
      if (!bytes) {
        bytes = buffer.uri ? decode(buffer.uri).bytes : view.buffer === 0 ? binary ?? undefined : undefined;
        if (!bytes) throw new Error('世界纹理引用了无效的缓冲区。');
        localBuffers.set(view.buffer, bytes);
      }
      const start = view.byteOffset ?? 0;
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength < 1 || start + view.byteLength > bytes.byteLength) {
        throw new Error('世界纹理缓冲区超出了文件范围。');
      }
      resource = { bytes: bytes.subarray(start, start + view.byteLength), mime: image.mimeType };
    }
    const [width, height] = imageSize(resource.bytes, resource.mime);
    if (width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error('每张世界纹理须小于或等于 8192 像素宽和高。');
    texturePixels += width * height;
    if (texturePixels > limits.texturePixels) throw new Error('世界纹理解码后的总像素超过预算。');
  }
  return { texturePixels, extensions: new Set([...(source.extensionsUsed ?? []), ...(source.extensionsRequired ?? [])]) };
};
