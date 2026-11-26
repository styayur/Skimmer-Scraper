import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { packGeometry, unpackGeometry } from '../packedGeometry';
import { CHUNK_SIZE, type WorldSettings } from '../worldConfig';
import { hashNumbers } from '../deterministic';
import { mulberry32 } from '../rng';
import type { GeneratedChunk } from '../worldTypes';
import { forgeFloor, forgeLanes } from './forgeAirspace';
import profile from './forge-profile.json';

type Point = [number, number, number];
const palette = [0x465a62,0x668789,0x9aa68d,0xc69767,0x495265,0x847877].map(hex=>new Color(hex));
export class ForgeChunkGenerator {
  private readonly material = new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:.88,flatShading:true});
  private readonly plan;
  constructor(private readonly settings: WorldSettings) { this.plan = forgeLanes(settings.seed); }

  prepare(cx:number, cz:number, revision:number, distant = false) {
    const ox = cx*CHUNK_SIZE, oz = cz*CHUNK_SIZE;
    const seed = hashNumbers(this.settings.seed,cx,cz,revision,profile.schema);
    const random = mulberry32(seed);
    const positions:number[] = [], colors:number[] = [];
    const face = (a:Point,b:Point,c:Point,color:number) => {
      positions.push(...a,...b,...c);
      const tint=palette[color]!;
      for(let v=0;v<3;v++)colors.push(tint.r,tint.g,tint.b);
    };
    const quad = (a:Point,b:Point,c:Point,d:Point,color:number) => { face(a,b,c,color); face(a,c,d,color); };
    const floor=(x:number,z:number)=>forgeFloor(ox+x,oz+z,this.plan);
    const grid=distant ? 4 : 16, step=CHUNK_SIZE/grid;
    const terrain=(i:number,j:number):Point=>[i*step,floor(i*step,j*step),j*step];
    for(let j=0;j<grid;j++)for(let i=0;i<grid;i++){
      const a=terrain(i,j),b=terrain(i,j+1),c=terrain(i+1,j+1),d=terrain(i+1,j);
      const color=a[1]>220?2:a[1]>80?0:1;
      quad(a,b,c,d,color);
    }

    // Sweep two closed front profiles through the owner's cell. Vary aperture,
    // banking, axial offset and repeat count independently of the prototype.
    const opening=32+random()*18, rise=38+random()*39;
    const axis=90+random()*38, base=floor(axis,110);
    const vault=random()<.54 && Math.abs(floor(axis,85)-floor(axis,135))<27;
    if(vault){
      const depth=32+random()*100, bend=(random()-.5)*17;
      const sections=distant ? 2 : 6;
      const ring=(i:number,j:number,outer:boolean):Point=>{
        const a=Math.PI*i/(profile.radii.length-1), t=j/sections;
        const radius=profile.radii[i]![outer?1:0]!/7;
        const flare=1+.1*Math.cos(t*Math.PI*2);
        return [axis+bend*Math.sin(t*Math.PI)+Math.cos(a)*opening*radius*flare,
          base+12+Math.sin(a)*rise*radius+(outer?2:0),110+(t-.5)*depth];
      };
      for(let j=0;j<sections;j++)for(let i=0;i<profile.radii.length-1;i++){
        for(const outer of [false,true]){
          quad(ring(i,j,outer),ring(i+1,j,outer),ring(i+1,j+1,outer),ring(i,j+1,outer),outer?2:4);
        }
        if(j===0||j===sections-1){
          const end=j===0?0:sections;
          quad(ring(i,end,false),ring(i+1,end,false),ring(i+1,end,true),ring(i,end,true),i%7===0?3:0);
        }
      }
      for(const i of [0,profile.radii.length-1])for(let j=0;j<sections;j++){
        const inner=ring(i,j,false),outer=ring(i,j,true),nextInner=ring(i,j+1,false),nextOuter=ring(i,j+1,true);
        const foot=(p:Point):Point=>[p[0],Math.min(floor(p[0],p[2])-3,p[1]-2),p[2]];
        quad(inner,foot(inner),foot(nextInner),nextInner,4);
        quad(outer,nextOuter,foot(nextOuter),foot(outer),0);
        if(j===0)quad(inner,outer,foot(outer),foot(inner),0);
        if(j===sections-1)quad(nextOuter,nextInner,foot(nextInner),foot(nextOuter),0);
      }
    }

    const island=random()<.34;
    if(island){
      const n=9+Math.floor(random()*6), radius=40+random()*38;
      const alt=base+180+random()*210, angle=random()*6, skew=(random()-.5)*32;
      const levels=[[-80,.15],[-28,.75],[0,1],[16,.79],[28,.30]] as const;
      const ring=(level:number,i:number):Point=>{
        const [dy,scale]=levels[level]!, a=angle+2*Math.PI*i/n;
        return [110+Math.cos(a)*radius*scale+skew*dy/90,alt+dy+3*Math.sin(3*a)*scale,110+Math.sin(a)*radius*.76*scale];
      };
      for(let i=0;i<n;i++){
        for(let j=1;j<levels.length;j++)quad(ring(j-1,i),ring(j-1,i+1),ring(j,i+1),ring(j,i),j===4?2:j%2?4:5);
        face(ring(4,i+1),ring(4,i),[110+skew*28/90,alt+29,110],2);
        face(ring(0,i),ring(0,i+1),[110-skew*80/90,alt-86,110],4);
      }
    }
    const collision = new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
    collision.computeBoundingBox();
    const geometry=collision.clone().setAttribute('color',new Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    const triangles=positions.length/9;
    return {forge:true as const, key:cx+':'+cz, chunkX:cx, chunkZ:cz, revision, origin:{x:ox,y:0,z:oz},
      fingerprint:hashNumbers(seed,triangles), render:packGeometry(geometry), collision:packGeometry(collision),
      stats:{buildings:0,bridges:Number(vault),islands:Number(island),renderTriangles:triangles,collisionTriangles:triangles}};
  }
  assemble(packet: ForgePacket): GeneratedChunk {
    const mesh = new Mesh(unpackGeometry(packet.render), this.material);
    mesh.name = 'strata-vault';
    mesh.receiveShadow = true;
    const group = new Group();
    group.position.set(packet.origin.x,packet.origin.y,packet.origin.z);
    group.add(mesh);
    const collisionGeometry = unpackGeometry(packet.collision);
    collisionGeometry.computeBoundingBox();
    const {key,chunkX,chunkZ,revision,origin,fingerprint,stats}=packet;
    return {key,chunkX,chunkZ,revision,origin,fingerprint,stats,group,collisionGeometry,bounds:collisionGeometry.boundingBox!};
  }
  generate(cx:number, cz:number, revision:number): GeneratedChunk {
    return this.assemble(this.prepare(cx,cz,revision));
  }
  dispose(){this.material.dispose();}
}

export type ForgePacket = ReturnType<ForgeChunkGenerator['prepare']>;
