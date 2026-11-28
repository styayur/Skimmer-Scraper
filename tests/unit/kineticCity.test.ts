import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshBVH } from 'three-mesh-bvh';
import { Mesh, Vector3 } from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { bestStorageKey, scoreContextFor } from '../../src/game/storage';
import { ChunkRevisionHistory } from '../../src/world/chunkRevisionHistory';
import { InlineChunkSource } from '../../src/world/chunkSource';
import { valleyAxis } from '../../src/world/dragonspineTerrain';
import { KineticChunkGenerator, type KineticPacket } from '../../src/world/kinetic/kineticChunk';
import { boundarySocket, junctionRow, kineticLayout, KINETIC_CATALOG_SHA256, KINETIC_MODULES } from '../../src/world/kinetic/recipe';
import { kineticLibrary } from '../../src/world/kinetic/sweep';
import { unpackGeometry, type PackedGeometry } from '../../src/world/packedGeometry';
import { buildWorldShareUrl, CHUNK_SIZE, worldSettingsFromSearch } from '../../src/world/worldConfig';
import { WorldStreamer } from '../../src/world/worldStreamer';

const settings = (seed = 334458, mode = 'stable') => worldSettingsFromSearch('?theme=kinetic-city&seed=' + seed + '&world=' + mode);
const digest = (geometry: PackedGeometry) => {
  const hash = createHash('sha256');
  for (const {array} of geometry.attributes) hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  if (geometry.index) hash.update(new Uint8Array(geometry.index.buffer, geometry.index.byteOffset, geometry.index.byteLength));
  return hash.digest('hex');
};
const tree = (packed: PackedGeometry) => new MeshBVH(unpackGeometry(packed));
const distance = (bvh: MeshBVH, p: Vector3) => bvh.closestPointToPoint(p)!.distance;
const evidence = {
  catalog:KINETIC_CATALOG_SHA256, surfaceErrorMetres:[] as Array<{seed:number; id:string; worst:number}>,
  visitOrder:[] as Array<{key:string; collisionSha256:string}>, eviction:[] as Array<{
    mode:string; beforeRevision:number; afterRevision:number; beforeFingerprint:number|null;
    afterFingerprint:number|null; residentBvhs:number; leasesChanged:boolean;
  }>, dragonSeamHeights:[] as number[],
};
afterAll(() => {
  if (process.env.KINETIC_EVIDENCE_FILE) writeFileSync(process.env.KINETIC_EVIDENCE_FILE,JSON.stringify(evidence,null,2)+'\n');
});

