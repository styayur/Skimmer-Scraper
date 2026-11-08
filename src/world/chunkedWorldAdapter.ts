import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Vec3 } from '../core/math';
import type { CollisionChunk, SurfaceProvider, SurfaceQuery } from './worldTypes';

interface IndexedChunk {
  id: string;
  bounds: THREE.Box3;
  bvh: MeshBVH;
}

export interface WorldAdapterStats {
  chunks: number;
  lastBroadPhaseCandidates: number;
  lastQueries: number;
}

/**
 * Broad-phase chunk AABBs followed by exact closest-triangle queries on per-chunk BVHs.
 * Collision geometry is authored in world space, so no per-query matrices are needed.
 */
export class ChunkedWorldAdapter implements SurfaceProvider {
  private readonly chunks: IndexedChunk[];
  private readonly queryPoint = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private lastBroadPhaseCandidates = 0;
  private lastQueries = 0;

  public constructor(chunks: CollisionChunk[]) {
    this.chunks = chunks.map((chunk) => {
      for (const attribute of Object.keys(chunk.geometry.attributes)) {
        if (attribute !== 'position' && attribute !== 'index') chunk.geometry.deleteAttribute(attribute);
      }
      chunk.geometry.clearGroups();
      return {
        id: chunk.id,
        bounds: chunk.bounds.clone(),
        bvh: new MeshBVH(chunk.geometry, {
          maxDepth: 28,
          targetLeafSize: 10,
        }),
      };
    });
  }

  public queryNearest(position: Vec3, maxDistance: number): SurfaceQuery | null {
    if (!(maxDistance >= 0)) return null;
    this.queryPoint.set(position.x, position.y, position.z);
    this.lastBroadPhaseCandidates = 0;
    this.lastQueries = 0;

    let bestDistance = maxDistance;
    let bestChunk: IndexedChunk | null = null;
    const bestPoint = new THREE.Vector3();

    for (const chunk of this.chunks) {
      if (chunk.bounds.distanceToPoint(this.queryPoint) > bestDistance) continue;
      this.lastBroadPhaseCandidates += 1;
      this.lastQueries += 1;
      const hit = chunk.bvh.closestPointToPoint(this.queryPoint, {
        point: this.hitPoint,
        distance: Number.POSITIVE_INFINITY,
        faceIndex: -1,
      }, 0, bestDistance);
      if (!hit || hit.distance >= bestDistance) continue;
      bestDistance = hit.distance;
      bestChunk = chunk;
      bestPoint.copy(hit.point);
    }

    if (!bestChunk) return null;
    return {
      distance: bestDistance,
      point: { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z },
      chunkId: bestChunk.id,
      surfaceId: bestChunk.id,
    };
  }

  public getStats(): WorldAdapterStats {
    return {
      chunks: this.chunks.length,
      lastBroadPhaseCandidates: this.lastBroadPhaseCandidates,
      lastQueries: this.lastQueries,
    };
  }

  public dispose(): void {
    this.chunks.length = 0;
  }
}

