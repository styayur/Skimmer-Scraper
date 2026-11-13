import { fingerprintValues, seededRandom } from './deterministic';
import { range } from './rng';
import { terrainHeightAt } from './terrain';
import { CHUNK_SIZE, type WorldSettings } from './worldConfig';

export interface BridgeLineDefinition {
  axis: 'x' | 'z';
  lineIndex: number;
  enabled: boolean;
  height: number;
}

export interface BoundaryTerrainSample {
  x: number;
  z: number;
  height: number;
}

export interface StableBoundaryProfile {
  terrain: BoundaryTerrainSample[];
  bridges: BridgeLineDefinition[];
  fingerprint: number;
}

export const bridgeLineAt = (
  settings: WorldSettings,
  axis: 'x' | 'z',
  lineIndex: number,
): Omit<BridgeLineDefinition, 'axis' | 'lineIndex'> => {
  const random = seededRandom(
    settings.seed,
    settings.generatorVersion,
    'bridge-line',
    axis === 'x' ? 1 : 2,
    lineIndex,
  );
  return {
    enabled: random() < settings.config.bridgeFrequency,
    height: range(random, settings.config.bridgeHeightMin, settings.config.bridgeHeightMax),
  };
};

const boundaryTerrain = (settings: WorldSettings, chunkX: number, chunkZ: number): BoundaryTerrainSample[] => {
  const x0 = chunkX * CHUNK_SIZE;
  const z0 = chunkZ * CHUNK_SIZE;
  const samples: BoundaryTerrainSample[] = [];
  const steps = 8;
  for (let index = 0; index <= steps; index += 1) {
    const offset = (index / steps) * CHUNK_SIZE;
    for (const point of [
      { x: x0, z: z0 + offset },
      { x: x0 + CHUNK_SIZE, z: z0 + offset },
      { x: x0 + offset, z: z0 },
      { x: x0 + offset, z: z0 + CHUNK_SIZE },
    ]) {
      if (!samples.some((sample) => sample.x === point.x && sample.z === point.z)) {
        samples.push({ ...point, height: terrainHeightAt(point.x, point.z, settings) });
      }
    }
  }
  return samples;
};

/**
 * Stable boundary data deliberately has no chunk-revision input. Buildings and island interiors may
 * change in Ephemeral World, while terrain edges, street-grid anchors and bridge deck definitions do
 * not.
 */
export const stableBoundaryProfile = (
  settings: WorldSettings,
  chunkX: number,
  chunkZ: number,
): StableBoundaryProfile => {
  const x0 = chunkX * CHUNK_SIZE;
  const z0 = chunkZ * CHUNK_SIZE;
  const spacing = settings.config.streetSpacing;
  const bridges: BridgeLineDefinition[] = [];
  for (let line = Math.floor(z0 / spacing) - 1; line <= Math.ceil((z0 + CHUNK_SIZE) / spacing) + 1; line += 1) {
    if (line * spacing >= z0 && line * spacing < z0 + CHUNK_SIZE) {
      bridges.push({ axis: 'x', lineIndex: line, ...bridgeLineAt(settings, 'x', line) });
    }
  }
  for (let line = Math.floor(x0 / spacing) - 1; line <= Math.ceil((x0 + CHUNK_SIZE) / spacing) + 1; line += 1) {
    if (line * spacing >= x0 && line * spacing < x0 + CHUNK_SIZE) {
      bridges.push({ axis: 'z', lineIndex: line, ...bridgeLineAt(settings, 'z', line) });
    }
  }
  const terrain = boundaryTerrain(settings, chunkX, chunkZ);
  return {
    terrain,
    bridges,
    fingerprint: fingerprintValues(
      chunkX,
      chunkZ,
      ...terrain.flatMap((sample) => [sample.x, sample.z, Math.round(sample.height * 10_000)]),
      ...bridges.flatMap((line) => [line.axis, line.lineIndex, line.enabled, Math.round(line.height * 1000)]),
    ),
  };
};
