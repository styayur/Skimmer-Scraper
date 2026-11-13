export type Random = () => number;

export const mulberry32 = (seed: number): Random => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const range = (random: Random, min: number, max: number): number =>
  min + (max - min) * random();

export const pick = <T>(random: Random, values: readonly T[]): T =>
  values[Math.min(values.length - 1, Math.floor(random() * values.length))] as T;

export const chance = (random: Random, probability: number): boolean =>
  random() < probability;
