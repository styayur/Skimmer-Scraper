import { createHash } from 'node:crypto';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ImportedWorldAdapter } from '../../src/world/imports/importedWorldAdapter';
import { analyzeWorldScene } from '../../src/world/imports/sceneAnalyzer';
import { WorldImporter } from '../../src/world/imports/worldImporter';
import { defaultWorldImportOptions, type WorldManifest } from '../../src/world/imports/worldManifest';
import { decodeImportedWorldSeed, encodeImportedWorldSeed, isImportedSeed } from '../../src/world/imports/worldVariantSeed';
import { createWorldFixture } from '../fixtures/worldGlb';

const fingerprint = 'ab'.repeat(32);

const makeCity = () => {
  const scene = new Group();
  const district = new Group();
  scene.add(district);
  const box = (size: [number, number, number], center: [number, number, number]) => {
    const mesh = new Mesh(new BoxGeometry(...size));
    mesh.position.set(...center);
    district.add(mesh);
    return mesh;
  };
  box([260, 1, 300], [0, 0.5, 0]);
  const east = box([26, 64, 24], [88, 32, -52]);
  box([31, 48, 28], [-83, 24, -58]);
  box([26, 9, 34], [-50, 35, 70]);
  const pier = box([8, 32, 16], [25, 16, 0]);
  box([8, 32, 16], [-25, 16, 0]);
  const deck = box([58, 6, 16], [0, 32, 0]);
  return { scene, district, east, pier, deck };
};

const buildCity = (seed?: number) => {
  const city = makeCity();
  const analyzed = analyzeWorldScene(city.scene, defaultWorldImportOptions, undefined,
    seed === undefined ? undefined : { fingerprint, seed });
  const manifest: WorldManifest = {
    id: fingerprint, name: 'Original fixture', bytes: 1, nodes: analyzed.nodes, triangles: analyzed.triangles,
    materials: analyzed.materials, textures: analyzed.textures, texturePixels: 0, bounds: { x: 0, y: 0, z: 0 },
    animations: [], meshRoles: analyzed.meshRoles, collisionTriangles: analyzed.collisionTriangles,
    options: defaultWorldImportOptions,
    ...(seed !== undefined && analyzed.variant ? { variant: { ...analyzed.variant, seed } } : {}),
  };
  return {
    ...city, analyzed,
    world: new ImportedWorldAdapter(manifest, analyzed, [city.scene]),
    matrices: city.district.children.map(mesh => mesh.matrixWorld.toArray()),
  };
};

describe('imported world seed', () => {
  it('round-trips the fingerprint and exact import configuration without including the GLB', () => {
    const options = {
      scale: 1.3, yaw: 23, up: 'z' as const, spawnYaw: 19, spawn: { x: 14, y: 118, z: -22 },
      roles: { '3': 'OBSTACLE' as const },
      motion: { clip: 0, loop: false, paths: { '4': null, '7': { offset: { x: -3, y: 14, z: 21 }, seconds: 1.8 } } },
    };
    const identity = { fingerprint, variant: 0xffff_ffff, options };
    const code = encodeImportedWorldSeed(identity);
    expect(isImportedSeed(code)).toBe(true);
    expect(isImportedSeed('glb-world:old-text-seed')).toBe(false);
    expect(isImportedSeed('334458')).toBe(false);
    expect(decodeImportedWorldSeed(`  ${code}  `)).toEqual(identity);
    expect(JSON.stringify(decodeImportedWorldSeed(code).options)).toBe(JSON.stringify(options));
    expect(() => decodeImportedWorldSeed(`${code}!`)).toThrow(/种子/);
    expect(() => decodeImportedWorldSeed(code.slice(0, -8))).toThrow(/种子/);
  });
});

