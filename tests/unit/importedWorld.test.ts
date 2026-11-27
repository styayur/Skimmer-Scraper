import { IDBFactory } from 'fake-indexeddb';
import { BoxGeometry, Group, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createRunRules, updateRunRules } from '../../src/game/runRules';
import { ImportedWorldAdapter } from '../../src/world/imports/importedWorldAdapter';
import { analyzeWorldScene } from '../../src/world/imports/sceneAnalyzer';
import { inspectWorldGlb } from '../../src/world/imports/worldGlbPreflight';
import { defaultWorldImportOptions, type WorldManifest } from '../../src/world/imports/worldManifest';
import { WorldResourceManager } from '../../src/world/imports/worldResourceManager';
import { createWorldFixture, encodeGlb } from '../fixtures/worldGlb';

const dataOf = (bytes: Buffer): ArrayBuffer => Uint8Array.from(bytes).buffer;
const manifest: WorldManifest = {
  id: 'a'.repeat(64), name: 'Local courtyard', bytes: 100, nodes: 4, triangles: 36, collisionTriangles: 24,
  materials: 1, textures: 0, texturePixels: 0, bounds: { x: 100, y: 12, z: 100 },
  animations: [], meshRoles: [], options: defaultWorldImportOptions,
};

describe('local world GLB preflight', () => {
  it('accepts binary scenes and rejects external resources before loading', () => {
    expect(inspectWorldGlb(dataOf(createWorldFixture('building'))).texturePixels).toBe(0);
    expect(() => inspectWorldGlb(dataOf(createWorldFixture('building', true)))).toThrow(/external URI/);
  });

  it('limits graph and texture allocation before decoding', () => {
    const asset = { version: '2.0' };
    expect(() => inspectWorldGlb(dataOf(encodeGlb({ asset, nodes: [{ children: [1] }, { children: [0] }] })))).toThrow(/循环/);
    expect(() => inspectWorldGlb(dataOf(encodeGlb({ asset, nodes: Array.from({ length: 2501 }, () => ({})) })))).toThrow(/预算/);
    expect(() => inspectWorldGlb(dataOf(encodeGlb({ asset, extensionsRequired: ['UNKNOWN_test'] })))).toThrow(/UNKNOWN_test/);
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(0x49484452, 12);
    png.writeUInt32BE(12_000, 16);
    png.writeUInt32BE(12_000, 20);
    expect(() => inspectWorldGlb(dataOf(encodeGlb({ asset, images: [{ uri: `data:image/png;base64,${png.toString('base64')}` }] })))).toThrow(/8192/);
  });
});

describe('finite local world', () => {
  it('uses transformed surfaces for proximity, obstacles for impact and excludes scenery', () => {
    const scene = new Group();
    const platform = new Mesh(new BoxGeometry(100, 1, 100));
    platform.position.y = 0.5;
    const obstacle = new Mesh(new BoxGeometry(8, 10, 8));
    obstacle.position.set(0, 7, -22);
    obstacle.userData.skimmerRole = 'OBSTACLE';
    const sky = new Mesh(new BoxGeometry(1000, 1, 1000));
    sky.name = 'Skybox_far';
    sky.position.y = 300;
    scene.add(platform, obstacle, sky);
    const analyzed = analyzeWorldScene(scene, defaultWorldImportOptions);
    const world = new ImportedWorldAdapter(manifest, analyzed, [scene]);
    expect(analyzed.bounds.max.y).toBe(12);
    const spot = { x: 0, y: 7, z: -17 };
    expect(world.queryNearest(spot, 5)?.distance).toBeCloseTo(1);
    expect(world.queryProximity(spot, 5)).toBeNull();
    expect(world.queryNearest({ x: 0, y: 300, z: 0 }, 5)).toBeNull();
    expect(world.getAdapterStats().bvhCount).toBe(2);
    expect(world.getStats().chunks).toBe(0);
    expect(world.isCollisionCovered({ x: 100_000, y: 50, z: 0 })).toBe(true);
    const impact = updateRunRules(createRunRules({ mode: 'challenge', shield: false }), { distance: null, collisionDistance: 1 }, 1 / 120);
    expect(impact.failureReason).toBe('impact');
    world.dispose();
    world.dispose();
    expect(world.getAdapterStats().bvhCount).toBe(0);
    expect(world.root.children).toHaveLength(0);
    expect(world.disposedGeometryCount).toBe(5);
  });

  it('stores the manifest and source transactionally and reads metadata separately', async () => {
    const factory = new IDBFactory();
    const writer = new WorldResourceManager(factory);
    const reader = new WorldResourceManager(factory);
    const bytes = new Uint8Array(100).fill(17);
    await writer.save(manifest, bytes.buffer);
    expect(await reader.list()).toEqual([manifest]);
    const restored = await reader.get(manifest.id);
    expect(new Uint8Array(restored!.data)).toEqual(bytes);
    await reader.remove(manifest.id);
    expect(await writer.list()).toEqual([]);
    expect(await writer.get(manifest.id)).toBeNull();
    writer.close();
    reader.close();
  });
});

describe('authored finite flight entry', () => {
  const make = (x: number, manual = false) => {
    const g = new Group();
    const floor = new Mesh(new BoxGeometry(200,2,200));
    floor.position.set(30,4,12);
    g.add(floor);
    g.userData.flightEntry = {version:1,position:[x,20,70],toward:[x,20,10]};
    g.userData.topology = {nodes:[{position:[30,20,20]}, {position:[0,Infinity,0]}]};
    const options = {...defaultWorldImportOptions,spawn: manual ? {x:10,y:30,z:20} : null};
    const scene = analyzeWorldScene(g,options);
    return new ImportedWorldAdapter({...manifest,options},scene,[g]);
  };
  it('normalizes entry and forward hints, preserving manual spawn priority', () => {
    const world = make(30);
    expect(world.getDefaultSpawn().position).toEqual({x:0,y:17,z:58});
    expect(world.routeHint({x:0,y:17,z:58},{x:0,y:0,z:-1})).toEqual({x:0,y:17,z:8});
    world.dispose();
    const manual = make(30,true);
    expect(manual.getDefaultSpawn().position).toEqual({x:10,y:30,z:20});
    manual.dispose();
    const distant = make(16000);
    expect(distant.getDefaultSpawn().position.x).toBeCloseTo(0);
    distant.dispose();
  });
});
