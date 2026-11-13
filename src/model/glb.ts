import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MAX_GLB_BYTES = 48 * 1024 * 1024;
export const MAX_AIRCRAFT_TRIANGLES = 250_000;
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

interface GltfJson {
  asset?: { version?: string };
  accessors?: Array<{ count?: number }>;
  meshes?: Array<{
    primitives?: Array<{
      mode?: number;
      indices?: number;
      attributes?: Record<string, number>;
    }>;
  }>;
  [key: string]: unknown;
}

export interface GlbInspection {
  sizeBytes: number;
  triangles: number;
  generator: string | null;
  hasBinaryChunk: boolean;
}

export interface NormalizedAircraft {
  root: THREE.Group;
  triangles: number;
  size: THREE.Vector3;
}

const fail = (message: string): never => {
  throw new Error(message);
};

export const assertSelfContainedGltfUris = (value: unknown, path = 'gltf'): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSelfContainedGltfUris(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'uri' && typeof child === 'string' && !child.startsWith('data:')) {
      fail(`GLB is not self-contained: external URI at ${path}.${key}.`);
    }
    assertSelfContainedGltfUris(child, `${path}.${key}`);
  }
};

export const inspectGlb = (buffer: ArrayBuffer): GlbInspection => {
  if (buffer.byteLength < 20) fail('GLB is too small.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) fail('File is not a binary glTF (GLB) container.');
  if (view.getUint32(4, true) !== 2) fail('Only GLB version 2 is supported.');
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== buffer.byteLength) fail('GLB length header does not match the file.');
  if (declaredLength > MAX_GLB_BYTES) fail('GLB exceeds the 48 MB local import limit.');

  let offset = 12;
  let jsonChunk: Uint8Array | null = null;
  let hasBinaryChunk = false;
  while (offset + 8 <= declaredLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > declaredLength) fail('GLB chunk length exceeds the container.');
    if (chunkType === JSON_CHUNK && !jsonChunk) {
      jsonChunk = new Uint8Array(buffer, start, chunkLength);
    } else if (chunkType === BIN_CHUNK) {
      hasBinaryChunk = true;
    }
    offset = end;
  }
  if (!jsonChunk) fail('GLB has no JSON chunk.');
  const jsonBytes = jsonChunk as Uint8Array;

  let parsed: unknown;
  try {
    const text = new TextDecoder().decode(jsonBytes).replace(/[\u0000\u0020]+$/g, '');
    parsed = JSON.parse(text);
  } catch {
    fail('GLB JSON chunk is invalid.');
  }
  if (!parsed || typeof parsed !== 'object') fail('GLB JSON root is invalid.');
  const json = parsed as GltfJson;
  if (json.asset?.version !== '2.0') fail('GLB asset version must be 2.0.');
  assertSelfContainedGltfUris(json);

  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      if (accessorIndex === undefined) continue;
      const count = Number(json.accessors?.[accessorIndex]?.count ?? 0);
      if (count > 0) triangles += Math.floor(count / 3);
    }
  }
  if (triangles <= 0) fail('GLB contains no triangle mesh.');
  if (triangles > MAX_AIRCRAFT_TRIANGLES) {
    fail(`GLB has ${triangles.toLocaleString()} triangles; the local limit is ${MAX_AIRCRAFT_TRIANGLES.toLocaleString()}.`);
  }

  return {
    sizeBytes: declaredLength,
    triangles,
    generator: typeof (json.asset as { generator?: unknown } | undefined)?.generator === 'string'
      ? String((json.asset as { generator?: unknown }).generator)
      : null,
    hasBinaryChunk,
  };
};

export const readAndInspectGlb = async (file: File): Promise<{ buffer: ArrayBuffer; inspection: GlbInspection }> => {
  if (!file.name.toLowerCase().endsWith('.glb')) fail('Choose a .glb file.');
  if (file.size <= 0) fail('GLB file is empty.');
  if (file.size > MAX_GLB_BYTES) fail('GLB exceeds the 48 MB local import limit.');
  const buffer = await file.arrayBuffer();
  return { buffer, inspection: inspectGlb(buffer) };
};

export const normalizeAircraft = (
  scene: THREE.Object3D,
  triangleCount: number,
  yawOffset = Math.PI,
  targetSize = 8,
): NormalizedAircraft => {
  if (triangleCount > MAX_AIRCRAFT_TRIANGLES) fail('Aircraft triangle budget exceeded.');
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x + size.y + size.z) || Math.max(size.x, size.y, size.z) <= 1e-5) {
    fail('Aircraft model has invalid bounds.');
  }

  const center = box.getCenter(new THREE.Vector3());
  const centering = new THREE.Group();
  centering.name = 'aircraft-centering';
  centering.add(scene);
  centering.position.copy(center).multiplyScalar(-1);

  const scale = targetSize / Math.max(size.x, size.y, size.z);
  const scaled = new THREE.Group();
  scaled.name = 'aircraft-scale';
  scaled.scale.setScalar(scale);
  scaled.add(centering);

  const orientation = new THREE.Group();
  orientation.name = 'aircraft-orientation';
  orientation.rotation.y = yawOffset;
  orientation.add(scaled);

  const root = new THREE.Group();
  root.name = 'aircraft-imported';
  root.add(orientation);
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { root, triangles: triangleCount, size: size.multiplyScalar(scale) };
};

export const loadAircraftGlb = async (
  buffer: ArrayBuffer,
  yawOffset = Math.PI,
): Promise<NormalizedAircraft> => {
  const inspection = inspectGlb(buffer);
  const loader = new GLTFLoader();
  let gltf: Awaited<ReturnType<GLTFLoader['parseAsync']>>;
  try {
    gltf = await loader.parseAsync(buffer, '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse GLB: ${message}`);
  }
  return normalizeAircraft(gltf.scene, inspection.triangles, yawOffset);
};

export const disposeObject3D = (root: THREE.Object3D): void => {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) {
      for (const material of object.material) material.dispose();
    } else {
      object.material.dispose();
    }
  });
};





