import { hashNumbers } from './deterministic';
import type { WorldSettings } from './worldConfig';

const hash2d = (seed: number, x: number, z: number): number => {
  let value = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

const valueNoise = (seed: number, x: number, z: number): number => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2d(seed, x0, z0);
  const b = hash2d(seed, x0 + 1, z0);
  const c = hash2d(seed, x0, z0 + 1);
  const d = hash2d(seed, x0 + 1, z0 + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
};

const spawnClearFactor = (x: number, z: number): number => {
  const distance = Math.hypot(x, z - 120);
  const t = Math.max(0, Math.min(1, (distance - 80) / 180));
  return smooth(t);
};

export const terrainHeightAt = (x: number, z: number, settings: WorldSettings): number => {
  const amplitude = settings.config.terrainAmplitude;
  if (amplitude <= 0) return 0;
  const terrainSeed = hashNumbers(settings.seed, settings.generatorVersion, 0x7e44a1);
  const broad = valueNoise(terrainSeed, x / 220, z / 220) - 0.5;
  const detail = valueNoise(terrainSeed ^ 0x5bd1e995, x / 72, z / 72) - 0.5;
  const raw = (broad * 1.6 + detail * 0.5) * amplitude;
  return raw * spawnClearFactor(x, z);
};

