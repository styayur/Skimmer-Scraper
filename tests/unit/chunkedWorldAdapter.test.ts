import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkedWorldAdapter } from '../../src/world/chunkedWorldAdapter';
import type { CollisionChunk } from '../../src/world/worldTypes';

const chunk = (id: string, x: number): CollisionChunk => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  geometry.translate(x, 0, 0);
  geometry.computeBoundingBox();
  return {
    id,
    geometry,
    bounds: geometry.boundingBox!.clone(),
  };
};

describe('chunked world adapter', () => {
  it('returns the exact nearest surface and a world-space point', () => {
    const adapter = new ChunkedWorldAdapter([chunk('near', 0), chunk('far', 20)]);
    const hit = adapter.queryNearest({ x: 0, y: 5, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit?.chunkId).toBe('near');
    expect(hit?.distance).toBeCloseTo(4, 4);
    expect(hit?.point.y).toBeCloseTo(1, 4);
    expect(adapter.getStats().lastBroadPhaseCandidates).toBe(1);
    adapter.dispose();
  });

  it('returns null outside the requested threshold', () => {
    const adapter = new ChunkedWorldAdapter([chunk('near', 0)]);
    expect(adapter.queryNearest({ x: 0, y: 20, z: 0 }, 3)).toBeNull();
    adapter.dispose();
  });

  it('selects the nearest of multiple broad-phase candidates', () => {
    const adapter = new ChunkedWorldAdapter([chunk('left', -5), chunk('right', 5)]);
    const hit = adapter.queryNearest({ x: 3.8, y: 5, z: 0 }, 20);
    expect(hit?.chunkId).toBe('right');
    expect(adapter.getStats().lastBroadPhaseCandidates).toBe(2);
    adapter.dispose();
  });
});
