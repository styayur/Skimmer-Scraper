import { Group, Mesh, MeshStandardMaterial } from 'three';
import type { Vec3 } from '../../core/math';
import { CHUNK_SIZE, type WorldSettings } from '../worldConfig';
import { unpackGeometry } from '../packedGeometry';
import { ForgeChunkGenerator } from './forgeChunk';

/** Visual-only distant tiles. The streamer exclusively owns all physical surfaces. */
export class ForgeHorizon {
  readonly group = new Group();
  private readonly generator: ForgeChunkGenerator;
  private readonly material = new MeshStandardMaterial({vertexColors:true,flatShading:true,side:2,roughness:.88});
  private readonly tiles = new Map<string, Mesh>();
  private queue: {x:number;z:number;key:string}[] = [];
  private center = '';
  private lastBuild = -Infinity;
  constructor(settings: WorldSettings) { this.generator = new ForgeChunkGenerator(settings); }

  cover(position: Vec3, near: (key:string)=>boolean, revision: (x:number,z:number)=>number) {
    const cx=Math.floor(position.x/CHUNK_SIZE), cz=Math.floor(position.z/CHUNK_SIZE);
    const center=cx+':'+cz;
    if (center!==this.center) {
      this.center=center;
      const wanted = [];
      for(let dz=-5;dz<=5;dz++) for(let dx=-5;dx<=5;dx++){
        const radius=Math.hypot(dx,dz);
        if(radius>5.5)continue;
        const x=cx+dx,z=cz+dz;
        wanted.push({x,z,key:x+':'+z,radius});
      }
      const retained=new Set(wanted.map(tile=>tile.key));
      for(const [key,mesh] of this.tiles)if(!retained.has(key)){
        mesh.removeFromParent(); mesh.geometry.dispose(); this.tiles.delete(key);
      }
      this.queue=wanted.filter(tile=>!this.tiles.has(tile.key)).sort((a,b)=>a.radius-b.radius);
    }
    for(const [key,mesh] of this.tiles) mesh.visible=!near(key);
    const now=performance.now();
    if(now-this.lastBuild<40)return;
    const next=this.queue.shift();
    if(!next)return;
    this.lastBuild=now;
    const packet=this.generator.prepare(next.x,next.z,revision(next.x,next.z),true);
    const mesh=new Mesh(unpackGeometry(packet.render),this.material);
    mesh.name='distant-strata';
    mesh.position.set(packet.origin.x,0,packet.origin.z);
    mesh.visible=!near(next.key);
    this.tiles.set(next.key,mesh);
    this.group.add(mesh);
  }

  shiftOrigin(origin:Vec3){this.group.position.set(-origin.x,-origin.y,-origin.z);}
  dispose(){for(const mesh of this.tiles.values())mesh.geometry.dispose();this.tiles.clear();this.queue=[];this.group.clear();this.material.dispose();this.generator.dispose();}
}
