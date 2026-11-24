import { describe, expect, it, vi } from 'vitest';
import { Box3, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { createProceduralAircraft } from '../../src/render/proceduralAircraft';
import { CrownbackFlight, crownbackPatrol, patrolPhase } from '../../src/world/crownbackFlight';
import { DynamicColliderRegistry } from '../../src/world/dynamicColliderRegistry';
import { buildWorldShareUrl, worldSettingsFromSearch } from '../../src/world/worldConfig';

describe('Crownback flight', () => {
  it('shares a deterministic patrol across chunk boundaries and rests at the seam', () => {
    const route = crownbackPatrol(334458,0,0);
    const rerun = crownbackPatrol(334458,0,0);
    const adjacent = crownbackPatrol(334458,1,0);
    for (const t of [0,14,59,133,160,169,191,192]) {
      const u = patrolPhase(t);
      expect(route.getPointAt(u).distanceTo(rerun.getPointAt(u))).toBe(0);
      expect(route.getPointAt(u).distanceTo(adjacent.getPointAt(u))).toBeGreaterThan(3400);
      expect(patrolPhase(t+192)).toBeCloseTo(u,10);
    }
    expect(patrolPhase(160)).toBe(0);
    expect(patrolPhase(175)).toBe(0);
    expect(route.getPointAt(patrolPhase(159.99)).distanceTo(route.getPointAt(0))).toBeLessThan(.01);
    const xCoordinates=route.getSpacedPoints(96).map(point=>point.x);
    expect(Math.max(...xCoordinates)-Math.min(...xCoordinates)).toBeGreaterThan(1200);
  });

  it('advances bone colliders in world coordinates across an origin shift and retires them at distance', async () => {
    vi.stubGlobal('document',{baseURI:'https://game.example/'});
    vi.stubGlobal('fetch',async (url: URL) => new Response(readFileSync(new URL('../../public'+url.pathname,import.meta.url))));
    const registry=new DynamicColliderRegistry();
    const flight=new CrownbackFlight(334458,registry);
    try {
      await vi.waitFor(()=>expect(flight.snapshot()).toHaveLength(1));
      flight.cover(flight.residentPosition);
      flight.step(1/120);
      expect(registry.count).toBe(13);
      const point=flight.residentPosition.clone();
      const hit=registry.queryNearest(point,35);
      expect(hit?.surfaceId).toMatch(/crownback/);
      flight.shiftOrigin({x:1760,y:0,z:-2200});
      flight.step(0);
      expect(registry.queryNearest(point,35)?.distance).toBeCloseTo(hit!.distance,7);
      flight.cover({x:10000,y:10000,z:10000});
      flight.step(1/120);
      expect(registry.count).toBe(0);
    } finally {
      flight.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('preserves the legacy theme and round-trips the new one', () => {
    for (const theme of ['dragon','ascendant']) {
      const settings = worldSettingsFromSearch('?theme='+theme+'&seed=334458');
      expect(settings.theme).toBe(theme);
      expect(worldSettingsFromSearch(new URL(buildWorldShareUrl('https://example.org/',settings)).search)).toEqual(settings);
    }
  });

  it('ships a 35–80 aircraft-span skinned hero with the same bones at every detail level', () => {
    const plane = createProceduralAircraft();
    const planeSpan = new Box3().setFromObject(plane.group,true).getSize(new Vector3()).x;
    plane.dispose();
    let previousVertices = 0;
    for (const tier of ['far','middle','near']) {
      const glb = readFileSync(new URL('../../public/realms/ascendant/crownback-'+tier+'.glb',import.meta.url));
      const gltf = JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
      const bones = gltf.skins[0].joints.map((id: number) => gltf.nodes[id].name);
      expect(bones.sort()).toEqual(['Chest','Neck','Crown','Tail','Fan','Port','PortHand','Starboard','StarboardHand'].sort());
      expect(gltf.animations.length).toBeGreaterThan(0);
      let xmin = Infinity, xmax = -Infinity, vertices = 0;
      for (const primitive of gltf.meshes[0].primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        xmin = Math.min(xmin,accessor.min[0]); xmax = Math.max(xmax,accessor.max[0]);
        vertices += accessor.count;
      }
      expect((xmax-xmin)/planeSpan).toBeGreaterThan(35);
      expect((xmax-xmin)/planeSpan).toBeLessThan(80);
      expect(vertices).toBeGreaterThan(previousVertices);
      previousVertices=vertices;
    }
  });
});
