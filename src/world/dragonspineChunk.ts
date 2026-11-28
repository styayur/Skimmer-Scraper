import * as T from 'three';
import { dragonspineFloor, valleyAxis, VALLEY_SPACING } from './dragonspineTerrain';
import { fingerprintValues } from './deterministic';
import { CHUNK_SIZE, type WorldSettings } from './worldConfig';
import type { GeneratedChunk } from './worldTypes';
import type { TopologyHint } from './worldTypes';
import { appendSweep, asVec, MeshBuffer, smooth, stationPoint, type KineticModule, type Placement } from './kinetic/sweep';

import { islandFaces, islandsAround, type Vertex, type Face } from './dragonspineIslands';
const moss=0x678573, basalt=0x465763, cut=0x826e63, gold=0xc1aa76;

function clipped(vertices: Vertex[], axis: 0 | 2, boundary: number, sign: number): Vertex[] {
  const result: Vertex[]=[];
  for (let i=0;i<vertices.length;i++) {
    const a=vertices[i]!, b=vertices[(i+1)%vertices.length]!;
    const da=sign*(a[axis]-boundary), db=sign*(b[axis]-boundary);
    if (da>=0) result.push(a);
    if ((da>0 && db<0) || (da<0 && db>0)) {
      const t=da/(da-db);
      const p: Vertex=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),a[2]+t*(b[2]-a[2])];
      p[axis]=boundary;
      result.push(p);
    }
  }
  return result;
}

/** A canonical closed barrel vault spans the gorge. Its rock extends from the
 * upper shelf down into the opposite walls. The middle bore remains open. */
function gorgeVault(seed: number,lane: number,row: number): Face[] {
  const z=row*880-230;
  const x=valleyAxis(z,seed,lane);
  const bottom=dragonspineFloor(x,z,seed)-8;
  const half=157, depth=row%3===0 ? 90 : 35;
  const faces: Face[]=[];
  const point=(angle: number,end: number,outer: boolean): Vertex=>{
    const radius=half+(outer ? 41+12*Math.sin(3*angle+row) : 0);
    const dx=Math.cos(angle)*radius;
    const zz=z+end*depth+19*Math.cos(angle*2+.4);
    return [x+dx,bottom+Math.sin(angle)*(outer ? 189 : 127)+end*8,zz];
  };
  const steps=18;
  for(let i=0;i<steps;i++){
    const a=i*Math.PI/steps,b=(i+1)*Math.PI/steps;
    const ia=point(a,-1,false),ib=point(b,-1,false),ja=point(a,1,false),jb=point(b,1,false);
    const oa=point(a,-1,true),ob=point(b,-1,true),pa=point(a,1,true),pb=point(b,1,true);
    faces.push({vertices:[ia,ib,jb,ja],color:basalt},{vertices:[oa,pa,pb,ob],color:moss},
      {vertices:[oa,ob,ib,ia],color:i%4===0?cut:basalt},{vertices:[pa,ja,jb,pb],color:cut});
    if(i===0) faces.push({vertices:[ia,ja,pa,oa],color:cut});
    if(i===steps-1) faces.push({vertices:[ib,ob,pb,jb],color:cut});
  }
  return faces;
}

