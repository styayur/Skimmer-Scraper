import * as THREE from 'three';
import { CHUNK_SIZE, type WorldSettings } from './worldConfig';
import { chunkKey, type ChunkSource } from './chunkSource';
import { InlineChunkSource } from './chunkSource';
import { ChunkedWorldAdapter, type WorldAdapterStats } from './chunkedWorldAdapter';
import { fingerprintValues } from './deterministic';
import { terrainHeightAt } from './terrain';
import type { RenderableWorld, SpawnState } from './renderWorld';
import type { CollisionChunk, GeneratedChunk, SurfaceQuery, WorldStats } from './worldTypes';

export type ChunkLifecycleState =
  | 'UNLOADED'
  | 'QUEUED'
  | 'GENERATING'
  | 'READY'
  | 'ACTIVE'
  | 'RETIRING'
  | 'DISPOSED';

interface ManagedChunk {
  key: string;
  chunkX: number;
  chunkZ: number;
  revision: number;
  state: ChunkLifecycleState;
  priority: number;
  lastUsed: number;
  requestToken: number;
  generated?: GeneratedChunk;
}

export interface StreamerStats {
  stateCounts: Record<ChunkLifecycleState, number>;
  loadedChunks: number;
  activeChunks: number;
  queuedChunks: number;
  generatingChunks: number;
  generatedTotal: number;
  retiredTotal: number;
  disposedGeometryCount: number;
  bvhCount: number;
  renderObjectCount: number;
  estimatedCpuGeometryBytes: number;
  generationAvgMs: number;
  generationP95Ms: number;
  maxLoadedChunks: number;
  coverageComplete: boolean;
  rebaseCount: number;
}

export interface StreamerUpdate {
  coverageComplete: boolean;
  rebaseDelta: { x: number; y: number; z: number } | null;
  stats: StreamerStats;
}

export interface ChunkStreamEvent {
  chunkX: number;
  chunkZ: number;
  revision: number;
}

export interface WorldStreamerOptions {
  source?: ChunkSource;
  maxLoadedChunks?: number;
  renderRadius?: number;
  collisionRadius?: number;
  revisionProvider?: (chunkX: number, chunkZ: number) => number;
  onChunkActivated?: (event: ChunkStreamEvent) => void;
  onChunkRetired?: (event: ChunkStreamEvent) => void;
}

const SPAWN_X = 0;
const SPAWN_Z = 120;
const ORIGIN_REBASE_THRESHOLD = 12_000;
const ORIGIN_REBASE_STEP = 10_000;
const LOOK_AHEAD_SECONDS = 4;

const emptyStateCounts = (): Record<ChunkLifecycleState, number> => ({
  UNLOADED: 0,
  QUEUED: 0,
  GENERATING: 0,
  READY: 0,
  ACTIVE: 0,
  RETIRING: 0,
  DISPOSED: 0,
});

const geometryBytes = (geometry: THREE.BufferGeometry): number => {
  let bytes = 0;
  for (const attribute of Object.values(geometry.attributes)) {
    const array = attribute.array as ArrayLike<number> & { byteLength?: number };
    bytes += array.byteLength ?? attribute.count * attribute.itemSize * 4;
  }
  if (geometry.index) bytes += geometry.index.array.byteLength;
  return bytes;
};

const isActive = (record: ManagedChunk): boolean => record.state === 'ACTIVE';

export class WorldStreamer implements RenderableWorld {
  public readonly root = new THREE.Group();
  public readonly adapter = new ChunkedWorldAdapter();
  public readonly source: ChunkSource;
  public readonly settings: WorldSettings;
  public readonly fingerprint: number;
  public readonly defaultSpawn: SpawnState;

