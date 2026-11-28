import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const [output] = process.argv.slice(2);
if (!output) throw Error('Pass a new directory for the generated and baked packages.');
await mkdir(output);
const server = await createServer({server:{middlewareMode:true},logLevel:'error'});
const stats = data => ({bytes:data.length, gzipBytes:gzipSync(data,{level:9}).length, sha256:createHash('sha256').update(data).digest('hex')});
const total = entries => ({
  bytes:entries.reduce((sum,item)=>sum+item.bytes,0), gzipBytes:entries.reduce((sum,item)=>sum+item.gzipBytes,0),
});
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend(); }
};

try {
  const { KineticChunkGenerator } = await server.ssrLoadModule('/src/world/kinetic/kineticChunk.ts');
  const { unpackGeometry } = await server.ssrLoadModule('/src/world/packedGeometry.ts');
  const { worldSettingsFromSearch } = await server.ssrLoadModule('/src/world/worldConfig.ts');
  const { KINETIC_RECIPE, KINETIC_CATALOG_SHA256 } = await server.ssrLoadModule('/src/world/kinetic/recipe.ts');
  const seed = 334458;
  const recipe = {recipe:KINETIC_RECIPE, catalogSha256:KINETIC_CATALOG_SHA256, seed, revision:0,
    region:{x:-1,z:-1}, chunkSize:220, width:4, depth:4};
  const source = [];
  for (const [name, bytes] of [
    ['kinetic-flight-modules.r2.json',await readFile('src/world/kinetic/kinetic-flight-modules.r2.json')],
    ['profiles.json',await readFile('art/district/profiles.json')],
    ['region.json',Buffer.from(JSON.stringify(recipe)+'\n')],
  ]) {
    await writeFile(join(output,name), bytes);
    source.push({name,...stats(bytes)});
  }
  assert.equal(source[0].sha256,KINETIC_CATALOG_SHA256);
  const gen = new KineticChunkGenerator(worldSettingsFromSearch('?theme=kinetic-city&seed='+seed));
  const painted = new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:0.78,flatShading:true});
  painted.userData.flatShading = true; // The receiving material uses the same flat-shading flag.
  const solid = new MeshStandardMaterial();
  const tiles = [], exporter = new GLTFExporter(), loader = new GLTFLoader();
  for (let z = -4; z < 0; z++) for (let x = -4; x < 0; x++) {
    const packet = await gen.prepare(x,z,0);
    const root = new Group();
    root.name = 'chunk';
    root.position.set(packet.origin.x,0,packet.origin.z);
    root.userData = {topology:packet.topology, surfaceSpans:packet.surfaceSpans, lodDistance:310, hysteresis:0.1, fingerprint:packet.fingerprint};
    for (const key of ['render','road','distantRoad','collision']) {
      if (!packet[key]) continue;
      const mesh = new Mesh(unpackGeometry(packet[key]), key === 'collision' ? solid : painted);
      mesh.name = key;
      root.add(mesh);
    }
    const file = Buffer.from(await exporter.parseAsync(root,{binary:true,onlyVisible:false}));
    const copy = (await loader.parseAsync(Uint8Array.from(file).buffer,'')).scene.getObjectByName('chunk');
    assert.deepEqual(copy.position.toArray(),root.position.toArray());
    assert.deepEqual(copy.userData.topology,root.userData.topology);
    assert.deepEqual(copy.userData.surfaceSpans,root.userData.surfaceSpans);
    assert.equal(copy.userData.lodDistance,310);
    assert.equal(copy.userData.hysteresis,0.1);
    for (const original of root.children) {
      const baked = copy.getObjectByName(original.name);
      for (const [name,attribute] of Object.entries(original.geometry.attributes)) {
        const other = baked.geometry.getAttribute(name);
        assert.deepEqual(other.array,attribute.array);
      }
      assert.deepEqual(baked.geometry.index.array,original.geometry.index.array);
      if (original.name !== 'collision') {
        for (const flag of ['vertexColors','roughness','metalness','side']) assert.equal(baked.material[flag],original.material[flag]);
        assert.equal(baked.material.userData.flatShading,true);
      }
      original.geometry.dispose(); baked.geometry.dispose();
    }
    const name = x+'_'+z+'.glb';
    await writeFile(join(output,name),file);
    const distantTriangles = (packet.distantRoad?.index.length ?? packet.road.index.length) / 3;
    tiles.push({x,z,layout:packet.topology.layout, nearTriangles:packet.stats.renderTriangles,
      distantTriangles:packet.render.index.length/3+distantTriangles, collisionTriangles:packet.stats.collisionTriangles,
      name,...stats(file)});
  }
  gen.dispose(); painted.dispose(); solid.dispose();
  const report = {recipe,scope:'One contiguous 880 m × 880 m region. All buildings, ground, near and distant roads, static colliders, resident hints and placement transforms. Vertex colours, zero textures. Both packages exclude executable code and runtime BVHs.',
    encoding:'Three GLTFExporter binary glTF, one tile per file. Each input/output payload independently gzipped at level 9.',
    equivalence:'Reloaded every GLB and compared typed position, normal, colour and index arrays element for element, material flags, LOD configuration, semantic hints and origins.',
    generated:{files:source, ...total(source)}, baked:{files:tiles,...total(tiles)}};
  await writeFile(join(output,'comparison.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({generated:total(source),baked:total(tiles)}));
} finally { await server.close(); }
