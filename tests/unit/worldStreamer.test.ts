import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ChunkSource, ChunkSourceRequest } from '../../src/world/chunkSource';
import { chunkKey } from '../../src/world/chunkSource';
import { ChunkRevisionHistory } from '../../src/world/chunkRevisionHistory';
import { resolveWorldSettings } from '../../src/world/worldConfig';
import { summarizeGenerationTimes, WorldStreamer } from '../../src/world/worldStreamer';
import type { GeneratedChunk } from '../../src/world/worldTypes';

const CHUNK_SIZE = 220;
const settings = resolveWorldSettings({ seed: 'streaming-tests', preset: 'sakura' });

interface FixtureState {
  generated: number;
  disposedGeometries: number;
  concurrent: number;
  maxConcurrent: number;
}

const createChunk = (
  request: ChunkSourceRequest,
  state?: FixtureState,
): GeneratedChunk => {
  const origin = {
    x: request.chunkX * CHUNK_SIZE,
    y: 0,
    z: request.chunkZ * CHUNK_SIZE,
  };
  const renderGeometry = new THREE.BoxGeometry(4, 4, 4);
  const collisionGeometry = new THREE.BufferGeometry();
  collisionGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    12, 0, 0,
    0, 12, 0,
  ], 3));
  collisionGeometry.computeBoundingBox();
  collisionGeometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(renderGeometry, material);
  mesh.position.set(6, 2, 6);
  const group = new THREE.Group();
  group.add(mesh);
  renderGeometry.addEventListener('dispose', () => {
    if (state) state.disposedGeometries += 1;
  });
  collisionGeometry.addEventListener('dispose', () => {
    if (state) state.disposedGeometries += 1;
  });
  if (state) state.generated += 1;
  return {
    key: chunkKey(request.chunkX, request.chunkZ),
    chunkX: request.chunkX,
    chunkZ: request.chunkZ,
    revision: request.revision,
    origin,
    group,
    bounds: new THREE.Box3(
      new THREE.Vector3(0, -4, 0),
      new THREE.Vector3(12, 12, 12),
    ),
    collisionGeometry,
    fingerprint: 0x1000 + request.revision,
    stats: {
      buildings: 1,
      bridges: 0,
      islands: 0,
      collisionTriangles: 1,
      renderTriangles: 12,
    },
  };
};

class ImmediateSource implements ChunkSource {
  public readonly state: FixtureState = {
    generated: 0,
    disposedGeometries: 0,
    concurrent: 0,
    maxConcurrent: 0,
  };
  public disposed = false;

  public async generate(request: ChunkSourceRequest): Promise<GeneratedChunk> {
    this.state.concurrent += 1;
    this.state.maxConcurrent = Math.max(this.state.maxConcurrent, this.state.concurrent);
    await Promise.resolve();
    this.state.concurrent -= 1;
    return createChunk(request, this.state);
  }

  public dispose(): void {
    this.disposed = true;
  }
}

interface PendingRequest {
  request: ChunkSourceRequest;
  resolve: (chunk: GeneratedChunk) => void;
}

class ManualSource implements ChunkSource {
  public readonly pending: PendingRequest[] = [];
  public disposed = false;

  public generate(request: ChunkSourceRequest): Promise<GeneratedChunk> {
    return new Promise((resolve) => {
      this.pending.push({ request, resolve });
    });
  }

  public resolveAll(): void {
    for (const pending of this.pending.splice(0)) {
      pending.resolve(createChunk(pending.request));
    }
  }

  public dispose(): void {
    this.disposed = true;
  }
}

