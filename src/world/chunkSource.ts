import { DragonChunkGenerator } from './dragonRealm';
import { AscendantChunkGenerator } from './ascendantChunk';
import { ChunkGenerator } from './chunkGenerator';
import { MeshBVH } from 'three-mesh-bvh';
import type { CityWorkerResult } from './cityChunk.worker';
import type { GeneratedChunk } from './worldTypes';
import type { WorldSettings } from './worldConfig';

export const chunkKey = (chunkX: number, chunkZ: number): string => String(chunkX) + ':' + String(chunkZ);

export interface ChunkSourceRequest {
  chunkX: number;
  chunkZ: number;
  revision: number;
}

export interface ChunkSource {
  generate(request: ChunkSourceRequest): Promise<GeneratedChunk>;
  dispose(): void;
}

export class CityWorkerSource implements ChunkSource {
  private worker: Worker | null = null;
  private workerReady = false;
  private readonly generator: ChunkGenerator;
  private pending?: { resolve: (result: GeneratedChunk) => void; reject: (error: Error) => void };
  private disposed = false;

  constructor(settings: WorldSettings) {
    this.generator = new ChunkGenerator(settings);
    try {
      this.worker = new Worker(new URL('./cityChunk.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onerror = () => this.stopWorker(new Error('City geometry worker unavailable'));
      this.worker.onmessageerror = () => this.stopWorker(new Error('Invalid city geometry packet'));
      this.worker.onmessage = ({ data }: MessageEvent<'ready' | CityWorkerResult>) => {
        if (data === 'ready') {
          this.workerReady = true;
          return;
        }
        const pending = this.pending;
        if (!pending) return;
        try {
          const started = performance.now();
          const chunk = this.generator.assemble(data.packet);
          chunk.collisionTree = MeshBVH.deserialize(data.collisionTree, chunk.collisionGeometry);
          chunk.workerBuildMs = data.workerBuildMs;
          chunk.synchronousBuildMs = performance.now() - started;
          this.pending = undefined;
          pending.resolve(chunk);
        } catch (error) {
          this.stopWorker(error instanceof Error ? error : new Error(String(error)));
        }
      };
      this.worker.postMessage(settings);
    } catch {
      this.stopWorker(new Error('City geometry worker unavailable'));
    }
  }

  private stopWorker(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
    this.pending?.reject(error);
    this.pending = undefined;
  }

  async generate(request: ChunkSourceRequest): Promise<GeneratedChunk> {
    if (this.disposed) throw new Error('City source disposed');
    if (this.pending) throw new Error('City source already generating a chunk');
    // Spawn collision must remain available while the worker bundle is in transit.
    if (this.worker && this.workerReady) {
      try {
        return await new Promise<GeneratedChunk>((resolve, reject) => {
          this.pending = { resolve, reject };
          this.worker!.postMessage(request);
        });
      } catch (error) {
        if (this.disposed) throw error;
        this.stopWorker(new Error('Switching to inline city generation'));
      }
    }
    await yieldToBrowser();
    if (this.disposed) throw new Error('City source disposed');
    const started = performance.now();
    const chunk = this.generator.generate(request.chunkX, request.chunkZ, request.revision);
    chunk.synchronousBuildMs = performance.now() - started;
    return chunk;
  }

  dispose(): void {
    this.disposed = true;
    this.stopWorker(new Error('City source disposed'));
    this.generator.dispose();
  }
}

const yieldToBrowser = (): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, 0);
});

/**
 * One chunk is produced per asynchronous task. Geometry creation remains on the main thread,
 * but the streamer can cancel queued work and never generates the whole city in a physics tick.
 */
export class InlineChunkSource implements ChunkSource {
  private readonly generator: ChunkGenerator | DragonChunkGenerator | AscendantChunkGenerator;
  private disposed = false;

  public constructor(settings: WorldSettings) {
    this.generator = settings.theme === 'ascendant' ? new AscendantChunkGenerator(settings)
      : settings.theme === 'dragon' ? new DragonChunkGenerator(settings) : new ChunkGenerator(settings);
  }

  public async generate(request: ChunkSourceRequest): Promise<GeneratedChunk> {
    await yieldToBrowser();
    if (this.disposed) throw new Error('Chunk source was disposed before generation started.');
    const started = performance.now();
    const chunk = this.generator.generate(request.chunkX, request.chunkZ, request.revision);
    chunk.synchronousBuildMs = performance.now() - started;
    return chunk;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generator.dispose();
  }
}
