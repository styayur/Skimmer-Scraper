import { describe, it, expect } from 'vitest';
import * as T from 'three';
import { AscendantChunkGenerator } from '../../src/world/ascendantChunk';
import { ascendantFloor, valleyAxis, VALLEY_SPACING } from '../../src/world/ascendantTerrain';
import { islandFaces, islandsAround } from '../../src/world/ascendantIslands';
import { crownbackPatrol } from '../../src/world/crownbackFlight';
import { worldSettingsFromSearch } from '../../src/world/worldConfig';

describe('Ascendant bedrock',()=>{
  const seed=334458;
  it('joins neighbouring watersheds and reaches the high dragon domain above the gorge',()=>{
    let high=-Infinity,low=Infinity;
    for(let z=-1600;z<1600;z+=50){
      const boundary=VALLEY_SPACING/2;
      expect(Math.abs(ascendantFloor(boundary-.01,z,seed)-ascendantFloor(boundary+.01,z,seed))).toBeLessThan(.1);
      for(let x=-850;x<850;x+=50){
        const y=ascendantFloor(x,z,seed);
        high=Math.max(high,y);low=Math.min(low,y);
      }
    }
    expect(high-low).toBeGreaterThan(1100);
  });
  it('owns each island once as the pilot crosses chunk borders and keeps openings at all LODs',()=>{
    const many=islandsAround(seed,0,0,1550);
    expect(new Set(many.map(s=>s.id)).size).toBe(many.length);
    expect(new Set(many.map(s=>s.kind)).size).toBe(5);
    for(const site of many){
      const near=islandsAround(seed,site.x+110,site.z,220);
      expect(near.find(item=>item.id===site.id)).toEqual(site);
      expect(islandFaces(site,'near').length).toBeGreaterThan(islandFaces(site,'far').length);
    }
    for(const testSeed of [seed,17,12345,0,0xffffffff]){
      const perch=islandsAround(testSeed,0,0,1550).find(a=>a.kind==='nest')!;
      expect(crownbackPatrol(testSeed,0,0).getPoint(0).y-perch.y).toBeCloseTo(24,5);
    }
  });
  it('lets a pilot pass underneath a thick rock vault across independently owned chunks',()=>{
    const gen=new AscendantChunkGenerator(worldSettingsFromSearch('?theme=ascendant&seed='+seed));
    const z=-230, x=valleyAxis(z,seed,0);
    const world=new T.Group();
    const chunks=[];
    for(let cx=-2;cx<=1;cx++)for(let cz=-2;cz<=-1;cz++){
      const chunk=gen.generate(cx,cz,0);
      chunks.push(chunk); world.add(chunk.group);
      const {min,max}=chunk.bounds;
      expect(Math.min(min.x,min.z)).toBeGreaterThanOrEqual(-.0001);
      expect(Math.max(max.x,max.z)).toBeLessThanOrEqual(220.0001);
    }
    world.updateMatrixWorld(true);
    const y=ascendantFloor(x,z,seed)+48;
    const cast=(direction:T.Vector3)=>new T.Raycaster(new T.Vector3(x,y,z),direction,0,400).intersectObject(world,true);
    expect(cast(new T.Vector3(0,-1,0))[0]!.distance).toBeCloseTo(48,-1);
    const overhead=cast(new T.Vector3(0,1,0));
    expect(overhead[0]!.distance).toBeGreaterThan(40);
    expect(overhead.at(-1)!.distance-overhead[0]!.distance).toBeGreaterThan(35);
    expect(cast(new T.Vector3(0,0,-1)).filter(hit=>hit.distance<75)).toHaveLength(0);
    for(const c of chunks){
      c.collisionGeometry.dispose(); c.group.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});
    }
    gen.dispose();
  });
});
