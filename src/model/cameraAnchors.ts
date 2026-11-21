import type { Vec3 } from '../core/math';

export type AnchorPreset = 'standard' | 'fighter' | 'glider' | 'high' | 'custom';
export type RecommendedAnchorPreset = Exclude<AnchorPreset, 'custom'>;

export interface AircraftBounds {
  min: Vec3;
  max: Vec3;
}

const placements = {
  standard: { longitudinal: 0.24, overHull: 0.12 },
  fighter: { longitudinal: 0.14, overHull: 0.06 },
  glider: { longitudinal: 0.39, overHull: 0.1 },
  high: { longitudinal: 0.32, overHull: 0.32 },
} satisfies Record<RecommendedAnchorPreset, { longitudinal: number; overHull: number }>;

export const recommendCameraAnchor = (bounds: AircraftBounds, preset: RecommendedAnchorPreset): Vec3 => {
  const { min, max } = bounds;
  const placement = placements[preset];
  const length = max.z - min.z;
  const round = (n: number) => Math.round(Math.max(-8, Math.min(8, n)) * 100) / 100;
  return {
    x: round((min.x + max.x) / 2),
    y: round(max.y + Math.max(0.08, length * placement.overHull)),
    z: round(min.z + length * placement.longitudinal),
  };
};

export interface CameraAnchorSetting {
  preset: AnchorPreset;
  anchor: Vec3;
}

const KEY = 'skimmer-scraper.camera-anchors.v3';
export const validCameraAnchor = (anchor: unknown): anchor is Vec3 => {
  if (!anchor || typeof anchor !== 'object') return false;
  const a = anchor as Vec3;
  return [a.x, a.y, a.z].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 8);
};
export const loadCameraAnchor = (id: string, storage: Storage = localStorage): CameraAnchorSetting | null => {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? '{}')[id];
    if (!validCameraAnchor(value)) return null;
    const rawPreset = (value as Vec3 & { preset?: unknown }).preset;
    const preset = typeof rawPreset === 'string' && Object.hasOwn(placements, rawPreset)
      ? rawPreset as RecommendedAnchorPreset : 'custom';
    return { preset, anchor: { x: value.x, y: value.y, z: value.z } };
  }
  catch { return null; }
};
export const saveCameraAnchor = (id: string, setting: CameraAnchorSetting, storage: Storage = localStorage): boolean => {
  if (!validCameraAnchor(setting.anchor)) return false;
  try {
    const values = JSON.parse(storage.getItem(KEY) ?? '{}');
    values[id] = { ...setting.anchor, preset: setting.preset };
    storage.setItem(KEY, JSON.stringify(values));
    return true;
  } catch { return false; }
};
