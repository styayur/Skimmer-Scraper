import * as THREE from 'three';
import { ChunkGenerator } from './chunkGenerator';
import { fingerprintValues } from './deterministic';
import { terrainHeightAt } from './terrain';
import type { CollisionChunk, WorldData } from './worldTypes';
import type { WorldSettings } from './worldConfig';

export interface GenerateWorldOptions {
  chunkRadius?: number;
  revisionForChunk?: (chunkX: number, chunkZ: number) => number;
}

export const SPAWN_X = 0;
export const SPAWN_Z = 120;

export const generateSeededWorld = (
  settings: WorldSettings,
  options: GenerateWorldOptions = {},
): WorldData => {
  const radius = Math.max(0, Math.floor(options.chunkRadius ?? 2));
  const generator = new ChunkGenerator(settings);
  const root = new THREE.Group();
  root.name = `seeded-city-${settings.seed}-${settings.preset}`;
  const chunks: CollisionChunk[] = [];
  const fingerprints: number[] = [];
  let buildings = 0;
  let bridges = 0;
  let islands = 0;
  let collisionTriangles = 0;
  let renderTriangles = 0;

  for (let chunkZ = -radius; chunkZ <= radius; chunkZ += 1) {
    for (let chunkX = -radius; chunkX <= radius; chunkX += 1) {
      const revision = options.revisionForChunk?.(chunkX, chunkZ) ?? 0;
      const generated = generator.generate(chunkX, chunkZ, revision);
      root.add(generated.group);
      chunks.push({
        id: generated.key,
        chunkX,
        chunkZ,
        origin: { ...generated.origin },
        bounds: generated.bounds,
        geometry: generated.collisionGeometry,
      });
      fingerprints.push(generated.fingerprint);
      buildings += generated.stats.buildings;
      bridges += generated.stats.bridges;
      islands += generated.stats.islands;
      collisionTriangles += generated.stats.collisionTriangles;
      renderTriangles += generated.stats.renderTriangles;
    }
  }

  const spawnGround = terrainHeightAt(SPAWN_X, SPAWN_Z, settings);
  const world: WorldData = {
    seed: settings.seed,
    settings,
    root,
    chunks,
    spawn: {
      position: { x: SPAWN_X, y: spawnGround + 24, z: SPAWN_Z },
      yaw: 0,
      pitch: -0.015,
      speed: 66,
    },
    stats: {
      chunks: chunks.length,
      buildings,
      bridges,
      islands,
      collisionTriangles,
      renderTriangles,
    },
    fingerprint: fingerprintValues(...fingerprints),
    dispose: () => {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      generator.dispose();
    },
  };
  return world;
};
