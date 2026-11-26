import { expect, it } from 'vitest';
import { MeshBVH } from 'three-mesh-bvh';
import { Vector3 } from 'three';
import { ForgeChunkGenerator } from '../../src/world/procedural/forgeChunk';
import { forgeFloor, forgeLanes } from '../../src/world/procedural/forgeAirspace';
import { worldSettingsFromSearch } from '../../src/world/worldConfig';

it('reproduces individual chunks and changes terrain, vault layouts and branches across seeds', () => {
  const plans = new Set<string>(), worlds = new Set<string>();
  for (const seed of ['quartz','delta','amber','silica']) {
    const settings = worldSettingsFromSearch('?theme=worldforge&seed='+seed);
    expect(settings.theme).toBe('worldforge');
    const generator = new ForgeChunkGenerator(settings);
    const plan=forgeLanes(settings.seed);
    plans.add(JSON.stringify(plan));
    const route=[];
    for(let z=-2;z<=1;z++){
      const chunk=generator.generate(0,z,0);
      const repeat=generator.generate(0,z,0);
      expect(chunk.collisionGeometry.attributes.position!.array).toEqual(repeat.collisionGeometry.attributes.position!.array);
      const tree=new MeshBVH(chunk.collisionGeometry);
      for(let localZ=5;localZ<220;localZ+=15){
        const wz=z*220+localZ;
        const x=Math.max(0,plan.bend*(Math.sin((wz-120)/480+plan.phase)-Math.sin(plan.phase)));
        const point=new Vector3(x,forgeFloor(x,wz,plan)+24,localZ);
        expect(tree.closestPointToPoint(point)!.distance).toBeGreaterThan(3.2);
      }
      route.push([chunk.stats.bridges,chunk.stats.islands,chunk.fingerprint]);
      chunk.collisionGeometry.dispose(); repeat.collisionGeometry.dispose();
    }
    worlds.add(JSON.stringify(route));
    generator.dispose();
  }
  expect(plans.size).toBe(4);
  expect(worlds.size).toBe(4);
});
