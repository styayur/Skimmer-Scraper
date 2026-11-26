import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Group, InstancedMesh, Matrix4, Mesh } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const [output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/compare-passage-packs.mjs <new output directory>');
const seed = 334458;
const moduleId = 'celadon-court';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gzip = bytes => gzipSync(bytes, { level: 9 });
const stats = bytes => ({ bytes: bytes.length, sha256: sha256(bytes), gzipBytes: gzip(bytes).length });

// Three's binary glTF exporter only uses the ArrayBuffer branch for these texture-free inputs.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { analyzeWorldModule } = await server.ssrLoadModule('/src/world/procedural/moduleCatalog.ts');
  const { createPassageRecipe } = await server.ssrLoadModule('/src/world/procedural/passageGrammar.ts');
  const source = await readFile('public/world-modules/' + moduleId + '.glb');
  const loader = new GLTFLoader();
  const { scene } = await loader.parseAsync(Uint8Array.from(source).buffer, '');
  const recipe = createPassageRecipe(seed, [analyzeWorldModule(moduleId, sha256(source), scene)]);
  const manifest = Buffer.from(JSON.stringify(recipe.manifest, null, 2) + '\n');
  const render = new Group();
  const collision = new Group();
  const coordinates = [];
  const instanceMatrix = new Matrix4();
  const transform = new Matrix4();
  for (let z = 0; z < 8; z += 2) {
    for (let x = 0; x < 8; x += 2) {
      const passage = recipe.generate(x, z);
      coordinates.push([x, z]);
      passage.render.updateMatrixWorld(true);
      const detailed = passage.render.getObjectByName('generated-passage-lod').levels[0].object;
      for (const batch of detailed.children) {
        if (!(batch instanceof InstancedMesh)) throw new Error('Expected an instanced passage batch');
        for (let i = 0; i < batch.count; i++) {
          batch.getMatrixAt(i, instanceMatrix);
          transform.multiplyMatrices(batch.matrixWorld, instanceMatrix);
          render.add(new Mesh(batch.geometry.clone().applyMatrix4(transform), batch.material));
        }
      }
      const { x: offsetX, z: offsetZ } = passage.render.position;
      collision.add(new Mesh(passage.collision.clone().translate(offsetX, 0, offsetZ)));
      passage.dispose();
    }
  }
  const exporter = new GLTFExporter();
  const encode = async group => Buffer.from(await exporter.parseAsync(group, { binary: true }));
  const bakedRender = await encode(render);
  const bakedCollision = await encode(collision);
  const triangleCount = root => {
    let count = 0;
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      count += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
    });
    return count;
  };
  for (const [bytes, original] of [[bakedRender, render], [bakedCollision, collision]]) {
    const reloaded = await loader.parseAsync(Uint8Array.from(bytes).buffer, '');
    if (triangleCount(reloaded.scene) !== triangleCount(original)) throw new Error('Baked triangle count changed');
  }
  const report = {
    seed,
    coordinates,
    scope: 'Same detailed passage triangles and static colliders; excludes the base city, runtime code, and other LODs.',
    renderTriangles: triangleCount(render),
    collisionTriangles: triangleCount(collision),
    generated: { source: stats(source), manifest: stats(manifest) },
    baked: { render: stats(bakedRender), collision: stats(bakedCollision) },
    compression: 'Each GLB or manifest was gzipped separately at level 9.',
  };
  await mkdir(output);
  await writeFile(join(output, moduleId + '.glb'), source);
  await writeFile(join(output, 'recipe.json'), manifest);
  await writeFile(join(output, 'baked-render.glb'), bakedRender);
  await writeFile(join(output, 'baked-collision.glb'), bakedCollision);
  await writeFile(join(output, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  await server.close();
}
