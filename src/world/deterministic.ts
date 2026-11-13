import { mulberry32, type Random } from './rng';

export const mix32 = (value: number): number => {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
};

export const hashNumbers = (...values: number[]): number => {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= mix32(value | 0);
    hash = Math.imul(hash, 0x01000193);
  }
  return mix32(hash);
};

export const hashString = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return mix32(hash);
};

export const seededRandom = (...values: Array<number | string>): Random => {
  const numeric = values.map((value) => typeof value === 'number' ? value : hashString(value));
  return mulberry32(hashNumbers(...numeric));
};

export const fingerprintValues = (...values: Array<number | string | boolean>): number => {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const numeric = typeof value === 'string'
      ? hashString(value)
      : typeof value === 'boolean'
        ? (value ? 1 : 0)
        : Math.round(value * 1000);
    hash ^= mix32(numeric);
    hash = Math.imul(hash, 0x01000193);
  }
  return mix32(hash);
};
