import * as T from 'three';
import type { Vec3 } from '../core/math';
import { islandFaces, islandsAround, type Island } from './dragonspineIslands';

type Tier='near'|'middle'|'far';
interface Resident { tier:Tier; mesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>; }
export class IslandHorizon {
  readonly group=new T.Group();
  private readonly material=new T.MeshStandardMaterial({vertexColors:true,roughness:.88,side:T.DoubleSide});
  private readonly residents=new Map<string,Resident>();
  private targets:Island[]=[];
  private cell='';
  private high=false;
  constructor(private readonly seed:number) {}
  setQuality(quality:'high'|'balanced'){ this.high=quality==='high'; }
  cover(position:Vec3) {
    const cell=Math.floor(position.x/110)+':'+Math.floor(position.z/110);
    if(cell!==this.cell){
      this.cell=cell;
      this.targets=islandsAround(this.seed,position.x,position.z,2280).sort((a,b)=>
        Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z));
      const active=new Set(this.targets.map(site=>site.id));
      for(const [id,resident] of this.residents){
        if(active.has(id))continue;
        resident.mesh.removeFromParent();resident.mesh.geometry.dispose();this.residents.delete(id);
      }
    }
    // Upload one landmark per coverage update, nearest first.
    for(const site of this.targets){
      const resident=this.residents.get(site.id);
      const distance=Math.hypot(position.x-site.x,position.z-site.z,position.y-site.y)-Math.max(site.rx,site.rz);
      const near=(this.high?340:195)+(resident?.tier==='near'?65:0);
      const middle=980+(resident?.tier==='middle'?130:0);
      const tier=distance<near?'near':distance<middle?'middle':'far';
      if(resident?.tier===tier)continue;
      const positions:number[]=[],colors:number[]=[];
      const color=new T.Color();
      for(const face of islandFaces(site,tier)){
        color.setHex(face.color);
        for(let i=2;i<face.vertices.length;i++){
          for(const [x,y,z] of [face.vertices[0]!,face.vertices[i-1]!,face.vertices[i]!]){
            positions.push(x-site.x,y-site.y,z-site.z); colors.push(color.r,color.g,color.b);
          }
        }
      }
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      g.computeVertexNormals();g.computeBoundingSphere();
      const mesh=resident?.mesh ?? new T.Mesh(g,this.material);
      if(resident) {mesh.geometry.dispose();mesh.geometry=g;}
      else { mesh.name=site.id;mesh.position.set(site.x,site.y,site.z);this.group.add(mesh); }
      mesh.receiveShadow=tier!=='far';
      mesh.castShadow=this.high && tier==='near' && site.id===this.targets[0]?.id;
      this.residents.set(site.id,{tier,mesh});
      break;
    }
  }
  shiftOrigin(p:Vec3){this.group.position.set(-p.x,-p.y,-p.z);}
  dispose(){for(const item of this.residents.values())item.mesh.geometry.dispose();this.residents.clear();this.material.dispose();this.group.clear();}
}