function canyonSpan(seed: number, ox: number, oz: number, module: KineticModule) {
  const row = Math.round((oz + CHUNK_SIZE / 2 + 90) / (8 * CHUNK_SIZE));
  const z = row * 8 * CHUNK_SIZE - 90;
  if (z + module.width / 2 < oz || z - module.width / 2 > oz + CHUNK_SIZE) return;
  const lane = Math.round((ox + CHUNK_SIZE / 2) / VALLEY_SPACING);
  const x = valleyAxis(z, seed, lane) - CHUNK_SIZE / 2;
  if (x > ox + CHUNK_SIZE || x + CHUNK_SIZE < ox) return;
  const left = dragonspineFloor(x, z, seed) - 1, right = dragonspineFloor(x + CHUNK_SIZE, z, seed) - 1;
  const place: Placement = ([u, v, w], t) => [x + w, v + left + (right - left) * smooth(t), z - u];
  const clippedMesh = (visible: boolean) => {
    const buffer = new MeshBuffer(visible);
    appendSweep(buffer, module, place);
    const triangles: Vertex[][] = [];
    for (let i = 0; i < buffer.indices.length; i += 3) {
      let polygon = buffer.indices.slice(i, i + 3).map(index => {
        const p = index * 3;
        return [buffer.positions[p]!, buffer.positions[p+1]!, buffer.positions[p+2]!] as Vertex;
      });
      polygon = clipped(clipped(polygon, 0, ox, 1), 0, ox + CHUNK_SIZE, -1);
      polygon = clipped(clipped(polygon, 2, oz, 1), 2, oz + CHUNK_SIZE, -1);
      for (let j = 2; j < polygon.length; j++) triangles.push([polygon[0]!, polygon[j-1]!, polygon[j]!]);
    }
    return triangles;
  };
  const hints: TopologyHint[] = [];
  for (const t of [0.25, 0.5, 0.75]) {
    const station = module.stations.find(s => s.t >= t)!;
    for (const kind of ['surface', 'route'] as const) {
      const position = asVec(place(stationPoint(station, 0, kind === 'surface' ? 0 : 6), station.t));
      if (position.x < ox || position.x >= ox + CHUNK_SIZE || position.z < oz || position.z >= oz + CHUNK_SIZE) continue;
      hints.push({ id: ['canyon-span-1', seed, lane, row, kind, t].join('.'), kind, position });
    }
  }
  return { render: clippedMesh(true), collision: clippedMesh(false), hints, id:['canyon-span-1',seed,lane,row].join('.') };
}