  private readonly chunks = new Map<string, ManagedChunk>();
  private readonly maxLoadedChunks: number;
  private readonly renderRadius: number;
  private readonly collisionRadius: number;
  private readonly revisionProvider: (chunkX: number, chunkZ: number) => number;
  private readonly onChunkActivated: (event: ChunkStreamEvent) => void;
  private readonly onChunkRetired: (event: ChunkStreamEvent) => void;
  private readonly generationTimes: number[] = [];
  private readonly renderOrigin = { x: 0, y: 0, z: 0 };
  private lastPosition = { x: 0, y: 24, z: SPAWN_Z };
  private lastVelocity = { x: 0, y: 0, z: -1 };
  private requestToken = 0;
  private inFlight = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private generatedTotal = 0;
  private retiredTotal = 0;
  private disposedGeometryCount = 0;
  private rebaseCount = 0;
  private disposed = false;

  public constructor(settings: WorldSettings, options: WorldStreamerOptions = {}) {
    this.settings = settings;
    this.source = options.source ?? new InlineChunkSource(settings);
    this.maxLoadedChunks = Math.max(9, options.maxLoadedChunks ?? 41);
    this.renderRadius = Math.max(1, options.renderRadius ?? 2);
    this.collisionRadius = Math.max(1, options.collisionRadius ?? 1);
    this.revisionProvider = options.revisionProvider ?? (() => 0);
    this.onChunkActivated = options.onChunkActivated ?? (() => {});
    this.onChunkRetired = options.onChunkRetired ?? (() => {});
    this.root.name = `world-stream-${settings.seed}`;
    const ground = terrainHeightAt(SPAWN_X, SPAWN_Z, settings);
    this.defaultSpawn = {
      position: { x: SPAWN_X, y: ground + 24, z: SPAWN_Z },
      yaw: 0,
      pitch: -0.015,
      speed: 66,
    };
    this.fingerprint = fingerprintValues(
      settings.seed,
      settings.generatorVersion,
      settings.preset,
      settings.config.buildingDensity,
      settings.config.buildingHeightMin,
      settings.config.buildingHeightMax,
      settings.config.streetSpacing,
      settings.config.islandFrequency,
      settings.config.terrainAmplitude,
    );
  }

  public update(
    position: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
  ): StreamerUpdate {
    if (this.disposed) {
      return { coverageComplete: false, rebaseDelta: null, stats: this.getStreamerStats() };
    }
    this.lastPosition = { ...position };
    this.lastVelocity = { ...velocity };
    const rebaseDelta = this.maybeRebase(position);
    const desired = this.buildDesiredChunks(position, velocity);
    const now = performance.now();

    for (const record of [...this.chunks.values()]) {
      if (desired.has(record.key)) {
        record.priority = desired.get(record.key)!;
        record.lastUsed = now;
      } else if (record.state === 'QUEUED') {
        this.chunks.delete(record.key);
      } else if (record.state === 'ACTIVE' || record.state === 'READY') {
        this.retireChunk(record);
      } else if (record.state === 'GENERATING') {
        record.state = 'RETIRING';
      }
    }

    for (const [key, priority] of desired) {
      if (this.chunks.has(key)) continue;
      const [chunkX, chunkZ] = key.split(':').map(Number) as [number, number];
      this.chunks.set(key, {
        key,
        chunkX,
        chunkZ,
        revision: this.revisionProvider(chunkX, chunkZ),
        state: 'QUEUED',
        priority,
        lastUsed: now,
        requestToken: 0,
      });
    }

    this.enforceBudget(position);
    this.processQueue();
    return {
      coverageComplete: this.isCollisionCovered(position),
      rebaseDelta,
      stats: this.getStreamerStats(),
    };
  }

