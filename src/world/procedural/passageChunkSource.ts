import { BufferAttribute, BufferGeometry, LoadingManager, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ChunkSource, ChunkSourceRequest } from '../chunkSource';
import { fingerprintValues } from '../deterministic';
import { disposeWorldScenes } from '../imports/sceneAnalyzer';
import { inspectWorldGlb } from '../imports/worldGlbPreflight';
import type { GeneratedChunk } from '../worldTypes';
import { analyzeWorldModule } from './moduleCatalog';
import { createPassageRecipe, PASSAGE_GRAMMAR_VERSION } from './passageGrammar';
import { SKY_HEIGHT } from '../../game/skyJourney';

const moduleSha256 = 'beee1f74c06a1caebd71e993c547b6ceb3057cea1b3a0035311e8431a3c26d88';

export type PassageRecipe = ReturnType<typeof createPassageRecipe>;
export interface PassageCatalog {
  recipe: PassageRecipe;
  dispose(): void;
}

async function loadCityPassages(seed: number, signal: AbortSignal): Promise<PassageCatalog> {
  const url = new URL('./world-modules/celadon-court.glb', document.baseURI);
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
  if (!response.ok) throw new Error('Cannot load the built-in passage module');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 256 * 1024) throw new Error('Built-in passage module exceeds its size budget');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== moduleSha256) throw new Error('Built-in passage module failed its SHA-256 check');
  inspectWorldGlb(bytes);
  const manager = new LoadingManager().setURLModifier(() => {
    throw new Error('The built-in passage module must be self-contained');
  });
  const { scene, scenes, animations } = await new GLTFLoader(manager).parseAsync(bytes, '');
  let collision: BufferGeometry | undefined;
  const dispose = () => {
    collision?.dispose();
    disposeWorldScenes(scenes);
  };
  try {
    signal.throwIfAborted();
    if (animations.length) throw new Error('Passage modules must be static');
    const module = analyzeWorldModule('celadon-court', sha256, scene);
    collision = module.collision;
    return { recipe: createPassageRecipe(seed, [module]), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

const appendCollision = (base: BufferGeometry, extra: BufferGeometry, elevation: number): BufferGeometry => {
  const basePositions = base.getAttribute('position');
  const passagePositions = extra.getAttribute('position');
  const indices = base.getIndex();
  const baseCount = indices?.count ?? basePositions.count;
  const merged = new Float32Array((baseCount + passagePositions.count) * 3);
  const point = new Vector3();
  for (let i = 0; i < baseCount; i++) {
    point.fromBufferAttribute(basePositions, indices?.getX(i) ?? i).toArray(merged, i * 3);
  }
  for (let i = 0; i < passagePositions.count; i++) {
    point.fromBufferAttribute(passagePositions, i);
    point.y += elevation;
    point.toArray(merged, (baseCount + i) * 3);
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(merged, 3));
};

/** Add local geometry before WorldStreamer installs the authoritative chunk BVH. */
export class PassageChunkSource implements ChunkSource {
  private readonly controller = new AbortController();
  private pending: Promise<PassageCatalog | null> | undefined;
  private catalog: PassageCatalog | undefined;

  constructor(
    private readonly base: ChunkSource,
    private readonly seed: number,
    private readonly airspaceCeiling: number,
    private readonly load = loadCityPassages,
  ) {}

  async generate(request: ChunkSourceRequest): Promise<GeneratedChunk> {
    if (this.controller.signal.aborted) throw new Error('Passage source is disposed');
    const eligible = request.chunkX % 2 === 0 && request.chunkZ % 2 === 0;
    if (eligible) {
      // Resolve the module before allocating a base chunk, so teardown can cancel the load.
      this.pending ??= this.load(this.seed, this.controller.signal).then(catalog => {
        if (this.controller.signal.aborted) {
          catalog.dispose();
          return null;
        }
        this.catalog = catalog;
        return catalog;
      }).catch(error => {
        if (!this.controller.signal.aborted) console.warn('Generated passages unavailable; using the base city.', error);
        return null;
      });
      await this.pending;
    }
    const chunk = await this.base.generate(request);
    if (!eligible || !this.catalog || this.controller.signal.aborted) return chunk;

    const started = performance.now();
    const passage = this.catalog.recipe.generate(request.chunkX, request.chunkZ);
    const bounds = passage.collision.boundingBox!;
    const floor = Math.max(chunk.bounds.max.y, this.airspaceCeiling) + 16;
    const height = Math.max(0, floor - bounds.min.y);
    // Leave the climb into Sky Inversion clear.
    if (bounds.max.y + height > SKY_HEIGHT - 30) {
      passage.dispose();
      return chunk;
    }
    const collisionGeometry = appendCollision(chunk.collisionGeometry, passage.collision, height);
    collisionGeometry.computeBoundingBox();
    chunk.collisionGeometry.dispose();
    passage.render.position.set(0, height, 0);
    passage.corridor.translate(new Vector3(0, height, 0));
    chunk.group.add(passage.render);
    return {
      ...chunk,
      bounds: collisionGeometry.boundingBox!.clone(),
      collisionGeometry,
      collisionTree: undefined,
      fingerprint: fingerprintValues(chunk.fingerprint, 'generated-passage', PASSAGE_GRAMMAR_VERSION),
      synchronousBuildMs: (chunk.synchronousBuildMs ?? 0) + performance.now() - started,
      stats: {
        ...chunk.stats,
        buildings: chunk.stats.buildings + passage.placements,
        renderTriangles: chunk.stats.renderTriangles + passage.renderTriangles,
        collisionTriangles: collisionGeometry.getAttribute('position').count / 3,
      },
      passage: { corridor: passage.corridor, dispose: passage.dispose },
    };
  }

  dispose(): void {
    if (this.controller.signal.aborted) return;
    this.controller.abort();
    this.base.dispose();
    this.catalog?.dispose();
    this.catalog = undefined;
  }
}
