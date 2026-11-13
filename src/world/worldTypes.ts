import type { Box3, BufferGeometry, Group } from 'three';
import type { Vec3 } from '../core/math';
import type { WorldSettings } from './worldConfig';

export interface CollisionChunk {
  id: string;
  chunkX: number;
  chunkZ: number;
  origin: Vec3;
  bounds: Box3;
  geometry: BufferGeometry;
}

export interface ChunkGenerationStats {
  buildings: number;
  bridges: number;
  islands: number;
  collisionTriangles: number;
  renderTriangles: number;
}

export interface GeneratedChunk {
  key: string;
  chunkX: number;
  chunkZ: number;
  revision: number;
  origin: Vec3;
  group: Group;
  bounds: Box3;
  collisionGeometry: BufferGeometry;
  fingerprint: number;
  stats: ChunkGenerationStats;
}

export interface WorldStats {
  chunks: number;
  buildings: number;
  bridges: number;
  islands: number;
  collisionTriangles: number;
  renderTriangles: number;
}

export interface SurfaceQuery {
  distance: number;
  point: Vec3;
  chunkId: string;
  surfaceId: string;
}

export interface SurfaceProvider {
  queryNearest(position: Vec3, maxDistance: number): SurfaceQuery | null;
}

export interface WorldData {
  seed: number;
  settings: WorldSettings;
  root: Group;
  chunks: CollisionChunk[];
  spawn: {
    position: Vec3;
    yaw: number;
    pitch: number;
    speed: number;
  };
  stats: WorldStats;
  fingerprint: number;
  dispose(): void;
}