  public async prime(position = this.defaultSpawn.position, timeoutMs = 30_000): Promise<void> {
    const started = performance.now();
    while (!this.isCollisionCovered(position)) {
      this.update(position, { x: 0, y: 0, z: -1 });
      if (performance.now() - started > timeoutMs) {
        throw new Error('Timed out while preparing collision chunks around the spawn.');
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 8));
    }
  }

  public getSpawn(): SpawnState {
    return {
      ...this.defaultSpawn,
      position: {
        x: this.defaultSpawn.position.x - this.renderOrigin.x,
        y: this.defaultSpawn.position.y,
        z: this.defaultSpawn.position.z - this.renderOrigin.z,
      },
    };
  }

  public getDefaultSpawn(): SpawnState {
    return {
      ...this.defaultSpawn,
      position: { ...this.defaultSpawn.position },
    };
  }

  public getLocalPosition(position: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    return {
      x: position.x - this.renderOrigin.x,
      y: position.y,
      z: position.z - this.renderOrigin.z,
    };
  }

  public getRenderOrigin(): { x: number; y: number; z: number } {
    return { ...this.renderOrigin };
  }

  public isCollisionCovered(position: { x: number; y: number; z: number }): boolean {
    const centerX = Math.floor(position.x / CHUNK_SIZE);
    const centerZ = Math.floor(position.z / CHUNK_SIZE);
    for (let dz = -this.collisionRadius; dz <= this.collisionRadius; dz += 1) {
      for (let dx = -this.collisionRadius; dx <= this.collisionRadius; dx += 1) {
        const record = this.chunks.get(chunkKey(centerX + dx, centerZ + dz));
        if (!record || record.state !== 'ACTIVE') return false;
      }
    }
    return true;
  }

  public queryNearest(position: { x: number; y: number; z: number }, maxDistance: number): SurfaceQuery | null {
    return this.adapter.queryNearest(position, maxDistance);
  }

  public getStats(): WorldStats {
    let buildings = 0;
    let bridges = 0;
    let islands = 0;
    let collisionTriangles = 0;
    let renderTriangles = 0;
    let active = 0;
    for (const record of this.chunks.values()) {
      if (!isActive(record) || !record.generated) continue;
      active += 1;
      buildings += record.generated.stats.buildings;
      bridges += record.generated.stats.bridges;
      islands += record.generated.stats.islands;
      collisionTriangles += record.generated.stats.collisionTriangles;
      renderTriangles += record.generated.stats.renderTriangles;
    }
    return { chunks: active, buildings, bridges, islands, collisionTriangles, renderTriangles };
  }

  public getFingerprint(): number {
    return this.fingerprint;
  }

  public getAdapterStats(): WorldAdapterStats {
    return this.adapter.getStats();
  }

  public getStreamerStats(): StreamerStats {
    const stateCounts = emptyStateCounts();
    let active = 0;
    let geometryBytesTotal = 0;
    let renderObjectCount = 0;
    for (const record of this.chunks.values()) {
      stateCounts[record.state] += 1;
      if (record.state !== 'ACTIVE' || !record.generated) continue;
      active += 1;
      geometryBytesTotal += geometryBytes(record.generated.collisionGeometry);
      record.generated.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        renderObjectCount += 1;
        geometryBytesTotal += geometryBytes(object.geometry);
      });
    }
    const sorted = [...this.generationTimes].sort((a, b) => a - b);
    const average = sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0;
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0;
    return {
      stateCounts,
      loadedChunks: active,
      activeChunks: active,
      queuedChunks: stateCounts.QUEUED,
      generatingChunks: stateCounts.GENERATING,
      generatedTotal: this.generatedTotal,
      retiredTotal: this.retiredTotal,
      disposedGeometryCount: this.disposedGeometryCount,
      bvhCount: this.adapter.getStats().bvhCount,
      renderObjectCount,
      estimatedCpuGeometryBytes: geometryBytesTotal,
      generationAvgMs: average,
      generationP95Ms: p95,
      maxLoadedChunks: this.maxLoadedChunks,
      coverageComplete: this.isCollisionCovered(this.lastPosition),
      rebaseCount: this.rebaseCount,
    };
  }

  public getChunkStates(): Array<{
    key: string;
    state: ChunkLifecycleState;
    revision: number;
    fingerprint: number | null;
  }> {
    return [...this.chunks.values()].map((record) => ({
      key: record.key,
      state: record.state,
      revision: record.revision,
      fingerprint: record.generated?.fingerprint ?? null,
    }));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    for (const record of [...this.chunks.values()]) this.retireChunk(record);
    this.chunks.clear();
    this.adapter.dispose();
    this.source.dispose();
    this.root.clear();
  }

  private buildDesiredChunks(
    position: { x: number; z: number },
    velocity: { x: number; z: number },
  ): Map<string, number> {
    const desired = new Map<string, number>();
    const centerX = Math.floor(position.x / CHUNK_SIZE);
    const centerZ = Math.floor(position.z / CHUNK_SIZE);
    const add = (x: number, z: number, priority: number): void => {
      const key = chunkKey(x, z);
      const current = desired.get(key);
      if (current === undefined || priority < current) desired.set(key, priority);
    };

    for (let dz = -this.collisionRadius; dz <= this.collisionRadius; dz += 1) {
      for (let dx = -this.collisionRadius; dx <= this.collisionRadius; dx += 1) {
        add(centerX + dx, centerZ + dz, Math.abs(dx) + Math.abs(dz));
      }
    }

    for (let dz = -this.renderRadius; dz <= this.renderRadius; dz += 1) {
      for (let dx = -this.renderRadius; dx <= this.renderRadius; dx += 1) {
        add(centerX + dx, centerZ + dz, 10 + Math.abs(dx) + Math.abs(dz));
      }
    }

    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 1) {
      const averageGenerationMs = this.generationTimes.length
        ? this.generationTimes.reduce((sum, value) => sum + value, 0) / this.generationTimes.length
        : 0;
      const latencySeconds = this.generationTimes.length
        ? Math.min(0.8, (averageGenerationMs / 1000) * 2)
        : 0.25;
      const horizonMeters = Math.min(720, speed * (LOOK_AHEAD_SECONDS + latencySeconds));
      const directionalX = velocity.x / speed;
      const directionalZ = velocity.z / speed;
      for (let distance = CHUNK_SIZE * 0.5; distance <= horizonMeters; distance += CHUNK_SIZE * 0.5) {
        const predictedX = Math.floor((position.x + directionalX * distance) / CHUNK_SIZE);
        const predictedZ = Math.floor((position.z + directionalZ * distance) / CHUNK_SIZE);
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            add(predictedX + dx, predictedZ + dz, 20 + distance / CHUNK_SIZE + Math.abs(dx) + Math.abs(dz));
          }
        }
      }
    }

    const ordered = [...desired.entries()].sort((a, b) => a[1] - b[1]).slice(0, this.maxLoadedChunks);
    return new Map(ordered);
  }

  private enforceBudget(position: { x: number; z: number }): void {
    const active = [...this.chunks.values()].filter(isActive);
    if (active.length <= this.maxLoadedChunks) return;
    active.sort((a, b) => {
      const da = Math.hypot((a.chunkX + 0.5) * CHUNK_SIZE - position.x, (a.chunkZ + 0.5) * CHUNK_SIZE - position.z);
      const db = Math.hypot((b.chunkX + 0.5) * CHUNK_SIZE - position.x, (b.chunkZ + 0.5) * CHUNK_SIZE - position.z);
      return db - da;
    });
    for (const record of active.slice(0, active.length - this.maxLoadedChunks)) {
      this.retireChunk(record);
    }
  }

  private processQueue(): void {
    if (this.disposed || this.inFlight >= 1) return;
    const next = [...this.chunks.values()]
      .filter((record) => record.state === 'QUEUED')
      .sort((a, b) => a.priority - b.priority || a.lastUsed - b.lastUsed)[0];
    if (!next) return;
    this.startGeneration(next);
  }

  private startGeneration(record: ManagedChunk): void {
    record.state = 'GENERATING';
    record.requestToken = ++this.requestToken;
    this.inFlight += 1;
    const started = performance.now();
    this.source.generate({ chunkX: record.chunkX, chunkZ: record.chunkZ, revision: record.revision })
      .then((generated) => {
        const duration = performance.now() - started;
        this.generationTimes.push(duration);
        if (this.generationTimes.length > 200) this.generationTimes.shift();
        if (this.disposed || record.requestToken === 0 || record.state !== 'GENERATING') {
          this.disposeGenerated(generated);
          if (record.state === 'RETIRING') this.retiredTotal += 1;
          record.state = 'DISPOSED';
          this.chunks.delete(record.key);
          return;
        }
        generated.group.position.set(
          generated.origin.x - this.renderOrigin.x,
          generated.origin.y,
          generated.origin.z - this.renderOrigin.z,
        );
        this.root.add(generated.group);
        this.adapter.addChunk({
          id: generated.key,
          chunkX: generated.chunkX,
          chunkZ: generated.chunkZ,
          origin: generated.origin,
          bounds: generated.bounds,
          geometry: generated.collisionGeometry,
        } satisfies CollisionChunk);
        record.state = 'ACTIVE';
        record.generated = generated;
        this.generatedTotal += 1;
        if (!this.disposed) {
          try {
            this.onChunkActivated({
              chunkX: record.chunkX,
              chunkZ: record.chunkZ,
              revision: record.revision,
            });
          } catch (error) {
            console.error('Chunk activation observer failed', record.key, error);
          }
        }
      })
      .catch((error: unknown) => {
        record.state = 'UNLOADED';
        this.chunks.delete(record.key);
        if (this.disposed) return;
        console.error('Chunk generation failed', record.key, error);
        if (this.retryTimer !== null) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          if (!this.disposed) this.update(this.lastPosition, this.lastVelocity);
        }, 400);
      })
      .finally(() => {
        this.inFlight = Math.max(0, this.inFlight - 1);
        if (!this.disposed) this.processQueue();
      });
  }

  private retireChunk(record: ManagedChunk): void {
    if (record.state === 'DISPOSED') return;
    if (record.state === 'GENERATING') {
      record.state = 'RETIRING';
      return;
    }
    if (record.generated) {
      this.adapter.removeChunk(record.generated.key);
      this.root.remove(record.generated.group);
      this.disposeGenerated(record.generated);
      this.retiredTotal += 1;
      record.generated = undefined;
      if (!this.disposed) {
        try {
          this.onChunkRetired({
            chunkX: record.chunkX,
            chunkZ: record.chunkZ,
            revision: record.revision,
          });
        } catch (error) {
          console.error('Chunk retirement observer failed', record.key, error);
        }
      }
    }
    record.state = 'DISPOSED';
    this.chunks.delete(record.key);
  }

  private disposeGenerated(generated: GeneratedChunk): void {
    generated.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      this.disposedGeometryCount += 1;
    });
    generated.collisionGeometry.dispose();
    this.disposedGeometryCount += 1;
  }

  private maybeRebase(position: { x: number; z: number }): { x: number; y: number; z: number } | null {
    const nextX = Math.abs(position.x) >= ORIGIN_REBASE_THRESHOLD
      ? Math.trunc(position.x / ORIGIN_REBASE_STEP) * ORIGIN_REBASE_STEP
      : this.renderOrigin.x;
    const nextZ = Math.abs(position.z) >= ORIGIN_REBASE_THRESHOLD
      ? Math.trunc(position.z / ORIGIN_REBASE_STEP) * ORIGIN_REBASE_STEP
      : this.renderOrigin.z;
    if (nextX === this.renderOrigin.x && nextZ === this.renderOrigin.z) return null;
    const delta = { x: nextX - this.renderOrigin.x, y: 0, z: nextZ - this.renderOrigin.z };
    this.renderOrigin.x = nextX;
    this.renderOrigin.z = nextZ;
    this.rebaseCount += 1;
    for (const record of this.chunks.values()) {
      if (!record.generated) continue;
      record.generated.group.position.set(
        record.generated.origin.x - this.renderOrigin.x,
        record.generated.origin.y,
        record.generated.origin.z - this.renderOrigin.z,
      );
    }
    return delta;
  }
}