const waitUntil = async (predicate: () => boolean, timeoutMs = 8_000): Promise<void> => {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for streamer state.');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

const settle = async (streamer: WorldStreamer): Promise<void> => {
  await waitUntil(() => {
    const stats = streamer.getStreamerStats();
    return stats.queuedChunks === 0 && stats.generatingChunks === 0;
  });
};

const cover = async (
  streamer: WorldStreamer,
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
): Promise<void> => {
  await waitUntil(() => {
    streamer.update(position, velocity);
    return streamer.isCollisionCovered(position);
  });
  await settle(streamer);
};

describe('world streamer lifecycle', () => {
  it('serves the current collision ring, then a predicted turn, before a remote wingmate', async () => {
    const source = new ManualSource();
    const streamer = new WorldStreamer(settings, { source });
    const current = { x: 20, y: 220, z: 20 };
    const predicted = { x: -225, y: 175, z: 19 };
    const follower = { x: 1_100, y: 205, z: 950 };
    streamer.setCompanionPositions([follower]);
    streamer.update(current, { x: 0, y: -20, z: -98 }, {
      forecast: () => ({ heading: { x: -1, y: -0.2, z: 0 }, samples: [{ position: predicted, seconds: 1.5 }] }),
    });
    try {
      expect(streamer.isCollisionCovered(current)).toBe(false);
      await waitUntil(() => {
        if (streamer.isCollisionCovered(current)) return source.pending.length > 0;
        source.resolveAll();
        return false;
      });
      expect(source.pending[0]?.request.chunkX).toBe(-2);
      expect(streamer.isCollisionCovered(predicted)).toBe(false);
      await waitUntil(() => {
        if (streamer.isCollisionCovered(predicted)) return true;
        source.resolveAll();
        return false;
      });
      expect(streamer.isCompanionCovered(follower)).toBe(false);
      expect(streamer.getStreamerStats().activationP95Ms).toBeGreaterThan(0);
    } finally {
      streamer.dispose();
      source.resolveAll();
    }
  });

  it('keeps the near visible edge warm through a reversal and releases it at the deadline', async () => {
    const now = vi.spyOn(performance, 'now');
    const streamer = new WorldStreamer(settings, { source: new ImmediateSource() });
    const center = { x: 100, y: 260, z: 110 };
    const moving = { x: 0, y: 0, z: -98 };
    const reversed = { x: 0, y: 0, z: 98 };
    const edge = () => streamer.getChunkStates().find(chunk => chunk.key === '0:-3')?.state;
    try {
      now.mockReturnValue(1_000);
      await cover(streamer, center, moving);
      expect(edge()).toBe('ACTIVE');
      now.mockReturnValue(1_600);
      await cover(streamer, center, reversed);
      expect(edge()).toBe('ACTIVE');
      now.mockReturnValue(2_300);
      await cover(streamer, center, reversed);
      expect(edge()).toBeUndefined();
      expect(streamer.getStreamerStats().activeChunks).toBeLessThanOrEqual(41);
    } finally {
      streamer.dispose();
      now.mockRestore();
    }
  });

  it('retains follower coverage in the shared budget and retires it after hints clear', async () => {
    const streamer = new WorldStreamer(settings, { source: new ImmediateSource(), maxLoadedChunks: 41 });
    const follower = { x: 0, y: 40, z: 900 };
    streamer.setCompanionPositions([follower, { x: 700, y: 30, z: 900 }, { x: -700, y: 30, z: 900 }]);
    const pilot = { x: 0, y: 24, z: -1200 };
    await cover(streamer, pilot, { x: 0, y: 0, z: -102 });
    expect(streamer.isCompanionCovered(follower)).toBe(true);
    expect(streamer.isCollisionCovered(pilot)).toBe(true);
    expect(streamer.getStreamerStats().activeChunks).toBeLessThanOrEqual(41);
    expect(streamer.getAdapterStats().bvhCount).toBe(streamer.getStreamerStats().activeChunks);
    streamer.setCompanionPositions([]);await cover(streamer,pilot,{x:0,y:0,z:-102});
    expect(streamer.isCompanionCovered(follower)).toBe(false);
    streamer.dispose();
  });
  it('reports generation p95 as an order statistic below a heavy-tail average', () => {
    const timing = summarizeGenerationTimes([...Array.from({ length: 20 }, () => 1), 10_000]);
    expect(timing.count).toBe(21);
    expect(timing.min).toBe(1);
    expect(timing.p95).toBe(1);
    expect(timing.max).toBe(10_000);
    expect(timing.average).toBeCloseTo(10_020 / 21);
    expect(timing.average).toBeGreaterThan(timing.p95);
    expect(timing.min).toBeLessThanOrEqual(timing.average);
    expect(timing.average).toBeLessThanOrEqual(timing.max);
    expect(timing.p95).toBeLessThanOrEqual(timing.max);
  });

  it('primes collision coverage and enforces one-at-a-time, bounded generation', async () => {
    const source = new ImmediateSource();
    const streamer = new WorldStreamer(settings, {
      source,
      renderRadius: 2,
      collisionRadius: 1,
      maxLoadedChunks: 17,
    });
    const spawn = { x: 0, y: 32, z: 120 };
    await streamer.prime(spawn);
    await settle(streamer);

    expect(streamer.isCollisionCovered(spawn)).toBe(true);
    expect(source.state.maxConcurrent).toBe(1);
    const stats = streamer.getStreamerStats();
    expect(stats.activeChunks).toBeLessThanOrEqual(17);
    expect(stats.activeChunks).toBeGreaterThanOrEqual(9);
    expect(stats.bvhCount).toBe(stats.activeChunks);
    expect(stats.coverageComplete).toBe(true);
    expect(stats.stateCounts.RETIRING).toBe(0);
    expect(stats.stateCounts.DISPOSED).toBe(0);

    streamer.dispose();
    expect(source.disposed).toBe(true);
    expect(streamer.getStreamerStats().activeChunks).toBe(0);
  });

  it('retires distant chunks and reports actual geometry disposal', async () => {
    const source = new ImmediateSource();
    const streamer = new WorldStreamer(settings, {
      source,
      renderRadius: 2,
      collisionRadius: 1,
      maxLoadedChunks: 17,
    });
    const start = { x: 0, y: 40, z: 0 };
    await streamer.prime(start);
    await settle(streamer);
    const before = streamer.getStreamerStats();

    await cover(streamer, { x: 8_800, y: 40, z: -4_400 }, { x: 110, y: 0, z: -55 });
    const after = streamer.getStreamerStats();

    expect(after.activeChunks).toBeLessThanOrEqual(17);
    expect(after.bvhCount).toBe(after.activeChunks);
    expect(after.loadedChunks).toBe(after.activeChunks);
    expect(after.generatedTotal).toBeGreaterThan(before.generatedTotal);
    expect(after.retiredTotal).toBeGreaterThan(0);
    expect(after.disposedGeometryCount).toBe(after.retiredTotal * 2);
    expect(source.state.disposedGeometries).toBe(after.disposedGeometryCount);
    expect(streamer.getChunkStates().every((chunk) => chunk.state !== 'RETIRING')).toBe(true);
    streamer.dispose();
  });

  it('advances Ephemeral revision only after a whole chunk is retired', async () => {
    const source = new ImmediateSource();
    const history = new ChunkRevisionHistory(64);
    const activated: string[] = [];
    const retired: string[] = [];
    const streamer = new WorldStreamer(settings, {
      source,
      renderRadius: 1,
      collisionRadius: 1,
      maxLoadedChunks: 17,
      revisionProvider: (chunkX, chunkZ) => history.revisionFor(chunkX, chunkZ),
      onChunkActivated: ({ chunkX, chunkZ, revision }) => {
        history.markActive(chunkX, chunkZ, revision);
        activated.push(chunkKey(chunkX, chunkZ));
      },
      onChunkRetired: ({ chunkX, chunkZ, revision }) => {
        history.markRetired(chunkX, chunkZ, revision);
        retired.push(chunkKey(chunkX, chunkZ));
      },
    });
    const home = { x: 20, y: 40, z: 140 };
    await streamer.prime(home);
    await settle(streamer);
    const before = streamer.getChunkStates().find((chunk) => chunk.key === '0:0');
    expect(before?.revision).toBe(0);
    expect(before?.fingerprint).toBe(0x1000);
    expect(history.snapshot().entries.find((entry) => entry.key === '0:0')?.revision).toBe(0);

    for (let offset = 0; offset < 3; offset += 1) {
      await cover(streamer, { x: 30 + offset, y: 40, z: 130 }, { x: 10, y: 0, z: -10 });
    }
    expect(streamer.getChunkStates().find((chunk) => chunk.key === '0:0')?.revision).toBe(0);

    await cover(streamer, { x: 4_420, y: 40, z: 140 }, { x: 100, y: 0, z: 0 });
    expect(streamer.getChunkStates().some((chunk) => chunk.key === '0:0')).toBe(false);
    expect(history.snapshot().entries.find((entry) => entry.key === '0:0')?.revision).toBe(1);
    await cover(streamer, home, { x: -100, y: 0, z: 0 });

    const after = streamer.getChunkStates().find((chunk) => chunk.key === '0:0');
    expect(after?.revision).toBe(1);
    expect(after?.fingerprint).toBe(0x1001);
    expect(history.snapshot().entries.find((entry) => entry.key === '0:0')?.revision).toBe(1);
    expect(activated).toContain('0:0');
    expect(retired).toContain('0:0');
    streamer.dispose();
  });

  it('cancels an in-flight generation when the aircraft leaves its region', async () => {
    const source = new ManualSource();
    const streamer = new WorldStreamer(settings, {
      source,
      renderRadius: 1,
      collisionRadius: 1,
      maxLoadedChunks: 17,
    });

    streamer.update({ x: 0, y: 40, z: 0 }, { x: 0, y: 0, z: -100 });
    await waitUntil(() => streamer.getStreamerStats().generatingChunks === 1);
    const firstStates = streamer.getChunkStates();
    const firstGenerating = firstStates.find((chunk) => chunk.state === 'GENERATING');
    expect(firstGenerating).toBeDefined();

    streamer.update({ x: 12_000, y: 40, z: 0 }, { x: 100, y: 0, z: 0 });
    expect(streamer.getChunkStates().some((chunk) => chunk.state === 'RETIRING')).toBe(true);

    source.resolveAll();
    await waitUntil(() => {
      source.resolveAll();
      const stats = streamer.getStreamerStats();
      return stats.generatingChunks === 0 && stats.queuedChunks === 0;
    });

    expect(streamer.getChunkStates().some((chunk) => chunk.key === firstGenerating?.key)).toBe(false);
    expect(streamer.getStreamerStats().retiredTotal).toBeGreaterThanOrEqual(1);
    expect(streamer.getStreamerStats().disposedGeometryCount).toBeGreaterThanOrEqual(2);
    streamer.dispose();
    expect(source.disposed).toBe(true);
  });

  it('stays bounded during a deterministic 15-minute curved flight', async () => {
    const source = new ImmediateSource();
    const streamer = new WorldStreamer(settings, {
      source,
      renderRadius: 1,
      collisionRadius: 1,
      maxLoadedChunks: 17,
    });
    const start = { x: 0, y: 42, z: 0 };
    await streamer.prime(start);
    await settle(streamer);

    let maxActive = 0;
    let maxBvh = 0;
    let maxCpuBytes = 0;
    const durationSeconds = 15 * 60;
    for (let second = 0; second <= durationSeconds; second += 5) {
      const x = Math.sin(second / 60) * 4_000;
      const z = -second * 80;
      const vx = Math.cos(second / 60) * (4_000 / 60);
      const position = { x, y: 42, z };
      const velocity = { x: vx, y: 0, z: -80 };
      await cover(streamer, position, velocity);
      const stats = streamer.getStreamerStats();
      maxActive = Math.max(maxActive, stats.activeChunks);
      maxBvh = Math.max(maxBvh, stats.bvhCount);
      maxCpuBytes = Math.max(maxCpuBytes, stats.estimatedCpuGeometryBytes);
    }

    const stats = streamer.getStreamerStats();
    expect(maxActive).toBeLessThanOrEqual(17);
    expect(maxBvh).toBeLessThanOrEqual(17);
    expect(maxCpuBytes).toBeLessThan(2_000_000);
    expect(stats.coverageComplete).toBe(true);
    expect(stats.rebaseCount).toBeGreaterThan(0);
    expect(stats.generatedTotal).toBeGreaterThan(100);
    expect(stats.retiredTotal).toBeGreaterThan(100);
    expect(stats.disposedGeometryCount).toBe(stats.retiredTotal * 2);
    expect(stats.generationSampleCount).toBeGreaterThan(0);
    expect(stats.generationMinMs).toBeLessThanOrEqual(stats.generationAvgMs);
    expect(stats.generationAvgMs).toBeLessThanOrEqual(stats.generationMaxMs);
    expect(stats.generationMinMs).toBeLessThanOrEqual(stats.generationP95Ms);
    expect(stats.generationP95Ms).toBeLessThanOrEqual(stats.generationMaxMs);

    streamer.dispose();
    expect(streamer.getStreamerStats().activeChunks).toBe(0);
    expect(source.disposed).toBe(true);
  });
});
