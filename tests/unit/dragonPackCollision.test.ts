import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { DragonspineChunkGenerator } from '../../src/world/dragonspineChunk';
import { resolveWorldSettings } from '../../src/world/worldConfig';
import { validatePack } from '../../src/platform/worldPacks';

const directories = ['public/realms/dragonspine/web'];
if (process.env.SKIMMER_TEST_HIGH_PACK)
  directories.push(process.env.SKIMMER_TEST_HIGH_PACK);

it.each(directories)(
  'matches shipped terrain vertices to the shared collision mesh in %s',
  (directory) => {
    const pack = validatePack(
      JSON.parse(readFileSync(path.join(directory, 'world-pack.json'), 'utf8')),
    );
    const settings=resolveWorldSettings({seed:String(pack.seed)});
    const generator=new DragonspineChunkGenerator({...settings,theme:'dragonspine'});
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 0.161);
    let largestError = 0;
    for (const file of pack.files) {
      const data = readFileSync(path.join(directory, file.name));
      const jsonLength = data.readUInt32LE(12);
      const model = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
      const accessor =
        model.accessors[model.meshes[0].primitives[0].attributes.POSITION];
      const view = model.bufferViews[accessor.bufferView];
      const start =
        28 + jsonLength + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const chunk = generator.generate(file.cx, file.cz, 0);
      const collision = new Mesh(chunk.collisionGeometry, material);
      for (let i = 0; i < 21; i++) {
        const vertex = Math.floor(((i + 0.37) * accessor.count) / 21);
        const offset = start + vertex * (view.byteStride ?? 12);
        const y = data.readFloatLE(offset + 4);
        ray.ray.origin.set(
          data.readFloatLE(offset),
          y + 0.08,
          data.readFloatLE(offset + 8),
        );
        const hit = ray.intersectObject(collision, false)[0];
        expect(hit, file.name + ' vertex ' + vertex).toBeDefined();
        largestError = Math.max(largestError, Math.abs(hit!.point.y - y));
      }
      chunk.collisionGeometry.dispose();
      for (const child of chunk.group.children)
        if (child instanceof Mesh) child.geometry.dispose();
    }
    generator.dispose();
    material.dispose();
    expect(largestError).toBeLessThan(0.076);
    console.log(
      pack.id,
      'tiles',
      pack.files.length,
      'rays',
      pack.files.length * 21,
      'maximum vertical separation (m)',
      largestError,
    );
  },
  60000,
);
