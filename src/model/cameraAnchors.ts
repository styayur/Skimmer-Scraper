import type { Vec3 } from '../core/math';
const KEY = 'skimmer-scraper.camera-anchors.v3';
const valid = (anchor: unknown): anchor is Vec3 => {
  if (!anchor || typeof anchor !== 'object') return false;
  const a = anchor as Vec3;
  return [a.x, a.y, a.z].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 8);
};
export const loadCameraAnchor = (id: string): Vec3 | null => {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')[id]; return valid(value) ? { ...value } : null; }
  catch { return null; }
};
export const saveCameraAnchor = (id: string, anchor: Vec3): void => {
  if (!valid(anchor)) return;
  try { const values = JSON.parse(localStorage.getItem(KEY) ?? '{}'); values[id] = anchor; localStorage.setItem(KEY, JSON.stringify(values)); }
  catch { /* optional */ }
};
