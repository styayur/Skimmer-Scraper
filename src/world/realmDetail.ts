import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject3D } from '../model/glb';
import type { Vec3 } from '../core/math';
import {
  inspectPackTile,
  installedPacks,
  loadPackTile,
  webPack,
  type PackFile,
  type WorldPack,
} from '../platform/worldPacks';

interface Tile {
  owner: T.Group;
  base: T.Object3D;
  file?: PackFile;
  mesh?: T.Object3D;
  task?: AbortController;
  requested?: PackFile;
  tier?: 'web' | 'high';
  failed?: string;
}
interface Asset {
  pack: WorldPack;
  file: PackFile;
}
export class RealmDetail {
  quality: 'balanced' | 'high' = 'balanced';
  private readonly cache = new Map<string, { mesh: T.Object3D; bytes: number }>();
  private cachedBytes = 0;
  private cacheHits = 0;
  private pressureUntil = 0;
  private lastDecodeMs = 0;
  private forward = new T.Vector3(0, 0, -1);
  private readonly chunks = new Map<string, Tile>();
  private readonly medium = new Map<string, Asset>();
  private readonly high = new Map<string, Asset>();
  private readonly abort = new AbortController();
  private readonly normal: T.Texture;
  private pending = 0;
  private nextPlan = 0;
  private loaded = 0;
  private released = 0;
  private peak = 0;
  constructor(seed: number) {
    this.normal = new T.TextureLoader().load(
      new URL('./realms/dragonspine/strata-normal.png', document.baseURI).href,
    );
    this.normal.wrapS = this.normal.wrapT = T.RepeatWrapping;
    this.normal.colorSpace = T.NoColorSpace;
    const index = (pack: WorldPack, target: Map<string, Asset>) => {
      if (pack.seed !== seed || this.abort.signal.aborted) return;
      for (const file of pack.files)
        target.set(file.cx + ':' + file.cz, { pack, file });
    };
    if (seed === 334458)
      void webPack(this.abort.signal)
        .then((pack) => index(pack, this.medium))
        .catch(() => {});
    void installedPacks()
      .then((packs) => {
        for (const p of packs)
          if (
            p.tier === 'high' &&
            p.id === localStorage.getItem('skimmer-scraper.active-pack')
          )
            index(p, this.high);
      })
      .catch(() => {});
  }
  attach(key: string, owner: T.Group): void {
    const base = owner.getObjectByName('dragonspine-ground');
    if (base) this.chunks.set(key, { owner, base });
  }
  observeRender(frameMs: number, gpuMs: number | null, forward: Vec3): void {
    this.forward.copy(forward);
    if (frameMs > 32 || (gpuMs ?? 0) > 17) this.pressureUntil = performance.now() + 1200;
  }
  private trimCache(limit: number): void {
    while (this.cache.size > Math.max(0, limit) || this.cachedBytes > 8 * 1024 ** 2) {
      const [key, item] = this.cache.entries().next().value!;
      this.cache.delete(key);
      this.cachedBytes -= item.bytes;
      disposeObject3D(item.mesh);
    }
  }
  private release(tile: Tile, cancel = true): void {
    if (cancel) tile.task?.abort();
    if (tile.mesh && tile.file) {
      tile.mesh.removeFromParent();
      this.released++;
      const key = tile.file.cx + ':' + tile.file.cz + ':' + tile.file.sha256;
      if (this.abort.signal.aborted || this.cache.has(key)) disposeObject3D(tile.mesh);
      else {
        let bytes = 0;
        tile.mesh.traverse(node => {
          if (!(node instanceof T.Mesh)) return;
          const geometry = node.geometry as T.BufferGeometry;
          for (const attrib of Object.values(geometry.attributes)) bytes += attrib.array.byteLength;
          bytes += geometry.index?.array.byteLength ?? 0;
        });
        this.cache.set(key, { mesh: tile.mesh, bytes });
        this.cachedBytes += bytes;
        this.trimCache(Math.min(3, 12 - (this.loaded - this.released) - this.pending));
      }
    }
    tile.base.visible = true;
    tile.mesh = undefined;
    tile.file = undefined;
    tile.tier = undefined;
  }
  detach(key: string): void {
    const tile = this.chunks.get(key);
    if (tile) this.release(tile);
    this.chunks.delete(key);
  }
  update(position: Vec3, velocity: Vec3, collisionReady: boolean, companions: readonly Vec3[],
    dragon: Vec3 | undefined, generationMs: number): void {
    if (!collisionReady || performance.now() < this.nextPlan) return;
    const now = performance.now();
    const busy = now < this.pressureUntil || generationMs > 14;
    const budget = busy ? 5 : this.quality === 'high' ? 12 : 9;
    this.nextPlan = now + (busy ? 240 : 130);
    const targets: Array<{ tile: Tile; asset: Asset; distance: number }> = [];
    const lookahead = Math.min(1.4, 0.4 + Math.hypot(velocity.x, velocity.z) / 180);
    for (const [key, tile] of this.chunks) {
      const mid = this.medium.get(key),
        hi = this.high.get(key);
      const reference = hi ?? mid;
      if (!reference) continue;
      const x = (reference.file.cx + 0.5) * 220;
      const z = (reference.file.cz + 0.5) * 220;
      const dx = x - position.x, dz = z - position.z;
      const altitude = Math.max(0, position.y - reference.file.bounds[4]!);
      const behind = Math.max(0, -(dx * this.forward.x + dz * this.forward.z));
      let distance = Math.hypot(dx - lookahead * velocity.x, dz - lookahead * velocity.z, altitude * .24) + behind * .3;
      for (const agent of companions) distance = Math.min(distance, 120 + Math.hypot(x-agent.x, z-agent.z, altitude * .24));
      if (dragon) distance = Math.min(distance, 140 + Math.hypot(x-dragon.x, z-dragon.z, altitude * .24));
      const asset =
        hi && hi.file.sha256 !== tile.failed && distance < (busy ? 150 : tile.file === hi.file ? 285 : 220)
          ? hi
          : mid && distance < (tile.file === mid.file ? 410 : 365)
            ? mid
            : null;
      if (asset) targets.push({ tile, asset, distance });
      else this.release(tile);
    }
    targets.sort((a, b) => a.distance - b.distance);
    for (const { tile } of targets.slice(budget)) this.release(tile);
    for (const { tile, asset } of targets.slice(0, budget)) {
      if (tile.task && tile.requested !== asset.file) tile.task.abort();
      if (this.pending >= 1) continue;
      if (
        tile.task ||
        tile.file === asset.file ||
        tile.failed === asset.file.sha256
      )
        continue;
      const task = new AbortController();
      tile.task = task;
      tile.requested = asset.file;
      this.pending++;
      void this.refine(tile, asset, task)
        .catch((error) => {
          if (!task.signal.aborted) {
            tile.failed = asset.file.sha256;
            console.warn('世界分块回退至基础地形。', String(error));
          }
        })
        .finally(() => {
          this.pending--;
          tile.task = undefined;
          tile.requested = undefined;
        });
    }
  }
  private async refine(
    tile: Tile,
    asset: Asset,
    task: AbortController,
  ): Promise<void> {
    const key = asset.file.cx + ':' + asset.file.cz + ':' + asset.file.sha256;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cachedBytes -= cached.bytes;
      this.cacheHits++;
      this.activate(tile, asset, cached.mesh);
      return;
    }
    this.trimCache(Math.min(3, 12 - (this.loaded - this.released) - 1));
    const bytes = await loadPackTile(asset.pack, asset.file, task.signal);
    task.signal.throwIfAborted();
    const started = performance.now();
    inspectPackTile(bytes);
    const manager = new T.LoadingManager().setURLModifier(() => {
      throw Error('分块引用了外部资源。');
    });
    const model = await new GLTFLoader(manager).parseAsync(bytes, '');
    if (task.signal.aborted) {
      disposeObject3D(model.scene);
      return;
    }
    model.scene.traverse((node) => {
      if (!(node instanceof T.Mesh)) return;
      const vertices = node.geometry.getAttribute('position');
      const uv = new Float32Array(vertices.count * 2);
      for (let i = 0; i < vertices.count; i++) {
        uv[2 * i] = (asset.file.cx * 220 + vertices.getX(i)) / 28;
        uv[2 * i + 1] = (asset.file.cz * 220 + vertices.getZ(i)) / 28;
      }
      node.geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        if (material instanceof T.MeshStandardMaterial) {
          material.normalMap = this.normal;
          material.normalScale.setScalar(0.33);
        }
      }
    });
    this.lastDecodeMs = performance.now() - started;
    if (this.lastDecodeMs > 12) this.pressureUntil = performance.now() + 1200;
    this.activate(tile, asset, model.scene);
  }
  private activate(tile: Tile, asset: Asset, mesh: T.Object3D): void {
    this.release(tile, false);
    tile.mesh = mesh;
    tile.file = asset.file;
    tile.tier = asset.pack.tier;
    tile.owner.add(mesh);
    tile.base.visible = false;
    this.loaded++;
    this.trimCache(Math.min(3, 12 - (this.loaded - this.released)));
    this.peak = Math.max(this.peak, this.loaded - this.released);
  }
  snapshot() {
    return {
      loaded: this.loaded,
      released: this.released,
      resident: this.loaded - this.released,
      peak: this.peak,
      pending: this.pending,
      high: [...this.chunks.values()].filter(t => t.tier === 'high').length,
      cached: this.cache.size, cachedBytes: this.cachedBytes, cacheHits: this.cacheHits,
      lastDecodeMs: this.lastDecodeMs, underPressure: performance.now() < this.pressureUntil,
    };
  }
  dispose(): void {
    this.abort.abort();
    for (const tile of this.chunks.values()) this.release(tile);
    this.chunks.clear();
    this.trimCache(0);
    this.normal.dispose();
  }
}
