import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Vec3 } from '../core/math';
import type { CollisionChunk, SurfaceProvider, SurfaceQuery } from './worldTypes';

interface IndexedChunk {
  id: string;
  origin: THREE.Vector3;
  bounds: THREE.Box3;
  bvh: MeshBVH;
}

export const collisionBvhOptions = { maxDepth: 28, targetLeafSize: 10 };

export interface WorldAdapterStats {
  chunks: number;
  bvhCount: number;
  lastBroadPhaseCandidates: number;
  lastQueries: number;
}

/**
 * Broad-phase chunk AABBs followed by exact closest-triangle queries on per-chunk BVHs.
 * Chunk geometry is local to its origin, so a long-running flight retains floating-origin precision.
 */
export class ChunkedWorldAdapter implements SurfaceProvider {
  private readonly chunks = new Map<string, IndexedChunk>();
  private readonly queryPoint = new THREE.Vector3();
  private readonly localPoint = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private lastBroadPhaseCandidates = 0;
  private lastQueries = 0;

  public constructor(chunks: CollisionChunk[] = []) {
    for (const chunk of chunks) this.addChunk(chunk);
  }

  public addChunk(chunk: CollisionChunk, prepared?: MeshBVH): void {
    this.removeChunk(chunk.id);
    for (const attribute of Object.keys(chunk.geometry.attributes)) {
      if (attribute !== 'position' && attribute !== 'index') chunk.geometry.deleteAttribute(attribute);
    }
    chunk.geometry.clearGroups();
    this.chunks.set(chunk.id, {
      id: chunk.id,
      origin: new THREE.Vector3(chunk.origin.x, chunk.origin.y, chunk.origin.z),
      bounds: chunk.bounds.clone(),
      bvh: prepared ?? new MeshBVH(chunk.geometry, collisionBvhOptions),
    });
  }

  public removeChunk(id: string): void {
    this.chunks.delete(id);
  }

  public hasChunk(id: string): boolean {
    return this.chunks.has(id);
  }

  public getChunkIds(): string[] {
    return [...this.chunks.keys()];
  }

  public queryGlide(position: Vec3, range: number, onlyChunk?: string) {
    return this.queryNearest(position, range, onlyChunk, true);
  }

  public queryNearest(position: Vec3, maxDistance: number, onlyChunk?: string, contact = false): SurfaceQuery | null {
    if (!(maxDistance >= 0)) return null;
    this.queryPoint.set(position.x, position.y, position.z);
    this.lastBroadPhaseCandidates = 0;
    this.lastQueries = 0;

    let bestDistance = maxDistance;
    let bestChunk: IndexedChunk | null = null;
    let triangle = -1;
    const bestPoint = new THREE.Vector3();

    for (const chunk of this.chunks.values()) {
      if (onlyChunk && chunk.id !== onlyChunk) continue;
      this.localPoint.copy(this.queryPoint).sub(chunk.origin);
      if (chunk.bounds.distanceToPoint(this.localPoint) > bestDistance) continue;
      this.lastBroadPhaseCandidates += 1;
      this.lastQueries += 1;
      const hit = chunk.bvh.closestPointToPoint(this.localPoint, {
        point: this.hitPoint,
        distance: Number.POSITIVE_INFINITY,
        faceIndex: -1,
      }, 0, bestDistance);
      if (!hit || hit.distance >= bestDistance) continue;
      bestDistance = hit.distance;
      bestChunk = chunk;
      triangle = hit.faceIndex;
      bestPoint.copy(hit.point).add(chunk.origin);
    }

    if (!bestChunk) return null;
    let frame: SurfaceQuery['contact'];
    if (contact) {
      const geometry = bestChunk.bvh.geometry;
      const vertices = geometry.getAttribute('position');
      const vertex = (i: number) => new THREE.Vector3().fromBufferAttribute(vertices, geometry.index?.getX(i) ?? i);
      const i = 3 * triangle;
      const normal = THREE.Triangle.getNormal(vertex(i),vertex(i+1),vertex(i+2),new THREE.Vector3());
      if (normal.dot(this.queryPoint.clone().sub(bestPoint)) < 0) normal.negate();
      frame = { normal, localPoint: bestPoint.clone().sub(bestChunk.origin), triangle, geometryId:geometry.uuid, velocity:{x:0,y:0,z:0} };
    }
    return {
      ...(frame ? {contact:frame} : {}),
      distance: bestDistance,
      point: { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z },
      chunkId: bestChunk.id,
      surfaceId: bestChunk.id,
    };
  }

  public getStats(): WorldAdapterStats {
    return {
      chunks: this.chunks.size,
      bvhCount: this.chunks.size,
      lastBroadPhaseCandidates: this.lastBroadPhaseCandidates,
      lastQueries: this.lastQueries,
    };
  }

  public dispose(): void {
    this.chunks.clear();
  }
}
