import { ChunkGenerator } from './chunkGenerator';
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

const yieldToBrowser = (): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, 0);
});

/**
 * One chunk is produced per asynchronous task. Geometry creation remains on the main thread,
 * but the streamer can cancel queued work and never generates the whole city in a physics tick.
 */
export class InlineChunkSource implements ChunkSource {
  private readonly generator: ChunkGenerator;
  private disposed = false;

  public constructor(settings: WorldSettings) {
    this.generator = new ChunkGenerator(settings);
  }

  public async generate(request: ChunkSourceRequest): Promise<GeneratedChunk> {
    await yieldToBrowser();
    if (this.disposed) throw new Error('Chunk source was disposed before generation started.');
    return this.generator.generate(request.chunkX, request.chunkZ, request.revision);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generator.dispose();
  }
}
