import * as THREE from 'three';
import { forwardFromAttitude, type Vec3 } from '../../core/math';
import { ChunkedWorldAdapter } from '../chunkedWorldAdapter';
import { fingerprintValues, seededRandom } from '../deterministic';
import type { RenderableWorld, SpawnState } from '../renderWorld';
import { range } from '../rng';
import { resolveWorldSettings } from '../worldConfig';
import type { SurfaceProvider, WorldStats } from '../worldTypes';
import { UnifiedSurfaceQuery } from '../unifiedSurfaceQuery';
import type { ImportedMotion } from './importedMotion';
import { disposeWorldScenes, type AnalyzedWorldScene } from './sceneAnalyzer';
import type { WorldManifest } from './worldManifest';

export class ImportedWorldAdapter implements RenderableWorld, SurfaceProvider {
  public readonly kind = 'imported';
  public readonly settings;
  public readonly root: THREE.Group;
  private readonly adapter = new ChunkedWorldAdapter();
  private readonly surfaces = new UnifiedSurfaceQuery({
    queryNearest: (position, range) => this.adapter.queryNearest(position, range),
    queryProximity: (position, range) => this.adapter.queryNearest(position, range, this.surfaceId),
    queryGlide: (position, range) => this.adapter.queryGlide(position, range, this.surfaceId),
  });
  private spawn?: SpawnState;
  private readonly collisionView = new THREE.Group();
  private readonly surfaceId: string;
  private disposed = false;
  public disposedGeometryCount = 0;

