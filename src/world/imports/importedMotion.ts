import * as THREE from 'three';
import type { DynamicColliderRegistry } from '../dynamicColliderRegistry';
import { validMotionPath, type WorldMotionOptions, type WorldMotionPath, type WorldRole } from './worldManifest';

export interface DrivenMesh {
  id: string;
  mesh: THREE.Mesh;
  role: Exclude<WorldRole, 'DECORATION'>;
  geometry: THREE.BufferGeometry;
  overlay?: THREE.Mesh;
}

const channelType = (track: THREE.KeyframeTrack): string => {
  switch (THREE.PropertyBinding.parseTrackName(track.name).propertyName) {
    case 'position': return 'translation';
    case 'quaternion': return 'rotation';
    case 'scale': return 'scale';
    case 'morphTargetInfluences': return 'morph';
    default: return 'other';
  }
};

export class ImportedMotion {
  private readonly mixer: THREE.AnimationMixer;
  private readonly action: THREE.AnimationAction | null;
  private readonly rigidTargets = new Set<THREE.Object3D>();
  private readonly morphTargets = new Set<THREE.Object3D>();
  private readonly paths = new Map<THREE.Object3D, { rest: THREE.Vector3; motion: WorldMotionPath }>();
  private readonly driven: DrivenMesh[] = [];
  private hasBoneAnimation = false;
  private seconds = 0;
  private running = true;
  private colliders: DynamicColliderRegistry | null = null;
  public readonly clips;

  public constructor(private readonly scene: THREE.Group, clips: readonly THREE.AnimationClip[], private readonly options?: WorldMotionOptions) {
    this.clips = clips.map(clip => ({ name: clip.name, seconds: clip.duration, channels: [...new Set(clip.tracks.map(track => {
      const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(scene, nodeName);
      return node instanceof THREE.Bone ? 'skin' : channelType(track);
    }))] }));
    this.mixer = new THREE.AnimationMixer(scene);
    const index = options?.clip ?? (clips.length ? 0 : -1);
    if (index >= clips.length) throw new Error('选择的世界动画片段不存在。');
    const clip = clips[index];
    this.action = clip ? this.mixer.clipAction(clip) : null;
    for (const track of clip?.tracks ?? []) {
      const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(scene, nodeName);
      if (!(node instanceof THREE.Object3D)) continue;
      if (node instanceof THREE.Bone) this.hasBoneAnimation = true;
      else if (channelType(track) === 'morph') this.morphTargets.add(node);
      else if (['translation', 'rotation', 'scale'].includes(channelType(track))) this.rigidTargets.add(node);
    }
    this.reset();
  }

  public describe(mesh: THREE.Mesh, id: string): { motion?: 'rigid' | 'reference-pose'; moving: boolean; path?: WorldMotionPath } {
    const tagged = mesh.userData.skimmerMotion ?? mesh.userData.skimmer?.motion;
    const overrides = this.options?.paths;
    const custom = overrides && Object.hasOwn(overrides, id) ? overrides[id] : validMotionPath(tagged) ? tagged : undefined;
    if (custom) this.paths.set(mesh, { rest: mesh.position.clone(), motion: custom });
    let moving = !!custom;
    for (let node: THREE.Object3D | null = mesh; node && node !== this.scene.parent; node = node.parent) {
      if (this.rigidTargets.has(node)) moving = true;
    }
    const proxy = this.morphTargets.has(mesh) || mesh instanceof THREE.SkinnedMesh && this.hasBoneAnimation;
    return { moving, motion: proxy ? 'reference-pose' : moving ? 'rigid' : undefined, ...(custom ? { path: custom } : {}) };
  }

  public attach(colliders: DynamicColliderRegistry, motions: DrivenMesh[], view: THREE.Group): void {
    this.colliders = colliders;
    this.scene.updateWorldMatrix(true, true);
    for (const motion of motions) {
      colliders.add(motion.id, 'imported-motion', motion.geometry, motion.mesh.matrixWorld, motion.role === 'SURFACE');
      const material = new THREE.MeshBasicMaterial({ color: motion.role === 'SURFACE' ? 0x62ffd6 : 0xffa178,
        transparent: true, opacity: 0.62, wireframe: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      motion.overlay = new THREE.Mesh(motion.geometry, material);
      motion.overlay.matrixAutoUpdate = false;
      view.add(motion.overlay);
      this.driven.push(motion);
    }
    this.updateRegistry(0);
  }

  public setRunning(running: boolean): void {
    this.running = running;
    this.updateRegistry(0);
  }

  public get isRunning(): boolean { return this.running; }

  public step(dt: number): void {
    if (!this.running || !this.action && this.paths.size === 0) return;
    const before = this.action?.time ?? 0;
    this.seconds += dt;
    for (const [node, path] of this.paths) node.position.copy(path.rest);
    this.mixer.update(dt);
    for (const [node, { motion }] of this.paths) {
      const t = (1 - Math.cos(this.seconds / motion.seconds * Math.PI * 2)) * 0.5;
      node.position.x += motion.offset.x * t;
      node.position.y += motion.offset.y * t;
      node.position.z += motion.offset.z * t;
    }
    const looped = this.action && this.action.time + 1e-9 < before;
    this.updateRegistry(looped ? 0 : dt);
  }

  public reset(): void {
    this.seconds = 0;
    for (const [node, path] of this.paths) node.position.copy(path.rest);
    if (this.action) {
      const loop = this.options?.loop !== false;
      this.action.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 0).play();
      this.action.clampWhenFinished = true;
      this.mixer.setTime(0);
    }
    this.updateRegistry(0);
  }

  public snapshot() {
    return this.driven.map(({ id, mesh }) => {
      const position = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
      return { id, type: 'glb', position: { x: position.x, y: position.y, z: position.z }, yaw: mesh.rotation.y };
    });
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.scene);
    for (const { overlay } of this.driven) {
      overlay?.removeFromParent();
      if (overlay?.material instanceof THREE.Material) overlay.material.dispose();
    }
    this.driven.length = 0;
    this.paths.clear();
    this.colliders = null;
  }

  private updateRegistry(dt: number): void {
    if (!this.colliders || this.driven.length === 0) return;
    if (this.driven.length > 32) this.scene.updateWorldMatrix(true, true);
    for (const { id, mesh, overlay } of this.driven) {
      if (this.driven.length <= 32) mesh.updateWorldMatrix(true, false);
      this.colliders.setTransform(id, mesh.matrixWorld, dt);
      overlay?.matrix.copy(mesh.matrixWorld);
      if (overlay) overlay.matrixWorldNeedsUpdate = true;
    }
  }
}
