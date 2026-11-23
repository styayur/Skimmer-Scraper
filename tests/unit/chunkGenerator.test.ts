import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkGenerator } from '../../src/world/chunkGenerator';
import type { WorldMaterials, WorldMaterialKey } from '../../src/world/materials';
import { stableBoundaryProfile } from '../../src/world/stableBoundary';
import { resolveWorldSettings } from '../../src/world/worldConfig';
import type { BillboardMaterialSet } from '../../src/world/signage';
import { ChunkedWorldAdapter } from '../../src/world/chunkedWorldAdapter';
import { cityDistrictAt } from '../../src/world/cityDistricts';
import { bridgeTiersAt } from '../../src/world/stableBoundary';
import { journeyWorld } from '../../src/world/journeyWorlds';

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
  it.each([
    [2,0,2587000363,'29dc317e85468b7b9193c6310f539debf93f2ab35f7bc768ab6c3a3599eaa4e7'],
    [2,3,812230528,'25b784652963a630078c87c47c5375be7162c301b5b0bd68f72d36cc493056df'],
    [3,0,3437653468,'ee515595ab1af15b3b86aff18a1b7454a6af6d234c8302bb2d7f2b3115e41f3b'],
    [3,3,204067496,'ec0e2dbe79f9c614f44c71f8ce1ac54c6dbbdba567aaa4dcb3f0c164fa744252'],
  ] as const)('preserves tagged v0.6 collision buffers for gen %i, journey %i', (generatorVersion, index, fingerprint, hash) => {
    const settings = journeyWorld(resolveWorldSettings({ seed: '334458', generatorVersion }), index);
    const generator = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const chunk = generator.generate(-2,1,3);
    const bytes = chunk.collisionGeometry.getAttribute('position').array;
    expect(chunk.fingerprint).toBe(fingerprint);
    expect(createHash('sha256').update(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength)).digest('hex')).toBe(hash);
    disposeChunk(chunk);
    generator.dispose();
  });
  it('keeps the launch corridor clear across 16 fixed dense-city seeds', () => {
    let buildings = 0;
    let bridges = 0;
    let islands = 0;
    for (let seed = 0; seed < 16; seed++) {
      const settings = resolveWorldSettings({ seed: String(seed) });
      const generator = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
      const chunks = [[0, 0], [-1, 0], [0, -1], [-1, -1], [2, 0], [3, 1]].map(([x, z]) => generator.generate(x, z));
      const adapter = new ChunkedWorldAdapter(chunks.map(chunk => ({
        id: chunk.key, chunkX: chunk.chunkX, chunkZ: chunk.chunkZ, origin: chunk.origin,
        bounds: chunk.bounds, geometry: chunk.collisionGeometry,
      })));
      for (let z = -184; z <= 120; z += 2) {
        const hit = adapter.queryNearest({ x: 0, y: 24, z }, 32);
        expect(hit?.distance, `seed ${seed}, runway z=${z}`).toBeGreaterThan(6.5);
      }
      for (const chunk of chunks) {
        buildings += chunk.stats.buildings;
        bridges += chunk.stats.bridges;
        islands += chunk.stats.islands;
        disposeChunk(chunk);
      }
      generator.dispose();
    }
    expect(buildings).toBeGreaterThan(550);
    expect(bridges).toBeGreaterThan(210);
    expect(islands).toBeGreaterThan(13);
  });

  it('keeps dense districts and stacked bridge seams stable across revisions', () => {
    const settings = resolveWorldSettings({ seed: 'dense-seams', mode: 'ephemeral' });
    const generator = new ChunkGenerator(settings, fakeMaterials(), fakeBillboards());
    const west = generator.generate(2, -1, 0);
    const refreshed = generator.generate(2, -1, 8);
    const east = generator.generate(3, -1, 4);
    expect(west.fingerprint).not.toBe(refreshed.fingerprint);
    expect(stableBoundaryProfile(settings, 2, -1).bridges.filter(bridge => bridge.axis === 'x'))
      .toEqual(stableBoundaryProfile(settings, 3, -1).bridges.filter(bridge => bridge.axis === 'x'));
    const decks = Array.from({ length: 24 }, (_, line) => bridgeTiersAt(settings, 'x', line)).flat();
    expect(decks.some(deck => deck.supportBase !== undefined)).toBe(true);
    const before = cityDistrictAt(settings.seed, 220 - 0.01, -110);
    const after = cityDistrictAt(settings.seed, 220 + 0.01, -110);
    for (const key of ['towers', 'crossings', 'gardens'] as const) expect(before[key]).toBeCloseTo(after[key], 4);
    const sample = Array.from({ length: 20 }, (_, index) => cityDistrictAt(settings.seed, index * 110, 0).towers);
    expect(Math.max(...sample) - Math.min(...sample)).toBeGreaterThan(0.2);
    [west, refreshed, east].forEach(disposeChunk);
    generator.dispose();
  });

  it('retains urban density through all five palette and architecture changes', () => {
    const base = resolveWorldSettings();
    const worlds = Array.from({ length: 5 }, (_, index) => journeyWorld(base, index + 1));
    expect(new Set(worlds.map(world => world.seed)).size).toBe(5);
    expect(new Set(worlds.map(world => world.paletteHue)).size).toBe(5);
    expect(new Set(worlds.map(world => world.config.architecture)).size).toBe(3);
    for (const world of worlds) {
      expect(world.preset).toBe('city');
      expect(world.config.buildingDensity).toBeGreaterThanOrEqual(0.56);
    }
  });
  it('owns one shadow material per world and releases it with its generator', () => {
    const settings=resolveWorldSettings({seed:'shadow-lifetime'});
    const a=new ChunkGenerator(settings,fakeMaterials(),fakeBillboards());const b=new ChunkGenerator(settings,fakeMaterials(),fakeBillboards());
    const chunks=[a.generate(0,0),a.generate(1,0),b.generate(0,0)];
    const depths=chunks.map(chunk=>{const found=new Set<THREE.Material>();chunk.group.traverse(o=>{if(o instanceof THREE.Mesh&&o.castShadow)found.add(o.customDepthMaterial!);});expect(found.size).toBe(1);return [...found][0];});
    expect(depths[0]).toBe(depths[1]);expect(depths[0]).not.toBe(depths[2]);
    let disposed=0;depths[0].addEventListener('dispose',()=>disposed++);a.dispose();a.dispose();expect(disposed).toBe(1);expect(()=>a.generate(0,0)).toThrow('disposed');
    for(const chunk of chunks)disposeChunk(chunk);b.dispose();
  });
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