describe('structure-aware imported world layout', () => {
  it('changes real geometry relative to neighboring buildings while preserving bridge joints and collision', () => {
    const before = buildCity();
    const first = buildCity(13912);
    const repeat = buildCity(13912);
    const second = buildCity(2571);
    try {
      expect(first.analyzed.variant).toMatchObject({ layout: 'grouped' });
      expect(first.analyzed.variant!.movedGroups).toBeGreaterThan(1);
      expect(first.matrices).toEqual(repeat.matrices);
      expect(first.matrices).not.toEqual(before.matrices);
      expect(first.matrices).not.toEqual(second.matrices);

      const distanceRatio = ({ pier, deck, east }: ReturnType<typeof buildCity>) => {
        const anchor = pier.getWorldPosition(new Vector3());
        return east.getWorldPosition(new Vector3()).distanceTo(anchor) / deck.getWorldPosition(new Vector3()).distanceTo(anchor);
      };
      expect(Math.abs(distanceRatio(first) - distanceRatio(before))).toBeGreaterThan(0.04);
      for (const candidate of [first, repeat, second]) {
        const pierJoint = new Vector3(0, 14, 0).applyMatrix4(candidate.pier.matrixWorld);
        const deckJoint = new Vector3(25, -2, 0).applyMatrix4(candidate.deck.matrixWorld);
        expect(pierJoint.distanceTo(deckJoint)).toBeLessThan(1e-6);
        const top = new Vector3(0, 3, 0).applyMatrix4(candidate.deck.matrixWorld);
        expect(candidate.world.queryProximity(top, 1)?.distance).toBeLessThan(1e-4);
        expect(candidate.world.getStats().collisionTriangles).toBe(before.world.getStats().collisionTriangles);
        const spawn = candidate.world.getDefaultSpawn();
        for (let distance = 0; distance <= 58; distance += 2) {
          expect(candidate.world.queryNearest({ ...spawn.position, z: spawn.position.z - distance }, 6.5)).toBeNull();
        }
      }
      expect(first.world.getFingerprint()).toBe(repeat.world.getFingerprint());
      expect(first.world.getFingerprint()).not.toBe(second.world.getFingerprint());
    } finally {
      for (const { world } of [before, first, repeat, second]) world.dispose();
    }
  });

  it('keeps a merged scene whole and falls back when a generated layout exceeds the bounds budget', async () => {
    const raw = createWorldFixture('merged');
    const data = Uint8Array.from(raw).buffer;
    const id = createHash('sha256').update(raw).digest('hex');
    const importer = new WorldImporter();
    const baseline = await importer.load(data, 'One mesh', defaultWorldImportOptions, () => {});
    const changed = await importer.load(data, 'One mesh', defaultWorldImportOptions, () => {}, { variant: 1, fingerprint: id });
    try {
      expect(changed.manifest.variant).toEqual({ seed: 1, layout: 'whole', movedGroups: 0 });
      expect(changed.manifest.bounds).not.toEqual(baseline.manifest.bounds);
      expect(changed.manifest.collisionTriangles).toBe(baseline.manifest.collisionTriangles);
      expect(changed.manifest.meshRoles).toHaveLength(1);
      expect(new Uint8Array(data)).toEqual(new Uint8Array(raw));
      await expect(importer.load(data, 'Wrong GLB', defaultWorldImportOptions, () => {}, {
        variant: 1, fingerprint, exact: true,
      })).rejects.toThrow(/不匹配/);

      const large = { ...defaultWorldImportOptions, scale: 49 };
      const oversized = await importer.load(data, 'Near the limit', large, () => {});
      try {
        let rejected: number | undefined;
        for (let variant = 1; variant <= 12; variant++) {
          try {
            const attempt = await importer.load(data, 'Near the limit', large, () => {}, { variant, exact: true });
            attempt.dispose();
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toMatch(/12000/);
            rejected = variant;
            break;
          }
        }
        expect(rejected).toBeDefined();
        const fallback = await importer.load(data, 'Near the limit', large, () => {}, { variant: rejected! });
        try {
          expect(fallback.manifest.variant).toBeUndefined();
          expect(fallback.getDefaultSpawn()).toEqual(oversized.getDefaultSpawn());
          expect(fallback.manifest.bounds).toEqual(oversized.manifest.bounds);
        } finally { fallback.dispose(); }
      } finally { oversized.dispose(); }
    } finally {
      baseline.dispose();
      changed.dispose();
    }
  });
});
