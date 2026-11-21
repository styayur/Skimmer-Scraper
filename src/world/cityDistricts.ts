import { hashNumbers } from './deterministic';
import { valueNoise } from './terrain';

/** Independent smooth fields in world meters, shared across streaming boundaries. */
export const cityDistrictAt = (seed: number, x: number, z: number) => ({
  towers: valueNoise(hashNumbers(seed, 0xa710), x / 680, z / 680),
  crossings: valueNoise(hashNumbers(seed, 0xb610), x / 910, z / 910),
  gardens: valueNoise(hashNumbers(seed, 0xc510), x / 580, z / 580),
});
