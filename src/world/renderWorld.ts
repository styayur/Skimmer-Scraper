import type { Group } from 'three';
import type { WorldSettings } from './worldConfig';
import type { WorldStats } from './worldTypes';
import type { Vec3 } from '../core/math';

export interface SpawnState {
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  speed: number;
}

export interface RenderableWorld {
  kind?: 'imported';
  root: Group;
  settings: WorldSettings;
  setRenderQuality?(name:'balanced'|'high'): void;
  observeRender?(frameMs: number, gpuMs: number | null, forward: Vec3): void;
  getSpawn(): SpawnState;
  getStats(): WorldStats;
  getFingerprint(): number;
  dispose(): void;
}
