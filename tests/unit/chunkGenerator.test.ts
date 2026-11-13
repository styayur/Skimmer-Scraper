import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkGenerator } from '../../src/world/chunkGenerator';
import type { WorldMaterials, WorldMaterialKey } from '../../src/world/materials';
import { stableBoundaryProfile } from '../../src/world/stableBoundary';
import { resolveWorldSettings } from '../../src/world/worldConfig';
import type { BillboardMaterialSet } from '../../src/world/signage';

const MATERIAL_KEYS: WorldMaterialKey[] = [
  'shellCeladon', 'shellPlum', 'shellIvory', 'glass', 'rose', 'teal', 'windowWarm',
  'bridge', 'rock', 'soil', 'wood', 'blossom', 'water', 'ground',
];

const fakeMaterials = (): WorldMaterials => {
  const byKey = Object.fromEntries(
    MATERIAL_KEYS.map((key) => [key, new THREE.MeshBasicMaterial()]),
  ) as unknown as Record<WorldMaterialKey, THREE.Material>;
  return { byKey, dispose: () => Object.values(byKey).forEach((material) => material.dispose()) };
};

const fakeBillboards = (): BillboardMaterialSet => {
  const material = new THREE.MeshBasicMaterial();
  return { materials: [material], dispose: () => material.dispose() };
};

const geometryChecksum = (chunk: ReturnType<ChunkGenerator['generate']>): number => {
  const positions = chunk.collisionGeometry.getAttribute('position').array;
  let hash = 2166136261;
  for (let index = 0; index < positions.length; index += 17) {
    hash ^= Math.round(Number(positions[index]) * 100);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const disposeChunk = (chunk: ReturnType<ChunkGenerator['generate']>): void => {
  chunk.group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  chunk.collisionGeometry.dispose();
};

describe('deterministic chunk generation', () => {
  it('repeats the same fingerprint and geometry for the same seed and coordinate', () => {
    const settings = resolveWorldSettings({ seed: 'phase-2-stable', preset: 'sakura' });
    const a = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const b = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const left = a.generate(2, -2);
    const right = b.generate(2, -2);
    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.stats).toEqual(right.stats);
    expect(left.stats.buildings).toBeGreaterThan(0);
    expect(geometryChecksum(left)).toBe(geometryChecksum(right));
    disposeChunk(left);
    disposeChunk(right);
    a.dispose();
    b.dispose();
  });

  it('is independent of generation order', () => {
    const settings = resolveWorldSettings({ seed: 'order-independent', preset: 'neon' });
    const a = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const b = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const a00 = a.generate(0, 0);
    const a10 = a.generate(1, 0);
    const b10 = b.generate(1, 0);
    const b00 = b.generate(0, 0);
    expect(a00.fingerprint).toBe(b00.fingerprint);
    expect(a10.fingerprint).toBe(b10.fingerprint);
    expect(geometryChecksum(a00)).toBe(geometryChecksum(b00));
    for (const chunk of [a00, a10, b10, b00]) disposeChunk(chunk);
    a.dispose();
    b.dispose();
  });

  it('produces clearly different layouts for different seeds and presets', () => {
    const firstSettings = resolveWorldSettings({ seed: 'seed-a', preset: 'sakura' });
    const secondSettings = resolveWorldSettings({ seed: 'seed-b', preset: 'sakura' });
    const neonSettings = resolveWorldSettings({ seed: 'seed-a', preset: 'neon' });
    const first = new ChunkGenerator(firstSettings, fakeMaterials(), fakeBillboards());
    const second = new ChunkGenerator(secondSettings, fakeMaterials(), fakeBillboards());
    const neon = new ChunkGenerator(neonSettings, fakeMaterials(), fakeBillboards());
    const a = first.generate(2, -1);
    const b = second.generate(2, -1);
    const c = neon.generate(2, -1);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
    for (const chunk of [a, b, c]) disposeChunk(chunk);
    first.dispose();
    second.dispose();
    neon.dispose();
  });

  it('changes Ephemeral interiors without changing stable boundary data', () => {
    const settings = resolveWorldSettings({
      seed: 'ephemeral-interior',
      preset: 'neon',
      mode: 'ephemeral',
    });
    const generator = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const original = generator.generate(0, 0, 0);
    const revisited = generator.generate(0, 0, 7);
    const neighbor = generator.generate(1, 0, 3);
    expect(revisited.fingerprint).not.toBe(original.fingerprint);
    expect(geometryChecksum(revisited)).not.toBe(geometryChecksum(original));
    expect(stableBoundaryProfile(settings, 0, 0).fingerprint).toBe(
      stableBoundaryProfile(settings, 0, 0).fingerprint,
    );

    const originalGround = original.group.getObjectByName(`${original.key}-ground`) as THREE.Mesh;
    const neighborGround = neighbor.group.getObjectByName(`${neighbor.key}-ground`) as THREE.Mesh;
    const originalPositions = originalGround.geometry.getAttribute('position');
    const neighborPositions = neighborGround.geometry.getAttribute('position');
    const eastEdge = new Map<number, number>();
    const westEdge = new Map<number, number>();
    for (let index = 0; index < originalPositions.count; index += 1) {
      if (Math.abs(originalPositions.getX(index) - 220) < 0.001) {
        eastEdge.set(Math.round(originalPositions.getZ(index) * 1000), originalPositions.getY(index));
      }
    }
    for (let index = 0; index < neighborPositions.count; index += 1) {
      if (Math.abs(neighborPositions.getX(index)) < 0.001) {
        westEdge.set(Math.round(neighborPositions.getZ(index) * 1000), neighborPositions.getY(index));
      }
    }
    for (const [z, height] of eastEdge) expect(westEdge.get(z)).toBeCloseTo(height, 6);
    for (const chunk of [original, revisited, neighbor]) disposeChunk(chunk);
    generator.dispose();
  });

  it('shares exact terrain height samples across adjacent chunk edges', () => {
    const settings = resolveWorldSettings({ seed: 'edge-continuity', preset: 'archipelago' });
    const generator = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const west = generator.generate(0, 0);
    const east = generator.generate(1, 0);
    const westGround = west.group.getObjectByName(`${west.key}-ground`) as THREE.Mesh;
    const eastGround = east.group.getObjectByName(`${east.key}-ground`) as THREE.Mesh;
    const westPositions = westGround.geometry.getAttribute('position');
    const eastPositions = eastGround.geometry.getAttribute('position');
    const westEdge = new Map<number, number>();
    const eastEdge = new Map<number, number>();
    for (let index = 0; index < westPositions.count; index += 1) {
      if (Math.abs(westPositions.getX(index) - 220) < 0.001) {
        westEdge.set(Math.round(westPositions.getZ(index) * 1000), westPositions.getY(index));
      }
    }
    for (let index = 0; index < eastPositions.count; index += 1) {
      if (Math.abs(eastPositions.getX(index)) < 0.001) {
        eastEdge.set(Math.round(eastPositions.getZ(index) * 1000), eastPositions.getY(index));
      }
    }
    expect(westEdge.size).toBeGreaterThanOrEqual(7);
    for (const [z, y] of westEdge) expect(eastEdge.get(z)).toBeCloseTo(y, 6);
    disposeChunk(west);
    disposeChunk(east);
    generator.dispose();
  });
});
