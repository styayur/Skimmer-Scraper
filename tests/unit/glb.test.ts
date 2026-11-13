import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  assertSelfContainedGltfUris,
  inspectGlb,
  normalizeAircraft,
} from '../../src/model/glb';

const fixture = (): ArrayBuffer => {
  const bytes = Uint8Array.from(readFileSync('tests/fixtures/test-aircraft.glb'));
  return bytes.buffer;
};

describe('GLB inspection and aircraft normalization', () => {
  it('reads the triangle and metadata from a self-contained GLB fixture', () => {
    const result = inspectGlb(fixture());
    expect(result.triangles).toBe(4);
    expect(result.hasBinaryChunk).toBe(true);
    expect(result.generator).toContain('Skimmer-Scraper');
  });

  it('rejects non-GLB data and external resources', () => {
    expect(() => inspectGlb(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow(/too small|binary glTF/);
    expect(() => assertSelfContainedGltfUris({ images: [{ uri: 'https://example.com/a.png' }] }))
      .toThrow(/external URI/);
    expect(() => assertSelfContainedGltfUris({ images: [{ uri: 'data:image/png;base64,AA==' }] }))
      .not.toThrow();
  });

  it('centers and scales an imported model to the gameplay envelope', () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), new THREE.MeshBasicMaterial()));
    const normalized = normalizeAircraft(scene, 12);
    normalized.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(normalized.root);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(8, 3);
    expect(center.length()).toBeLessThan(0.001);
  });
});
