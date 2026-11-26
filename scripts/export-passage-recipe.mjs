import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const [output, rawSeed, ...sources] = process.argv.slice(2);
if (!output || !/^\d{1,10}$/.test(rawSeed ?? '') || !sources.length || sources.length > 16) {
  throw new Error('Usage: node scripts/export-passage-recipe.mjs <new recipe.json> <uint32 seed> <module.glb> ...');
}
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { inspectWorldGlb } = await server.ssrLoadModule('/src/world/imports/worldGlbPreflight.ts');
  const { analyzeWorldModule } = await server.ssrLoadModule('/src/world/procedural/moduleCatalog.ts');
  const { createPassageRecipe } = await server.ssrLoadModule('/src/world/procedural/passageGrammar.ts');
  const manager = new LoadingManager().setURLModifier(() => {
    throw new Error('Passage modules must be self-contained');
  });
  const loader = new GLTFLoader(manager);
  const modules = [];
  for (const file of sources) {
    if (!file.endsWith('.glb') || (await stat(file)).size > 8 * 1024 ** 2) {
      throw new Error('Each authored GLB must be at most 8 MiB');
    }
    const bytes = await readFile(file);
    const buffer = new Uint8Array(bytes).buffer;
    const preflight = inspectWorldGlb(buffer);
    if (preflight.texturePixels) {
      throw new Error('The recipe exporter supports static GLBs with untextured materials');
    }
    const gltf = await loader.parseAsync(buffer, '');
    if (gltf.animations.length) throw new Error('Passage modules must be static');
    modules.push(analyzeWorldModule(basename(file, '.glb'), createHash('sha256').update(bytes).digest('hex'), gltf.scene));
  }
  const { manifest } = createPassageRecipe(Number(rawSeed), modules);
  await writeFile(output, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
} finally {
  await server.close();
}
