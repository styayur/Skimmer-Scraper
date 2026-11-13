export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Attitude {
  pitch: number;
  roll: number;
  yaw: number;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, alpha: number): number =>
  from + (to - from) * alpha;

export const damp = (from: number, to: number, lambda: number, dt: number): number =>
  lerp(from, to, 1 - Math.exp(-lambda * dt));

export const approach = (from: number, to: number, maxDelta: number): number => {
  if (from < to) return Math.min(to, from + maxDelta);
  return Math.max(to, from - maxDelta);
};

export const forwardFromAttitude = (attitude: Attitude): Vec3 => {
  const cp = Math.cos(attitude.pitch);
  return {
    x: -Math.sin(attitude.yaw) * cp,
    y: Math.sin(attitude.pitch),
    z: -Math.cos(attitude.yaw) * cp,
  };
};

export const lengthSquared = (value: Vec3): number =>
  value.x * value.x + value.y * value.y + value.z * value.z;

export const distance = (a: Vec3, b: Vec3): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export const cloneVec3 = (value: Vec3): Vec3 => ({ ...value });
