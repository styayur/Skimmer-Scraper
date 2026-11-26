// Export exactly the near geometry consumed by the streamed world, without textures.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import {createServer} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [seed='amber',output,radiusText='2']=process.argv.slice(2);
const radius=Number(radiusText);
if(!output || !Number.isInteger(radius)||radius<0||radius>8)throw Error('Usage: node scripts/export-worldforge.mjs SEED OUTPUT_DIRECTORY [RADIUS_0_TO_8]');
const dir=resolve(output);
await mkdir(dir,{recursive:true});
const server=await createServer({root,logLevel:'error',server:{middlewareMode:true},appType:'custom'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  const {ForgeChunkGenerator}=await server.ssrLoadModule('/src/world/procedural/forgeChunk.ts');
  const {worldSettingsFromSearch}=await server.ssrLoadModule('/src/world/worldConfig.ts');
  const settings=worldSettingsFromSearch(new URLSearchParams({theme:'worldforge',seed}));
  const generator=new ForgeChunkGenerator(settings);
  const doc={asset:{version:'2.0',generator:'Skimmer-Scraper WorldForge'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],
    materials:[{name:'Stratified ceramic',doubleSided:true,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.88}}],
    accessors:[],bufferViews:[],buffers:[]};
  const binary=[];
  let cursor=0, triangles=0;
  const fingerprints=[];
  const start=performance.now();
  for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++){
    const packet=generator.prepare(x,z,0);
    fingerprints.push(packet.fingerprint);
    triangles+=packet.stats.renderTriangles;
    const attributes={};
    for(const {name,array} of packet.render.attributes){
      const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
      const bufferView=doc.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:bytes.length,target:34962})-1;
      binary.push(bytes);cursor+=bytes.length;
      const accessor={bufferView,componentType:5126,count:array.length/3,type:'VEC3'};
      if(name==='position'){
        accessor.min=[Infinity,Infinity,Infinity]; accessor.max=[-Infinity,-Infinity,-Infinity];
        for(let i=0;i<array.length;i++){const axis=i%3;accessor.min[axis]=Math.min(accessor.min[axis],array[i]);accessor.max[axis]=Math.max(accessor.max[axis],array[i]);}
      }
      attributes[{position:'POSITION',normal:'NORMAL',color:'COLOR_0'}[name]]=doc.accessors.push(accessor)-1;
    }
    const mesh=doc.meshes.push({primitives:[{attributes,material:0}]})-1;
    doc.scenes[0].nodes.push(doc.nodes.push({name:packet.key,mesh,translation:[packet.origin.x,0,packet.origin.z]})-1);
  }
  generator.dispose();
  doc.buffers.push({byteLength:cursor});
  const json=Buffer.from(JSON.stringify(doc));
  const jsonSize=(json.length+3)&~3;
  const glb=Buffer.alloc(28+jsonSize+cursor);
  glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(jsonSize,12);glb.write('JSON',16);glb.fill(32,20,20+jsonSize);json.copy(glb,20);
  glb.writeUInt32LE(cursor,20+jsonSize);glb.write('BIN\0',24+jsonSize);
  Buffer.concat(binary,cursor).copy(glb,28+jsonSize);
  await writeFile(join(dir,'world.glb'),glb);
  const sources=['public/world-modules/celadon-court.glb','src/world/procedural/forge-profile.json','src/world/procedural/forgeChunk.ts','src/world/procedural/forgeAirspace.ts'];
  const inputs=[];
  for(const path of sources){
    const bytes=await readFile(join(root,path));
    await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),bytes);
    inputs.push({path,bytes:bytes.length,sha256:hash(bytes)});
  }
  const manifest={schema:1,seed:settings.seedText,seedUint32:settings.seed,radius,chunkCount:fingerprints.length,
    triangles,fingerprints,inputs,bakedBytes:glb.length,bakedDeflatedBytes:deflateSync(glb).length,bakedSha256:hash(glb),
    scope:'Same full-detail mesh attributes and chunk origins as the engine, no far-field geometry.'};
  await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({chunks:manifest.chunkCount,triangles,elapsedMs:performance.now()-start,bakedBytes:glb.length,sourceBytes:inputs.reduce((n,f)=>n+f.bytes,0)}));
} finally {await server.close();}

