import { ForgeChunkGenerator, type ForgePacket } from './procedural/forgeChunk';
import { KineticChunkGenerator, type KineticPacket } from './kinetic/kineticChunk';
import { MeshBVH, type SerializedBVH } from 'three-mesh-bvh';
import { CityGeometryGenerator, type CityChunkPacket } from './chunkGenerator';
import type { ChunkSourceRequest } from './chunkSource';
import { unpackGeometry } from './packedGeometry';
import type { WorldSettings } from './worldConfig';
import { collisionBvhOptions } from './chunkedWorldAdapter';

export interface CityWorkerResult {
  packet: CityChunkPacket | ForgePacket | KineticPacket;
  collisionTree: SerializedBVH;
  workerBuildMs: number;
}

let generator: CityGeometryGenerator | ForgeChunkGenerator | KineticChunkGenerator;
async function generate(data: WorldSettings | ChunkSourceRequest) {
  if ('generatorVersion' in data) {
    generator = data.theme === 'kinetic-city' ? new KineticChunkGenerator(data) :
      data.theme === 'worldforge' ? new ForgeChunkGenerator(data) : new CityGeometryGenerator(data);
    self.postMessage('ready');
    return;
  }
  const started = performance.now();
  const packet = await generator.prepare(data.chunkX, data.chunkZ, data.revision);
  const bvh = new MeshBVH(unpackGeometry(packet.collision), collisionBvhOptions);
  const collisionTree = MeshBVH.serialize(bvh, { cloneBuffers: false });
  const buffers = new Set<ArrayBuffer>(collisionTree.roots);
  if (collisionTree.index) buffers.add(collisionTree.index.buffer as ArrayBuffer);
  const geometryPackets = 'kinetic' in packet ? [packet.collision, packet.render, packet.road, packet.distantRoad]
    : 'forge' in packet ? [packet.collision, packet.render]
    : [packet.collision, packet.shadow, ...packet.surfaces.map(([, surface]) => surface)];
  for (const geometry of geometryPackets) {
    if (geometry?.index) buffers.add(geometry.index.buffer as ArrayBuffer);
    for (const attribute of geometry?.attributes ?? []) buffers.add(attribute.array.buffer as ArrayBuffer);
  }
  const result: CityWorkerResult = { packet, collisionTree, workerBuildMs: performance.now() - started };
  self.postMessage(result, { transfer: [...buffers] });
}

self.onmessage = ({ data }: MessageEvent<WorldSettings | ChunkSourceRequest>) => {
  void generate(data).catch((error: unknown) => self.postMessage({ error: String(error) }));
};
