import { RealmHorizon } from './realmHorizon';
import { RealmDetail } from './realmDetail';
import { RealmDragonFlight } from './dragonFlight';
import * as THREE from 'three';
import { CHUNK_SIZE, DENSE_GENERATOR_VERSION, type WorldSettings } from './worldConfig';
import { chunkKey, type ChunkSource } from './chunkSource';
import { InlineChunkSource } from './chunkSource';
import { ChunkedWorldAdapter, type WorldAdapterStats } from './chunkedWorldAdapter';
import { fingerprintValues } from './deterministic';
import { terrainHeightAt } from './terrain';
import type { RenderableWorld, SpawnState } from './renderWorld';
import type { CollisionChunk, GeneratedChunk, SurfaceQuery, WorldStats } from './worldTypes';
import type { Vec3 } from '../core/math';
import { ProceduralArchitecture } from './proceduralArchitecture';
import { UnifiedSurfaceQuery } from './unifiedSurfaceQuery';

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
  geometryBytes?: number;
  renderObjects?: number;
}

interface StreamForecast {
  heading: Vec3;
  samples: ReadonlyArray<{ seconds: number; position: Vec3 }>;
}

interface StreamIntent {
  forecast?: () => StreamForecast;
  inFlight?: boolean;
}

export interface StreamerStats {
  realmDetail?: ReturnType<RealmDetail['snapshot']>;
  stateCounts: Record<ChunkLifecycleState, number>;
  loadedChunks: number;
  activeChunks: number;
  queuedChunks: number;
  generatingChunks: number;
  generatedTotal: number;
  retiredTotal: number;
  disposedGeometryCount: number;
  bvhCount: number;
  dynamicBvhCount: number;
  renderObjectCount: number;
  estimatedCpuGeometryBytes: number;
  generationAvgMs: number;
  generationP95Ms: number;
  generationMinMs: number;
  generationMaxMs: number;
  generationSampleCount: number;
  synchronousBuildP95Ms: number | null;
  activationP95Ms: number;
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
const MAX_FORECAST_SECONDS = 4.5;
const PLAN_INTERVAL_MS = 90;
const RETENTION_MS = 1_250;
const RETENTION_PRIORITY = 30;

export interface GenerationTiming {
  count: number;
  average: number;
  min: number;
  max: number;
  p95: number;
}

export const summarizeGenerationTimes = (values: readonly number[]): GenerationTiming => {
  const sorted = [...values].sort((left, right) => left - right);
  const count = sorted.length;
  if (count === 0) return { count: 0, average: 0, min: 0, max: 0, p95: 0 };
  const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
  return {
    count,
    average: sorted.reduce((sum, value) => sum + value, 0) / count,
    min: sorted[0]!,
    max: sorted[count - 1]!,
    p95: sorted[p95Index]!,
  };
};

const addTiming = (history: number[], duration: number): GenerationTiming => {
  history.push(duration);
  if (history.length > 200) history.shift();
  return summarizeGenerationTimes(history);
};

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
  private readonly surfaces = new UnifiedSurfaceQuery(this.adapter);
  private readonly detail?: RealmDetail;
  private readonly horizon?: RealmHorizon;
  private readonly architecture: ProceduralArchitecture | RealmDragonFlight | null;
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
  private readonly synchronousBuildTimes: number[] = [];
  private readonly activationTimes: number[] = [];
  private generationTiming = summarizeGenerationTimes([]);
  private synchronousBuildP95Ms: number | null = null;
  private activationP95Ms = 0;
  private readonly renderOrigin = { x: 0, y: 0, z: 0 };
  private lastPosition = { x: 0, y: 24, z: SPAWN_Z };
  private lastVelocity = { x: 0, y: 0, z: -1 };
  private lastIntent: StreamIntent = {};
  private planAfter = 0;
  private plannedCenter = '';
  private plannedInFlight = false;
  private plannedVelocity = { x: 0, z: 0 };
  private companionFootprint = '';
  private companionPositions: Array<{ x: number; y: number; z: number }> = [];
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
    if (settings.theme === 'dragon') {
      this.detail = new RealmDetail(settings.seed);
      this.horizon = new RealmHorizon(settings.seed);
      this.root.add(this.horizon.group);
    }
    this.source = options.source ?? new InlineChunkSource(settings);
    this.renderRadius = Math.max(1, Math.trunc(options.renderRadius ?? 2));
    this.collisionRadius = Math.max(1, Math.trunc(options.collisionRadius ?? 1));
    this.maxLoadedChunks = Math.max((this.collisionRadius * 2 + 1) ** 2, options.maxLoadedChunks ?? 41);
    this.revisionProvider = options.revisionProvider ?? (() => 0);
    this.onChunkActivated = options.onChunkActivated ?? (() => {});
    this.onChunkRetired = options.onChunkRetired ?? (() => {});
    this.root.name = `world-stream-${settings.seed}`;
    this.architecture = settings.theme === 'dragon' ? new RealmDragonFlight(settings.seed,this.surfaces.dynamic) : settings.generatorVersion >= DENSE_GENERATOR_VERSION
      ? new ProceduralArchitecture(settings, this.surfaces.dynamic) : null;
    if (this.architecture) this.root.add(this.architecture.group);
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
    position: Vec3,
    velocity: Vec3,
    intent: StreamIntent = {},
  ): StreamerUpdate {
    if (this.disposed) {
      return { coverageComplete: false, rebaseDelta: null, stats: this.getStreamerStats() };
    }
    this.lastPosition = { ...position };
    this.lastVelocity = { ...velocity };
    this.lastIntent = intent;
    const rebaseDelta = this.maybeRebase(position);
    this.architecture?.cover(position, this.companionPositions);
    if(this.detail) this.detail.update(position, velocity, this.isCollisionCovered(position));
    this.horizon?.cover(position);
    const now = performance.now();
    const centerX = Math.floor(position.x / CHUNK_SIZE);
    const centerZ = Math.floor(position.z / CHUNK_SIZE);
    const center = chunkKey(centerX, centerZ);
    const inFlight = intent.inFlight !== false;
    if (center !== this.plannedCenter || inFlight !== this.plannedInFlight || now >= this.planAfter
      || Math.hypot(velocity.x - this.plannedVelocity.x, velocity.z - this.plannedVelocity.z) >= 10) {
      this.plannedCenter = center;
      this.plannedInFlight = inFlight;
      this.plannedVelocity = { x: velocity.x, z: velocity.z };
      this.planAfter = now + PLAN_INTERVAL_MS;
      this.reconcileDesiredChunks(this.buildDesiredChunks(position, velocity, intent.forecast?.(), now, centerX, centerZ, inFlight), now);
    }

    return {
      coverageComplete: this.isCollisionCovered(position),
      rebaseDelta,
      stats: this.getStreamerStats(),
    };
  }

  private reconcileDesiredChunks(desired: Map<string, number>, now: number): void {

    for (const record of [...this.chunks.values()]) {
      const priority = desired.get(record.key);
      if (priority !== undefined) {
        record.priority = priority;
        if (record.priority < RETENTION_PRIORITY) record.lastUsed = now;
        if (record.state === 'RETIRING') record.state = 'GENERATING';
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

    this.processQueue();
  }
  public setCompanionPositions(positions: readonly { x: number; y: number; z: number }[]): void {
    this.companionPositions = positions.filter(position => Object.values(position).every(Number.isFinite)).slice(0, 3).map(position => ({ ...position }));
    const footprint = this.companionPositions.map(({ x, z }) => [x - 80, x + 80, z - 80, z + 80]
      .map(edge => Math.floor(edge / CHUNK_SIZE)).join(':')).join(';');
    if (footprint !== this.companionFootprint) {
      this.companionFootprint = footprint;
      this.planAfter = 0;
    }
  }

  public async prime(position = this.defaultSpawn.position, timeoutMs = 30_000): Promise<void> {
    const started = performance.now();
    while (!this.isCollisionCovered(position)) {
      this.update(position, { x: 0, y: 0, z: -1 }, { inFlight: false });
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
    return this.surfaces.queryNearest(position, maxDistance);
  }
  public queryProximity(position: Vec3, range: number) { return this.surfaces.queryProximity(position, range); }
  public queryStatic(position: Vec3, range: number) { return this.surfaces.queryStatic(position, range); }
  public sweepDynamic(from: Vec3, to: Vec3, radius: number) { return this.surfaces.sweepDynamic(from, to, radius); }
  public setRenderQuality(name:'balanced'|'high'): void { if(this.architecture instanceof RealmDragonFlight)this.architecture.setQuality(name); }
  public stepMotion(dt: number): void { this.architecture?.step(dt); }
  public resetMotion(): void { this.architecture?.reset(); }
  public getDynamicSnapshot() { return this.architecture?.snapshot() ?? []; }
  /** Agents require their swept envelope and 35 m prediction horizon, not a second 3x3 world. */
  public isCompanionCovered(position: { x: number; y: number; z: number }): boolean {
    const padding = 60;
    for (let z = Math.floor((position.z - padding) / CHUNK_SIZE); z <= Math.floor((position.z + padding) / CHUNK_SIZE); z++) {
      for (let x = Math.floor((position.x - padding) / CHUNK_SIZE); x <= Math.floor((position.x + padding) / CHUNK_SIZE); x++) {
        if (this.chunks.get(chunkKey(x, z))?.state !== 'ACTIVE') return false;
      }
    }
    return true;
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
      geometryBytesTotal += record.geometryBytes ?? 0;
      renderObjectCount += record.renderObjects ?? 0;
    }
    const timing = this.generationTiming;
    return {
      ...(this.detail ? {realmDetail:this.detail.snapshot()} : {}),
      stateCounts,
      loadedChunks: active,
      activeChunks: active,
      queuedChunks: stateCounts.QUEUED,
      generatingChunks: stateCounts.GENERATING,
      generatedTotal: this.generatedTotal,
      retiredTotal: this.retiredTotal,
      disposedGeometryCount: this.disposedGeometryCount,
      bvhCount: this.adapter.getStats().bvhCount,
      dynamicBvhCount: this.surfaces.dynamic.count,
      renderObjectCount,
      estimatedCpuGeometryBytes: geometryBytesTotal,
      generationAvgMs: timing.average,
      generationP95Ms: timing.p95,
      generationMinMs: timing.min,
      generationMaxMs: timing.max,
      generationSampleCount: timing.count,
      synchronousBuildP95Ms: this.synchronousBuildP95Ms,
      activationP95Ms: this.activationP95Ms,
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
    this.architecture?.dispose();
    this.horizon?.dispose();
    this.detail?.dispose();
    this.source.dispose();
    this.root.clear();
  }

  private buildDesiredChunks(
    position: Vec3,
    velocity: Vec3,
    forecast: StreamForecast | undefined,
    now: number,
    centerX: number,
    centerZ: number,
    inFlight: boolean,
  ): Map<string, number> {
    const desired = new Map<string, number>();
    const add = (x: number, z: number, priority: number): void => {
      const key = chunkKey(x, z);
      const current = desired.get(key);
      if (current === undefined || priority < current) desired.set(key, priority);
    };

    const collisionRing = (x: number, z: number, priority: number): void => {
      for (let dz = -this.collisionRadius; dz <= this.collisionRadius; dz++) {
        for (let dx = -this.collisionRadius; dx <= this.collisionRadius; dx++) {
          const offset = (Math.abs(dx) + Math.abs(dz)) / (1 + this.collisionRadius * 2);
          add(x + dx, z + dz, priority + offset * 0.5);
        }
      }
    };
    collisionRing(centerX, centerZ, 0);

    const speed = Math.hypot(velocity.x, velocity.z);
    const path = forecast?.samples ?? (speed > 1 ? [1, 2, 3, MAX_FORECAST_SECONDS].map(seconds => ({
      seconds, position: { x: position.x + velocity.x * seconds, y: position.y, z: position.z + velocity.z * seconds },
    })) : []);
    // The collision index becomes usable only after the BVH is registered. Predict
    // the same neighborhood the physics gate needs, with extra lead for slower devices.
    const activationLatency = inFlight ? this.activationP95Ms : 0;
    const lead = Math.min(2.7, 1.35 + 5 * (activationLatency || 90) / 1000);
    for (const sample of path) {
      const x = Math.floor(sample.position.x / CHUNK_SIZE);
      const z = Math.floor(sample.position.z / CHUNK_SIZE);
      if (x === centerX && z === centerZ) continue;
      if (sample.seconds <= lead) collisionRing(x, z, 2 + sample.seconds * 0.6);
      else collisionRing(x, z, 23 + sample.seconds);
    }

    // Keep each follower's swept/perception envelope in the same bounded index.
    for (const companion of this.companionPositions) {
      for (let z = Math.floor((companion.z - 80) / CHUNK_SIZE); z <= Math.floor((companion.z + 80) / CHUNK_SIZE); z++) {
        for (let x = Math.floor((companion.x - 80) / CHUNK_SIZE); x <= Math.floor((companion.x + 80) / CHUNK_SIZE); x++) add(x, z, 5);
      }
    }

    const heading = forecast?.heading ?? velocity;
    const headingLength = Math.hypot(heading.x, heading.z);
    const viewRadius = this.renderRadius + 1;
    for (let dz = -viewRadius; dz <= viewRadius; dz++) {
      for (let dx = -viewRadius; dx <= viewRadius; dx++) {
        const radius = Math.max(Math.abs(dx), Math.abs(dz));
        if (radius <= this.collisionRadius) continue;
        const direction = headingLength > 0.01 ? (dx * heading.x + dz * heading.z) / (Math.hypot(dx, dz) * headingLength) : 0;
        if (radius === viewRadius && direction < 0.65) continue;
        add(centerX + dx, centerZ + dz, 12 + radius * 2 - direction * 3);
      }
    }

    // Preserve recent nearby geometry when the player crosses back or reverses.
    // These entries cannot displace any requested collision or visible cell.
    if (inFlight) {
      for (const record of this.chunks.values()) {
        if (!isActive(record) || now - record.lastUsed > RETENTION_MS) continue;
        const radius = Math.max(Math.abs(record.chunkX - centerX), Math.abs(record.chunkZ - centerZ));
        if (radius <= viewRadius) add(record.chunkX, record.chunkZ, RETENTION_PRIORITY + radius);
      }
    }
    const ordered = [...desired.entries()].sort((a, b) => a[1] - b[1]);
    const safetyChunks = ordered.filter(([, priority]) => priority < 10).length;
    const visualLimit = Math.max(30, 36 - Math.floor(Math.max(0, activationLatency - 70) / 18));
    const budget = Math.min(this.maxLoadedChunks, Math.max(safetyChunks, visualLimit));
    return new Map(ordered.slice(0, budget));
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
        this.generationTiming = addTiming(this.generationTimes, duration);
        if (generated.synchronousBuildMs !== undefined) {
          this.synchronousBuildP95Ms = addTiming(this.synchronousBuildTimes, generated.synchronousBuildMs).p95;
        }
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
        try {
          this.adapter.addChunk({
            id: generated.key,
            chunkX: generated.chunkX,
            chunkZ: generated.chunkZ,
            origin: generated.origin,
            bounds: generated.bounds,
            geometry: generated.collisionGeometry,
          } satisfies CollisionChunk);
        } catch (error) {
          this.disposeGenerated(generated);
          throw error;
        }
        let bytes = geometryBytes(generated.collisionGeometry);
        let renderObjects = 0;
        generated.group.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          renderObjects++;
          bytes += geometryBytes(object.geometry);
        });
        record.geometryBytes = bytes;
        record.renderObjects = renderObjects;
        this.root.add(generated.group);
        this.detail?.attach(generated.key,generated.group);
        record.state = 'ACTIVE';
        record.generated = generated;
        this.generatedTotal += 1;
        this.activationP95Ms = addTiming(this.activationTimes, performance.now() - started).p95;
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
          if (!this.disposed) this.update(this.lastPosition, this.lastVelocity, this.lastIntent);
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
      this.detail?.detach(record.generated.key);
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
    this.architecture?.shiftOrigin(this.renderOrigin);
    this.horizon?.shiftOrigin(this.renderOrigin);
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