it('pins the source bytes, six shapes, world URLs and independent score keys', async () => {
  const bytes = readFileSync(new URL('../../src/world/kinetic/kinetic-flight-modules.r2.json', import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(KINETIC_CATALOG_SHA256);
  expect(JSON.parse(bytes.toString())).toMatchObject({format:'kinetic-module-library-1', units:'metres', chunkSize:220,
    ruleRevision:2, profile:{id:'skimmer-boost', speed:102}});
  expect((await kineticLibrary()).map(m => m.id)).toEqual(KINETIC_MODULES);
  const cities = ['?theme=kinetic-city&world=ephemeral', '?theme=dragonspine&spans=1', '?theme=dragonspine', '?gen=4'];
  const worlds = cities.map(worldSettingsFromSearch);
  for (const world of worlds) {
    expect(worldSettingsFromSearch(new URL(buildWorldShareUrl('https://example.org/game/', world)).search)).toEqual(world);
  }
  expect(new Set(worlds.map(w => bestStorageKey(scoreContextFor(w)))).size).toBe(4);
});

describe.each([334458, 17, 0xffffffff])('seed %i', seed => {
  it('keeps independent render, distant and collision surfaces within the authored error across the region', async () => {
    const gen = new KineticChunkGenerator(settings(seed));
    const modules = await kineticLibrary();
    const seen = new Set<string>();
    try {
      for (let z = -4; z < 0; z++) for (let x = -4; x < 0; x++) {
        const id = kineticLayout(seed, x, z, 0);
        if (id === 'junction' || seen.has(id)) continue;
        seen.add(id);
        const module = modules.find(m => m.id === id)!;
        const packet = await gen.prepare(x, z, 0);
        const collider = tree(packet.collision);
        expect(packet.distantRoad!.index!.length).toBeLessThan(packet.road.index!.length);
        let worst = 0;
        for (const packed of [packet.road, packet.distantRoad!]) {
          const geometry = unpackGeometry(packed);
          const points = geometry.getAttribute('position'), index = geometry.index!;
          const p = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
          for (let i = 0; i < points.count; i++) worst = Math.max(worst, distance(collider, p.fromBufferAttribute(points, i)));
          for (let i = 0; i < index.count; i += 3) {
            a.fromBufferAttribute(points, index.getX(i));
            b.fromBufferAttribute(points, index.getX(i+1));
            c.fromBufferAttribute(points, index.getX(i+2));
            worst = Math.max(worst, distance(collider, p.copy(a).add(b).add(c).divideScalar(3)));
          }
          geometry.dispose();
        }
        expect(worst, id).toBeLessThanOrEqual(module.collisionTolerance);
        evidence.surfaceErrorMetres.push({seed,id,worst});
        const offset = new Vector3().copy(packet.origin);
        for (const hint of packet.topology.hints.filter(h => h.kind === 'route')) {
          expect(distance(collider, new Vector3().copy(hint.position).sub(offset)), id).toBeGreaterThan(1.5);
        }
        collider.geometry.dispose();
      }
      expect([...seen].sort()).toEqual([...KINETIC_MODULES].sort());
    } finally { gen.dispose(); }
  });
});

it('joins the two axes at exact flat sockets across revisions and either render LOD', async () => {
  const seed = 17, gen = new KineticChunkGenerator(settings(seed));
  const row = junctionRow(seed, -1);
  const west = await gen.prepare(-2, row, 8), junction = await gen.prepare(-1, row, 3);
  const north = await gen.prepare(-1, row-1, 7), south = await gen.prepare(-1, row+1, 2);
  const east = await gen.prepare(0, row, 13);
  function check(a: KineticPacket, b: KineticPacket, face: 'W' | 'N') {
    const socket = boundarySocket(seed, face, b.chunkX, b.chunkZ);
    for (const packet of [a,b]) for (const shape of [packet.road, packet.distantRoad, packet.collision]) {
      if (!shape) continue;
      const collider = tree(shape);
      for (const side of [-15.9,-9,0,9,15.9]) {
        const p = new Vector3().copy(socket).sub(packet.origin);
        if (face === 'W') p.z += side;
        else p.x += side;
        expect(distance(collider, p)).toBeLessThan(0.0001);
        p.y += 4;
        expect(distance(collider, p)).toBeGreaterThan(3.8);
      }
      collider.geometry.dispose();
    }
  }
  try {
    check(west,junction,'W'); check(junction,east,'W'); check(north,junction,'N'); check(junction,south,'N');
  } finally { gen.dispose(); }
});

it('regenerates byte-identical mesh buffers after different visit orders', async () => {
  const coordinates = [[-1,-5], [2,0], [4,-1], [-4,3]] as const;
  const visit = async (order: ReadonlyArray<readonly [number,number]>) => {
    const gen = new KineticChunkGenerator(settings());
    const chunks = new Map<string, {topology:KineticPacket['topology']; fingerprint:number; render:string;
      near:string; collision:string; distant:string|null}>();
    try {
      for (const [x,z] of order) {
        const p = await gen.prepare(x,z,0);
        chunks.set(p.key, {topology:p.topology,fingerprint:p.fingerprint,render:digest(p.render),near:digest(p.road),
          collision:digest(p.collision),distant:p.distantRoad && digest(p.distantRoad)});
      }
    } finally { gen.dispose(); }
    return chunks;
  };
  const original = await visit(coordinates);
  expect(original).toEqual(await visit([...coordinates].reverse()));
  for (const [key, value] of original) evidence.visitOrder.push({key,collisionSha256:value.collision});
});

it.each(['stable','ephemeral'])('expires live leases across eviction and rebases in %s mode', async mode => {
  const world = settings(17,mode), history = new ChunkRevisionHistory(9);
  const stream = new WorldStreamer(world, {
    maxLoadedChunks:9, revisionProvider:mode === 'stable' ? undefined : (x,z) => history.revisionFor(x,z),
    onChunkActivated: c => history.markActive(c.chunkX,c.chunkZ,c.revision),
    onChunkRetired: c => history.markRetired(c.chunkX,c.chunkZ,c.revision),
  });
  const home = stream.getDefaultSpawn().position;
  const homeChunk = () => stream.getChunkStates().find(c => c.key === Math.floor(home.x/220)+':'+Math.floor(home.z/220))!;
  try {
    await stream.prime(home);
    const before = homeChunk(), hint = stream.semanticCandidates(home).find(h => h.semantic.kind === 'socket')!;
    expect(hint).toBeDefined();
    expect(hint.semantic.capabilities).toContain('release');
    expect(stream.routeHint(home,{x:0,y:0,z:-1})).toBeDefined();
    const remote = {x:home.x+15400, y:home.y, z:home.z-15400};
    await stream.prime(remote);
    expect(stream.semanticCandidates(home)).toEqual([]);
    expect(stream.getRenderOrigin().x).toBe(10000);
    expect(stream.getStreamerStats().activeChunks).toBe(9);
    await stream.prime(home);
    const restored = stream.semanticCandidates(home).find(h => h.semantic.id === hint.semantic.id)!;
    expect(restored.position).toEqual(hint.position);
    expect(restored.lease).not.toBe(hint.lease);
    expect(homeChunk().fingerprint === before.fingerprint).toBe(mode === 'stable');
    expect(homeChunk().revision === before.revision).toBe(mode === 'stable');
    expect(stream.getAdapterStats().bvhCount).toBe(9);
    evidence.eviction.push({mode,beforeRevision:before.revision,afterRevision:homeChunk().revision,
      beforeFingerprint:before.fingerprint,afterFingerprint:homeChunk().fingerprint,
      residentBvhs:stream.getAdapterStats().bvhCount,leasesChanged:restored.lease !== hint.lease});
  } finally { stream.dispose(); }
  expect(stream.semanticCandidates(home)).toEqual([]);
  expect(stream.getAdapterStats().bvhCount).toBe(0);
});

it('clips the same sky-arch deck at a Dragonspine canyon boundary in each owning chunk', async () => {
  const seed = 334458, z = -90;
  const centre = valleyAxis(z,seed,0);
  const boundary = Math.round(centre/CHUNK_SIZE)*CHUNK_SIZE;
  const source = new InlineChunkSource(worldSettingsFromSearch('?theme=dragonspine&spans=1&seed='+seed));
  const crossings = [];
  try {
    for (const x of [boundary-1,boundary+1]) {
      const c = await source.generate({chunkX:Math.floor(x/220),chunkZ:Math.floor(z/220),revision:0});
      const mesh = c.group.getObjectByName('dragonspine-sky-arch') as Mesh;
      expect(mesh).toBeDefined();
      const localX = boundary-c.origin.x, position = mesh.geometry.getAttribute('position');
      const heights = [];
      for (let i=0; i<position.count; i++) if (Math.abs(position.getX(i)-localX)<0.0001) heights.push(position.getY(i));
      const high = Math.max(...heights);
      expect(Number.isFinite(high)).toBe(true);
      const collider = new MeshBVH(c.collisionGeometry);
      const query = new Vector3(localX,high,z-c.origin.z);
      expect(distance(collider,query)).toBeLessThan(0.16);
      const above = query.add(new Vector3(0,5,0));
      const visibleClearance = distance(new MeshBVH(mesh.geometry), above);
      expect(visibleClearance).toBeGreaterThan(4);
      expect(Math.abs(distance(collider,above) - visibleClearance)).toBeLessThan(0.16);
      crossings.push(high);
      c.group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
      c.collisionGeometry.dispose();
    }
  } finally { source.dispose(); }
  expect(crossings[0]).toBeCloseTo(crossings[1]!,4);
  evidence.dragonSeamHeights.push(...crossings);
});
