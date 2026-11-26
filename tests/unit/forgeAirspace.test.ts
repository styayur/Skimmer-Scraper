import { describe, expect, it } from 'vitest';
import { MeshBVH } from 'three-mesh-bvh';
import { Vector3 } from 'three';
import { ForgeChunkGenerator } from '../../src/world/procedural/forgeChunk';
import { FORGE_CRUISE_HEIGHT, forgeLanes } from '../../src/world/procedural/forgeAirspace';
import { unpackGeometry } from '../../src/world/packedGeometry';
import { CHUNK_SIZE, worldSettingsFromSearch } from '../../src/world/worldConfig';

// Distance to a closed triangle mesh is 1-Lipschitz. Testing an inflated sphere
// at each sample bounds the player's swept sphere between adjacent samples.
describe.each(['amber', 'quartz', 'delta', 'silica'])('WorldForge airspace, seed %s', seed => {
  it('keeps the main, transverse and available diagonal routes open across tile boundaries', () => {
    const settings = worldSettingsFromSearch('?theme=worldforge&seed=' + seed);
    const plan = forgeLanes(settings.seed);
    const generator = new ForgeChunkGenerator(settings);
    const trees = new Map<string, MeshBVH>();
    const envelope = 6;
    const spacing = 4;
    const routes = [
      (t: number) => [plan.bend * (Math.sin((t - 120) / 480 + plan.phase) - Math.sin(plan.phase)), t],
      (t: number) => [t, -90 * Math.sin(t / 570 + plan.phase)],
    ];
    if (plan.diagonal) routes.push(t => [-plan.direction * t * .48 / .72, t]);
    try {
      for (const route of routes) {
        let previous: Vector3 | undefined;
        for (let t = -900; t <= 900; t += spacing) {
          const [x, z] = route(t) as [number, number];
          const point = new Vector3(x, FORGE_CRUISE_HEIGHT, z);
          const radius = envelope + (previous?.distanceTo(point) ?? 0) / 2;
          previous = point;
          for (let cx = Math.floor((x-radius)/CHUNK_SIZE); cx <= Math.floor((x+radius)/CHUNK_SIZE); cx++) {
            for (let cz = Math.floor((z-radius)/CHUNK_SIZE); cz <= Math.floor((z+radius)/CHUNK_SIZE); cz++) {
              const key = cx + ':' + cz;
              let tree = trees.get(key);
              if (!tree) {
                const packet = generator.prepare(cx, cz, 0);
                const geometry = unpackGeometry(packet.collision);
                const visiblePositions = packet.render.attributes.find(attribute => attribute.name === 'position')!;
                expect(geometry.getAttribute('position').array).toEqual(visiblePositions.array);
                tree = new MeshBVH(geometry);
                trees.set(key, tree);
              }
              const local = new Vector3(x-cx*CHUNK_SIZE, point.y, z-cz*CHUNK_SIZE);
              const hit = tree.closestPointToPoint(local, undefined, 0, radius);
              expect(hit?.distance ?? Infinity, 'Obstructed at ' + point.toArray() + ' in ' + key).toBeGreaterThan(radius);
            }
          }
        }
      }
    } finally {
      for (const tree of trees.values()) tree.geometry.dispose();
      generator.dispose();
    }
  });
});
