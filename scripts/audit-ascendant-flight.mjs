import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshBVH} from 'three-mesh-bvh';
import {createServer} from 'vite';

const server=await createServer({server:{middlewareMode:true},logLevel:'error'});
try{
  const {crownbackPatrol,patrolPhase,crownbackWingWeight,crownbackPitch}=await server.ssrLoadModule('/src/world/crownbackFlight.ts');
  const bytes=await readFile('public/realms/dragonspine/crownback-near.glb');
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const mixer=new T.AnimationMixer(gltf.scene),actor=new T.Group(),probe=new T.Vector3();
  actor.add(gltf.scene);
  const actions=gltf.animations.map(clip=>mixer.clipAction(clip).play());
  const parts=[];
  gltf.scene.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const positions=mesh.geometry.attributes.position,indices=new Set();
    const extrema=[Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity],ids=[0,0,0,0,0,0];
    for(let i=0;i<positions.count;i++){
      probe.fromBufferAttribute(positions,i);
      for(let axis=0;axis<3;axis++){
        const a=probe.getComponent(axis);
        if(a<extrema[2*axis]){extrema[2*axis]=a;ids[2*axis]=i;}
        if(a>extrema[2*axis+1]){extrema[2*axis+1]=a;ids[2*axis+1]=i;}
      }
    }
    for(const i of ids)indices.add(i);
    for(let i=0;i<24;i++)indices.add(Math.floor(positions.count*(i+.5)/24));
    parts.push({mesh,indices});
  });
  assert(parts.length>0);
  const {dragonspineFloor}=await server.ssrLoadModule('/src/world/dragonspineTerrain.ts');
  const {islandsAround,islandFaces}=await server.ssrLoadModule('/src/world/dragonspineIslands.ts');
  const ray=new T.Ray(), direction=new T.Vector3(.013,1,.027).normalize();
  const seeds=[334458,0,17,12345,0xffffffff,...Array.from({length:30},(_,i)=>(i*70711921)>>>0)];
  const rows=[];
  for(const seed of seeds){
    const tx=seed%3-1,tz=1-seed%3,route=crownbackPatrol(seed,tx,tz);
    const sites=islandsAround(seed,tx*3600,tz*3600,1550),nest=sites.find(site=>site.kind==='nest');
    const rocks=sites.map(site=>{
      const coords=[];
      for(const {vertices} of islandFaces(site,'near'))for(let k=2;k<vertices.length;k++)
        coords.push(...vertices[0],...vertices[k-1],...vertices[k]);
      const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(coords,3));
      g.computeBoundingBox();
      return {site,box:g.boundingBox,tree:new MeshBVH(g),geometry:g};
    });
    let inside=0,firstInside;
    const obstructions={};
    let minimum=Infinity,worst;
    for(let k=0;k<384;k++){
      const t=k/384,p=route.getPoint(t),v=route.getTangent(t),l=Math.hypot(v.x,v.z);
      for(const width of [-220,-110,0,110,220]){
        const x=p.x+width*v.z/l,z=p.z-width*v.x/l;
        const clearance=p.y-dragonspineFloor(x,z,seed);
        if(clearance<minimum){minimum=clearance;worst={t,width,x,y:p.y,z};}
      }
    }
    let animatedMinimum=Infinity,animatedWorst;
    for(let tick=0;tick<384;tick++){
      const seconds=tick*.5,u=patrolPhase(seconds),heading=route.getTangentAt(u);
      route.getPointAt(u,actor.position);
      actor.rotation.set(crownbackPitch(heading.y,u),Math.atan2(heading.x,heading.z),-.17*Math.sin(2*Math.PI*u),'YXZ');
      for(const action of actions)action.setEffectiveWeight(crownbackWingWeight(u));
      mixer.setTime(u===0?0:seconds%8);actor.updateMatrixWorld(true);
      for(const {mesh,indices} of parts)for(const i of indices){
        mesh.getVertexPosition(i,probe).applyMatrix4(mesh.matrixWorld);
        const clearance=probe.y-dragonspineFloor(probe.x,probe.z,seed);
        if(clearance<animatedMinimum){animatedMinimum=clearance;animatedWorst={seconds,vertex:i,position:probe.toArray()};}
        for(const rock of rocks){
          if(!rock.box.containsPoint(probe))continue;
          const hits=rock.tree.raycast(ray.set(probe,direction),T.DoubleSide).map(h=>h.distance).sort((a,b)=>a-b);
          const crossings=hits.filter((d,k)=>k===0 || d-hits[k-1]>.001);
          if(crossings.length%2){inside++;obstructions[rock.site.kind]=(obstructions[rock.site.kind]??0)+1;firstInside??={seconds,site:rock.site.id,position:probe.toArray()};}
        }
      }
    }
    for(const rock of rocks)rock.geometry.dispose();
    rows.push({seed,tx,tz,minimum,worst,animatedMinimum,animatedWorst,inside,obstructions,firstInside,perchOffset:route.getPoint(0).y-nest.y});
  }
  const report={method:'384 level-span samples and 384 animated half-second poses per territory. Each material contributes six rest extrema and 24 distributed skin vertices.',rows,
    animatedMinimum:Math.min(...rows.map(r=>r.animatedMinimum)),
    minimum:Math.min(...rows.map(r=>r.minimum)),perchError:Math.max(...rows.map(r=>Math.abs(r.perchOffset-24)))};
  if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
  console.log('Minimum terrain clearance',report.minimum,'maximum perch height error',report.perchError);
  console.log('Minimum animated mesh clearance',report.animatedMinimum);
  console.log('Island interior samples',rows.reduce((sum,row)=>sum+row.inside,0));
  assert(report.minimum>=0 && report.animatedMinimum>=0 && report.perchError<.01 && rows.every(row=>row.inside===0));
}finally{await server.close();}
