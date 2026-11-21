import type { Vec3 } from '../../core/math';

export const WORLD_IMPORT_LIMITS = Object.freeze({
  bytes: 128 * 1024 * 1024,
  triangles: 1_250_000,
  nodes: 2_500,
  materials: 256,
  textures: 128,
  texturePixels: 48 * 1024 * 1024,
  dimension: 12_000,
  savedWorlds: 6,
  savedBytes: 256 * 1024 * 1024,
});

export type WorldRole = 'SURFACE' | 'OBSTACLE' | 'DECORATION';
export const isWorldRole = (value: unknown): value is WorldRole =>
  value === 'SURFACE' || value === 'OBSTACLE' || value === 'DECORATION';

export interface WorldMeshRole {
  id: string;
  name: string;
  inferred: WorldRole;
  role: WorldRole;
}

export interface WorldImportOptions {
  scale: number;
  yaw: number;
  up: 'y' | 'z' | '-z';
  spawn: Vec3 | null;
  spawnYaw: number;
  roles?: Readonly<Record<string, WorldRole>>;
}

export const defaultWorldImportOptions: Readonly<WorldImportOptions> = Object.freeze({
  scale: 1,
  yaw: 0,
  up: 'y',
  spawn: null,
  spawnYaw: 0,
});

export const validateWorldOptions = (options: WorldImportOptions): void => {
  if (!Number.isFinite(options.scale) || options.scale < 0.001 || options.scale > 1000) {
    throw new Error('场景比例须在 0.001 至 1000 之间。');
  }
  if (!['y', 'z', '-z'].includes(options.up) || !Number.isFinite(options.yaw) || !Number.isFinite(options.spawnYaw)) {
    throw new Error('请选择有效的世界和起飞朝向。');
  }
  if (options.spawn && Object.values(options.spawn).some(value => !Number.isFinite(value) || Math.abs(value) > WORLD_IMPORT_LIMITS.dimension)) {
    throw new Error('出生点坐标超出可用场景范围。');
  }
};

export interface WorldManifest {
  id: string;
  name: string;
  bytes: number;
  nodes: number;
  triangles: number;
  materials: number;
  textures: number;
  texturePixels: number;
  bounds: Vec3;
  animations: Array<{ name: string; seconds: number }>;
  meshRoles: WorldMeshRole[];
  collisionTriangles: number;
  options: WorldImportOptions;
}
