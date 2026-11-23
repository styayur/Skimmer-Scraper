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
  failed?: string;
}
interface Asset {
  pack: WorldPack;
  file: PackFile;
}
export class RealmDetail {
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
  private release(tile: Tile): void {
    tile.task?.abort();
    if (tile.mesh) {
      tile.mesh.removeFromParent();
      disposeObject3D(tile.mesh);
      this.released++;
    }
    tile.base.visible = true;
    tile.mesh = undefined;
    tile.file = undefined;
  }
  detach(key: string): void {
    const tile = this.chunks.get(key);
    if (tile) this.release(tile);
    this.chunks.delete(key);
  }
  update(position: Vec3, velocity: Vec3, collisionReady: boolean): void {
    if (!collisionReady || performance.now() < this.nextPlan) return;
    this.nextPlan = performance.now() + 130;
    const targets: Array<{ tile: Tile; asset: Asset; distance: number }> = [];
    for (const [key, tile] of this.chunks) {
      const mid = this.medium.get(key),
        hi = this.high.get(key);
      const reference = hi ?? mid;
      if (!reference) continue;
      const dx =
        (reference.file.cx + 0.5) * 220 - position.x - 0.45 * velocity.x;
      const dz =
        (reference.file.cz + 0.5) * 220 - position.z - 0.45 * velocity.z;
      const distance = Math.hypot(dx, dz);
      const asset =
        hi && distance < (tile.file === hi.file ? 250 : 210)
          ? hi
          : mid && distance < (tile.file === mid.file ? 410 : 365)
            ? mid
            : null;
      if (asset) targets.push({ tile, asset, distance });
      else this.release(tile);
    }
    targets.sort((a, b) => a.distance - b.distance);
    for (const { tile } of targets.slice(12)) this.release(tile);
    for (const { tile, asset } of targets.slice(0, 12)) {
      if (this.pending >= 1) break;
      if (
        tile.task ||
        tile.file === asset.file ||
        tile.failed === asset.file.sha256
      )
        continue;
      const task = new AbortController();
      tile.task = task;
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
        });
    }
  }
  private async refine(
    tile: Tile,
    asset: Asset,
    task: AbortController,
  ): Promise<void> {
    const bytes = await loadPackTile(asset.pack, asset.file, task.signal);
    inspectPackTile(bytes);
    const manager = new T.LoadingManager().setURLModifier(() => {
      throw Error('分块引用了外部资源。');
    });
    const model = await new GLTFLoader(manager).parseAsync(bytes, '');
    if (task.signal.aborted) {
      disposeObject3D(model.scene);
      return;
    }
    if (tile.mesh) {
      tile.mesh.removeFromParent();
      disposeObject3D(tile.mesh);
      this.released++;
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
    tile.mesh = model.scene;
    tile.file = asset.file;
    tile.owner.add(model.scene);
    tile.base.visible = false;
    this.loaded++;
    this.peak = Math.max(this.peak, this.loaded - this.released);
  }
  snapshot() {
    return {
      loaded: this.loaded,
      released: this.released,
      resident: this.loaded - this.released,
      peak: this.peak,
      pending: this.pending,
      high: [...this.chunks.values()].filter(
        (t) => t.file && [...this.high.values()].some((h) => h.file === t.file),
      ).length,
    };
  }
  dispose(): void {
    this.abort.abort();
    for (const tile of this.chunks.values()) this.release(tile);
    this.chunks.clear();
    this.normal.dispose();
  }
}
