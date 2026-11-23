import type { Group } from 'three';
import type { WorldSettings } from './worldConfig';
import type { WorldStats } from './worldTypes';

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
  getSpawn(): SpawnState;
  getStats(): WorldStats;
  getFingerprint(): number;
  dispose(): void;
}
