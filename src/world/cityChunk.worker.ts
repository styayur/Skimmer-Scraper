import { MeshBVH, type SerializedBVH } from 'three-mesh-bvh';
import { CityGeometryGenerator, type CityChunkPacket } from './chunkGenerator';
import type { ChunkSourceRequest } from './chunkSource';
import { unpackGeometry } from './packedGeometry';
import type { WorldSettings } from './worldConfig';
import { collisionBvhOptions } from './chunkedWorldAdapter';

export interface CityWorkerResult {
  packet: CityChunkPacket;
  collisionTree: SerializedBVH;
  workerBuildMs: number;
}

let generator: CityGeometryGenerator;
self.onmessage = ({ data }: MessageEvent<WorldSettings | ChunkSourceRequest>) => {
  if ('generatorVersion' in data) {
    generator = new CityGeometryGenerator(data);
    return;
  }
  const started = performance.now();
  const packet = generator.prepare(data.chunkX, data.chunkZ, data.revision);
  const bvh = new MeshBVH(unpackGeometry(packet.collision), collisionBvhOptions);
  const collisionTree = MeshBVH.serialize(bvh, { cloneBuffers: false });
  const buffers = new Set<ArrayBuffer>(collisionTree.roots);
  if (collisionTree.index) buffers.add(collisionTree.index.buffer as ArrayBuffer);
  for (const geometry of [packet.collision, packet.shadow, ...packet.surfaces.map(([, surface]) => surface)]) {
    for (const attribute of geometry?.attributes ?? []) buffers.add(attribute.array.buffer as ArrayBuffer);
  }
  const result: CityWorkerResult = { packet, collisionTree, workerBuildMs: performance.now() - started };
  self.postMessage(result, { transfer: [...buffers] });
};
