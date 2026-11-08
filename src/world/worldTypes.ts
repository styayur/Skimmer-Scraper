import type { Box3, BufferGeometry, Group } from 'three';
import type { Vec3 } from '../core/math';

export interface CollisionChunk {
  id: string;
  bounds: Box3;
  geometry: BufferGeometry;
}

export interface WorldStats {
  chunks: number;
  buildings: number;
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
  root: Group;
  chunks: CollisionChunk[];
  spawn: {
    position: Vec3;
    yaw: number;
    pitch: number;
    speed: number;
  };
  stats: WorldStats;
}
