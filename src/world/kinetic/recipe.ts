import type { Vec3 } from '../../core/math';
import { hashNumbers } from '../deterministic';
import { CHUNK_SIZE } from '../worldConfig';

export const KINETIC_RECIPE = 'kinetic-grid-1';
export const KINETIC_MODULES = ['s-curve', 'helix', 'sky-arch', 'bowl', 'ribbon-bridge', 'tunnel'] as const;
export type KineticModuleId = typeof KINETIC_MODULES[number];
export const KINETIC_CATALOG_SHA256 = '2ac10859708633e93f449b529acf34273dc0018fb69313c7120dac5acf71c294';

export function junctionRow(seed: number, band: number): number {
  return 4 * band + hashNumbers(seed, 0x4a, 0, band) % 4;
}

/** N names the lower-z face, W the lower-x face. Both owners address the same face. */
export function boundarySocket(seed: number, face: 'N' | 'W', x: number, z: number): Vec3 {
  const h = hashNumbers(seed, face === 'N' ? 0x4e : 0x57, x, z);
  const offset = CHUNK_SIZE / 2 + (h % 25 - 12);
  return {
    x: x * CHUNK_SIZE + (face === 'N' ? offset : 0),
    y: 80 + ((h >>> 8) % 13),
    z: z * CHUNK_SIZE + (face === 'W' ? offset : 0),
  };
}

export function kineticLayout(seed: number, x: number, z: number, revision: number): KineticModuleId | 'junction' {
  const rx = Math.floor(x / 4), rz = Math.floor(z / 4);
  if (z === junctionRow(seed, rz)) return 'junction';
  const offset = hashNumbers(seed, 0x52, rx, rz) % KINETIC_MODULES.length;
  return KINETIC_MODULES[(offset + x - 4 * rx + 2 * (z - 4 * rz) + revision) % KINETIC_MODULES.length]!;
}

export function kineticSpawn(seed: number) {
  const socket = boundarySocket(seed, 'N', 0, junctionRow(seed, 0) + 1);
  return { position: { ...socket, y: socket.y + 10 }, yaw: 0, pitch: -0.015, speed: 66 };
}