  public constructor(
    public readonly manifest: WorldManifest,
    private readonly scene: AnalyzedWorldScene,
    private readonly sourceScenes: readonly THREE.Group[],
    private readonly motion?: ImportedMotion,
  ) {
    this.settings = resolveWorldSettings({ seed: String(Number.parseInt(manifest.id.slice(0, 8), 16)) });
    const origin = { x: 0, y: 0, z: 0 };
    this.surfaceId = `local-${manifest.id}-surface`;
    for (const [geometry, id] of [
      [scene.surfaces, this.surfaceId],
      [scene.obstacles, `local-${manifest.id}-obstacle`],
    ] as const) {
      if (!geometry) continue;
      this.adapter.addChunk({ id, chunkX: 0, chunkZ: 0, origin, bounds: geometry.boundingBox!, geometry });
    }
    motion?.attach(this.surfaces.dynamic, scene.dynamic, this.collisionView);
    for (const [geometry, color] of [[scene.surfaces, 0x62ffd6], [scene.obstacles, 0xffa178]] as const) {
      if (!geometry) continue;
      this.collisionView.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.62, depthWrite: false,
        wireframe: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })));
    }
    // The collision vertices already include the imported scene's transform.
    const group = new THREE.Group();
    group.name = 'imported-world';
    group.add(scene.root, this.collisionView);
    this.root = group;
    this.setCollisionVisible(false);
  }

  public setCollisionVisible(visible: boolean): void {
    this.collisionView.visible = visible;
  }

  public isCollisionVisible(): boolean { return this.collisionView.visible; }

  public getSpawn(): SpawnState {
    return this.getDefaultSpawn();
  }

  public getDefaultSpawn(): SpawnState {
    const spawn = this.spawn ??= this.chooseSpawn();
    return { ...spawn, position: { ...spawn.position } };
  }

  public getRenderOrigin(): Vec3 { return { x: 0, y: 0, z: 0 }; }
  public getLocalPosition(position: Vec3): Vec3 { return { ...position }; }
  public isCollisionCovered(position: Vec3): boolean {
    return !this.disposed && Number.isFinite(position.x + position.y + position.z);
  }
  public isCompanionCovered(position: Vec3): boolean { return this.isCollisionCovered(position); }
  public getAdapterStats() { return this.adapter.getStats(); }
  public queryNearest(position: Vec3, maxDistance: number) { return this.surfaces.queryNearest(position, maxDistance); }
  public queryGlide(position: Vec3, range: number) { return this.surfaces.queryGlide(position,range); }
  public queryGlideAhead(position: Vec3, range: number, seconds: number, includeObstacles = false) {
    return this.surfaces.queryGlideAhead(position, range, seconds, includeObstacles);
  }
  public isGlideVolumeCovered(center: Vec3) { return this.isCollisionCovered(center); }
  public glideChordClear(from: Vec3, to: Vec3, radius: number, start: number, end: number) {
    return this.surfaces.glideChordClear(from, to, radius, start, end);
  }
  public queryProximity(position: Vec3, maxDistance: number) { return this.surfaces.queryProximity(position, maxDistance); }
  public queryStatic(position: Vec3, range: number) { return this.surfaces.queryStatic(position, range); }
  public sweepDynamic(from: Vec3, to: Vec3, radius: number) { return this.surfaces.sweepDynamic(from, to, radius); }
  public stepMotion(dt: number): void { this.motion?.step(dt); }
  public resetMotion(): void { this.motion?.reset(); }
  public setMotionRunning(running: boolean): void { this.motion?.setRunning(running); }
  public isMotionRunning(): boolean { return this.motion?.isRunning ?? false; }
  public getDynamicSnapshot() { return this.motion?.snapshot() ?? []; }

  public getFingerprint(): number {
    const source = [this.manifest.id, JSON.stringify(this.manifest.options)];
    return this.manifest.variant ? fingerprintValues(...source, String(this.manifest.variant.seed)) : fingerprintValues(...source);
  }

  public getStats(): WorldStats {
    const triangles = this.disposed ? 0 : this.scene.triangles;
    return { chunks: 0, buildings: 0, bridges: 0, islands: 0,
      collisionTriangles: this.disposed ? 0 : this.manifest.collisionTriangles, renderTriangles: triangles };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.adapter.dispose();
    const moving = this.surfaces.dynamic.count;
    this.motion?.dispose();
    this.surfaces.dynamic.dispose();
    this.disposedGeometryCount = moving + disposeWorldScenes([...this.sourceScenes, this.collisionView]);
    this.root.clear();
  }

  private chooseSpawn(): SpawnState {
    const { options } = this.manifest;
    const yaw = THREE.MathUtils.degToRad(options.spawnYaw);
    const pitch = 0;
    const speed = 66;
    const direction = forwardFromAttitude({ yaw, pitch, roll: 0 });
    const safe = (position: Vec3, corridor = 22) => {
      for (let distance = 0; distance <= corridor; distance += 2) {
        const point = { x: position.x + distance * direction.x, y: position.y, z: position.z + distance * direction.z };
        if (this.queryNearest(point, 6.5)) return false;
      }
      return true;
    };
    const clearVariantCorridor = (position: Vec3): boolean => {
      if (!safe(position, 60)) return false;
      if (!this.motion || !this.surfaces.dynamic.count) return true;
      try {
        for (let step = 0; step < 10; step++) {
          this.motion.step(0.1);
          if (!safe(position, 60)) return false;
        }
        return true;
      } finally { this.motion.reset(); }
    };
    if (options.spawn) {
      const clear = this.manifest.variant ? clearVariantCorridor(options.spawn) : safe(options.spawn);
      if (!clear) throw new Error('出生点或前方航线太靠近碰撞面，请调整坐标或使用自动出生点。');
      return { position: { ...options.spawn }, yaw, pitch, speed };
    }

    const { max } = this.scene.bounds;
    const edge = Math.abs(direction.x) * max.x + Math.abs(direction.z) * max.z;
    const y = max.y + 14;
    const approach = { x: -(edge + 10) * direction.x, y, z: -(edge + 10) * direction.z };
    if (this.manifest.variant) {
      const random = seededRandom(this.manifest.id, this.manifest.variant.seed, 'imported-corridor-v1');
      const cross = { x: -direction.z, z: direction.x };
      const halfWidth = Math.abs(cross.x) * max.x + Math.abs(cross.z) * max.z;
      for (let lane = 0; lane < 14; lane++) {
        const lateral = range(random, -0.84, 0.84) * halfWidth;
        const position = { x: approach.x + cross.x * lateral, y: Math.max(12, max.y * range(random, 0.28, 0.84)),
          z: approach.z + cross.z * lateral };
        const entrance = { x: position.x + direction.x * 50, y: position.y, z: position.z + direction.z * 50 };
        if (this.queryProximity(entrance, 48) && clearVariantCorridor(position)) return { position, yaw, pitch, speed };
      }
      if (clearVariantCorridor(approach)) return { position: approach, yaw, pitch, speed };
      throw new Error('此变体没有安全的出生航线。');
    }
    for (const position of [approach, { x: 0, y, z: 0 },
      { x: max.x * 0.65, y, z: max.z * 0.65 }, { x: -max.x * 0.65, y, z: -max.z * 0.65 }]) {
      if (safe(position) && (this.queryProximity(position, 32) || this.queryNearest(position, 32))) return { position, yaw, pitch, speed };
    }
    return { position: approach, yaw, pitch, speed };
  }
}
