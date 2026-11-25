import { readFileSync } from 'node:fs';
import { BoxGeometry, Group, InstancedMesh, LOD, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { chunkKey, type ChunkSource } from '../../src/world/chunkSource';
import { scoreContextFor } from '../../src/game/storage';
import { journeyWorld } from '../../src/world/journeyWorlds';
import { disposeWorldScenes } from '../../src/world/imports/sceneAnalyzer';
import { analyzeWorldModule } from '../../src/world/procedural/moduleCatalog';
import { PassageChunkSource } from '../../src/world/procedural/passageChunkSource';
import { createPassageRecipe } from '../../src/world/procedural/passageGrammar';
import { buildWorldShareUrl, CHUNK_SIZE, worldSettingsFromSearch } from '../../src/world/worldConfig';
import { WorldStreamer } from '../../src/world/worldStreamer';
import type { GeneratedChunk } from '../../src/world/worldTypes';

it('keeps generation, link and record identity explicit and separate from the base city', () => {
  const plain = worldSettingsFromSearch('?seed=334458&gen=4');
  const experimental = worldSettingsFromSearch('?seed=334458&gen=4&passages=1');
  expect(experimental.generatedPassages).toBe(true);
  const copied = buildWorldShareUrl('https://example.test/flight/', experimental);
  expect(worldSettingsFromSearch(new URL(copied).search)).toEqual(experimental);
  expect(scoreContextFor(plain).worldAsset).toBeUndefined();
  expect(scoreContextFor(experimental).worldAsset).toBe('generated-passages-v1');
  expect(journeyWorld(experimental, 2).generatedPassages).toBe(true);
  expect(worldSettingsFromSearch('?seed=334458&gen=3&passages=1').generatedPassages).toBeUndefined();
});

it('streams the authored passage into the city BVH and retires its instance buffers with the chunk', async () => {
  const moduleBytes = Uint8Array.from(readFileSync('public/world-modules/celadon-court.glb')).buffer;
  const model = await new GLTFLoader().parseAsync(moduleBytes, '');
  const module = analyzeWorldModule('celadon-court', 'b'.repeat(64), model.scene);
  const recipe = createPassageRecipe(334458, [module]);
  const disposeCatalog = vi.fn(() => {
    module.collision.dispose();
    disposeWorldScenes(model.scenes);
  });
  const load = vi.fn(async () => ({ recipe, dispose: disposeCatalog }));
  const settings = worldSettingsFromSearch('?seed=334458&gen=4&passages=1');
  const base: ChunkSource = {
    async generate({ chunkX, chunkZ, revision }) {
      const collisionGeometry = new BoxGeometry(CHUNK_SIZE, 2, CHUNK_SIZE).translate(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
      collisionGeometry.computeBoundingBox();
      return {
        key: chunkKey(chunkX, chunkZ), chunkX, chunkZ, revision,
        origin: { x: chunkX * CHUNK_SIZE, y: 0, z: chunkZ * CHUNK_SIZE },
        group: new Group(),
        bounds: collisionGeometry.boundingBox!.clone(),
        collisionGeometry,
        fingerprint: 42,
        stats: { buildings: 0, bridges: 0, islands: 0, renderTriangles: 0, collisionTriangles: 12 },
      };
    },
    dispose: vi.fn(),
  };
  const passages = new PassageChunkSource(base, settings.seed, 380, load);
  let origin: GeneratedChunk | undefined;
  const source: ChunkSource = {
    async generate(request) {
      const generated = await passages.generate(request);
      if (generated.key === '0:0') origin = generated;
      return generated;
    },
    dispose: () => passages.dispose(),
  };
  const world = new WorldStreamer(settings, { source, renderRadius: 1, maxLoadedChunks: 12 });
  const stepNear = () => world.update({ x: 100, y: 300, z: 110 }, { x: 0, y: 0, z: 0 });
  const loadedOrigin = async () => {
    await vi.waitFor(() => {
      stepNear();
      expect(world.getChunkStates().find(chunk => chunk.key === '0:0')?.passage).toBeDefined();
    }, { timeout: 6000 });
    return origin!;
  };
  try {
    const chunk = await loadedOrigin();
    const fingerprint = chunk.fingerprint;
    const buffer = chunk.collisionGeometry.getAttribute('position').array.slice();
    const corridor = chunk.passage!.corridor;
    const center = corridor.getCenter(new Vector3());
    const z = corridor.max.z - 14;
    const inside = { x: center.x, y: center.y, z };
    const wall = { x: center.x + 7, y: center.y, z };
    expect(world.queryNearest(inside, 4)).toBeNull();
    expect(world.queryNearest(wall, 0.5)?.chunkId).toBe('0:0');
    expect(world.queryNearest({ x: 110, y: 1, z: 110 }, 0.5)?.chunkId).toBe('0:0');
    expect(corridor.min.y).toBeGreaterThanOrEqual(396);
    expect(world.getStreamerStats().passageChunks).toBeGreaterThan(0);

    const lod = chunk.group.getObjectByName('generated-passage-lod') as LOD;
    expect(lod).toBeInstanceOf(LOD);
    expect(lod.levels[0]!.object.children).toHaveLength(2);
    expect(lod.levels[1]!.object.children).toHaveLength(1);
    const camera = new PerspectiveCamera();
    const at = lod.getWorldPosition(new Vector3());
    camera.position.copy(at).add(new Vector3(0, 0, 500));
    camera.updateMatrixWorld();
    lod.update(camera);
    expect(lod.getCurrentLevel()).toBe(1);
    expect(world.queryNearest(wall, 0.5)?.chunkId).toBe('0:0');

    const visibleBatch = lod.levels[0]!.object.children[0] as InstancedMesh;
    const disposeInstances = vi.spyOn(visibleBatch, 'dispose');
    const sharedDisposal = vi.spyOn(visibleBatch.geometry, 'dispose');
    const collisionDisposal = vi.spyOn(chunk.collisionGeometry, 'dispose');
    await vi.waitFor(() => {
      world.update({ x: 9000, y: 300, z: 9000 }, { x: 0, y: 0, z: 0 });
      expect(world.getChunkStates().some(entry => entry.key === '0:0')).toBe(false);
    }, { timeout: 6000 });
    expect(world.queryNearest(wall, 0.5)).toBeNull();
    expect(disposeInstances).toHaveBeenCalledOnce();
    expect(collisionDisposal).toHaveBeenCalledOnce();
    expect(sharedDisposal).not.toHaveBeenCalled();

    const restored = await loadedOrigin();
    expect(restored.fingerprint).toBe(fingerprint);
    expect(restored.collisionGeometry.getAttribute('position').array).toEqual(buffer);
    expect(load).toHaveBeenCalledOnce();
    expect(world.getStreamerStats().activeChunks).toBeLessThanOrEqual(12);
  } finally {
    world.dispose();
  }
  expect(disposeCatalog).toHaveBeenCalledOnce();
}, 25000);