export class DragonspineChunkGenerator {
  private readonly material=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,side:T.DoubleSide,roughness:.9});
  private readonly vaults=new Map<string,Face[]>();
  private readonly islandCollision=new Map<string,Face[]>();
  constructor(private readonly settings: WorldSettings) {}
  generate(cx: number,cz: number,revision: number, module?: KineticModule): GeneratedChunk {
    const seed=this.settings.seed, ox=cx*CHUNK_SIZE, oz=cz*CHUNK_SIZE;
    const positions: number[]=[], colors: number[]=[];
    const tint=new T.Color();
    const emit=(a: Vertex,b: Vertex,c: Vertex,color: number) => {
      tint.setHex(color);
      for(const [x,y,z] of [a,b,c]) { positions.push(x-ox,y,z-oz); colors.push(tint.r,tint.g,tint.b); }
    };
    const cells=16, cell=CHUNK_SIZE/cells;
    const grid: Vertex[]=[];
    for(let j=0;j<=cells;j++)for(let i=0;i<=cells;i++){
      const x=ox+i*cell,z=oz+j*cell;
      grid.push([x,dragonspineFloor(x,z,seed),z]);
    }
    for(let j=0;j<cells;j++)for(let i=0;i<cells;i++){
      const n=j*(cells+1)+i, a=grid[n]!,b=grid[n+1]!,c=grid[n+cells+1]!,d=grid[n+cells+2]!;
      const slope=Math.max(Math.abs(a[1]-b[1]),Math.abs(a[1]-c[1]))/cell;
      const band=Math.floor((a[1]+8*Math.sin(a[2]/110))/29);
      const color=a[1]>690 && slope<1.1 ? 0xc7c9b6 : slope<.65 ? moss : band%5===0 ? gold : band%3===0 ? cut : basalt;
      emit(a,c,b,color); emit(b,c,d,color);
    }
    const groundFloats=positions.length;
    const lane=Math.round((ox+CHUNK_SIZE*.5)/VALLEY_SPACING);
    const row=Math.round((oz+CHUNK_SIZE*.5+230)/880);
    const centerZ=row*880-230;
    let vault=false;
    if(Math.abs(oz+CHUNK_SIZE*.5-centerZ)<CHUNK_SIZE*.5+114 &&
      Math.abs(ox+CHUNK_SIZE*.5-valleyAxis(centerZ,seed,lane))<CHUNK_SIZE*.5+216){
      const id=lane+':'+row;
      let faces=this.vaults.get(id);
      if(!faces){
        faces=gorgeVault(seed,lane,row); this.vaults.set(id,faces);
        if(this.vaults.size>16)this.vaults.delete(this.vaults.keys().next().value!);
      }
      for(const face of faces){
        let polygon=clipped(face.vertices,0,ox,1);
        polygon=clipped(polygon,0,ox+CHUNK_SIZE,-1);
        polygon=clipped(polygon,2,oz,1);
        polygon=clipped(polygon,2,oz+CHUNK_SIZE,-1);
        for(let i=2;i<polygon.length;i++){ emit(polygon[0]!,polygon[i-1]!,polygon[i]!,face.color); vault=true; }
      }
    }
    const surface=(start:number,end:number,name:string)=>{
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions.slice(start,end),3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors.slice(start,end),3));
      geometry.computeVertexNormals();
      const mesh=new T.Mesh(geometry,this.material);
      mesh.name=name;mesh.receiveShadow=true;
      return mesh;
    };
    const group=new T.Group();
    group.position.set(ox,0,oz);
    group.add(surface(0,groundFloats,'dragonspine-bedrock'));
    if(positions.length>groundFloats)group.add(surface(groundFloats,positions.length,'dragonspine-vault'));
    const rockEnd = positions.length;
    const span = module && canyonSpan(seed, ox, oz, module);
    if (span) {
      for (const [a,b,c] of span.render) emit(a!, b!, c!, gold);
      if (positions.length > rockEnd) group.add(surface(rockEnd, positions.length, 'dragonspine-sky-arch'));
    }
    const renderTriangles=positions.length/9;
    positions.length = rockEnd;
    if (span) for (const face of span.collision) for (const [x,y,z] of face) positions.push(x-ox, y, z-oz);
    const spanEnd = positions.length / 3;
    const sites=islandsAround(seed,ox+CHUNK_SIZE*.5,oz+CHUNK_SIZE*.5,CHUNK_SIZE*.5);
    for(const site of sites){
      let faces=this.islandCollision.get(site.id);
      if(!faces){
        faces=islandFaces(site,'near');
        this.islandCollision.set(site.id,faces);
        if(this.islandCollision.size>24)this.islandCollision.delete(this.islandCollision.keys().next().value!);
      }
      for(const {vertices} of faces){
        if(vertices.every(p=>p[0]<ox) || vertices.every(p=>p[0]>=ox+CHUNK_SIZE)
          || vertices.every(p=>p[2]<oz) || vertices.every(p=>p[2]>=oz+CHUNK_SIZE))continue;
        for(let i=2;i<vertices.length;i++){
          let polygon=clipped([vertices[0]!,vertices[i-1]!,vertices[i]!],0,ox,1);
          polygon=clipped(polygon,0,ox+CHUNK_SIZE,-1);
          polygon=clipped(polygon,2,oz,1);polygon=clipped(polygon,2,oz+CHUNK_SIZE,-1);
          for(let j=2;j<polygon.length;j++)for(const [x,y,z] of [polygon[0]!,polygon[j-1]!,polygon[j]!])positions.push(x-ox,y,z-oz);
        }
      }
    }
    const collision=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
    collision.computeBoundingBox();

    return {key:cx+':'+cz,chunkX:cx,chunkZ:cz,revision,origin:{x:ox,y:0,z:oz},group,
      bounds:collision.boundingBox!.clone(),collisionGeometry:collision,
      fingerprint:fingerprintValues('ascendant-2',seed,cx,cz,positions.length),
      ...(span ? { topology: { layout: 'canyon-sky-arch', hints: span.hints },
        surfaceSpans: [{first:rockEnd / 3, end:spanEnd, id:span.id}] } : {}),
      stats:{buildings:0,islands:sites.filter(s=>Math.floor(s.x/CHUNK_SIZE)===cx && Math.floor(s.z/CHUNK_SIZE)===cz).length,
        bridges:Number(vault)+Number(!!span),renderTriangles,collisionTriangles:positions.length/9}};
  }
  dispose(){this.material.dispose();this.vaults.clear();this.islandCollision.clear();}
}
