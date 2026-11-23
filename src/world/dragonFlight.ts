import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject3D } from '../model/glb';
import type { Vec3 } from '../core/math';
import type { DynamicColliderRegistry } from './dynamicColliderRegistry';
import { seededRandom } from './deterministic';
import { dragonHeight } from './dragonTerrain';

const span = 880;
export function roostFor(seed: number, rx: number, rz: number): T.Vector3 {
  const rng = seededRandom(seed, 4*rx, 4*rz, 'dragonspine-1');
  const x = rx*span + 95+rng()*30, z = rz*span+85+rng()*40;
  return new T.Vector3(x,dragonHeight(x,z,seed)+50,z);
}

interface WingProxy { id: string; part: T.Object3D; shape: T.Matrix4 }

export class RealmDragonFlight {
  readonly group=new T.Group();
  private readonly abort=new AbortController();
  private readonly actor=new T.Group();
  private readonly probes: WingProxy[]=[];
  private readonly player=new T.Vector3();
  private readonly home=new T.Vector3();
  private readonly matrix=new T.Matrix4();
  private mixer?:T.AnimationMixer;
  private asset?:T.Object3D;
  private time=0;
  private lastAnimation=-1;
  private near=false;
  private activity='巡航';
  constructor(private readonly seed:number, private readonly colliders:DynamicColliderRegistry) {
    this.group.add(this.actor);
    this.home.copy(roostFor(seed,0,0));
    void this.load().catch(error=>{ if(!this.abort.signal.aborted) console.error('Dragon asset failed',error); });
  }
  private async load():Promise<void> {
    const response=await fetch(new URL('./realms/dragonspine/bronze-crest.glb', document.baseURI),{signal:this.abort.signal});
    if(!response.ok) throw Error('Dragon asset '+response.status);
    const model=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
    if(this.abort.signal.aborted){disposeObject3D(model.scene);return;}
    this.asset=model.scene;
    this.actor.add(model.scene);
    this.mixer=new T.AnimationMixer(model.scene);
    for(const clip of model.animations) this.mixer.clipAction(clip).play();
    const attach=(id:string,part:T.Object3D|undefined,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
      if(!part)return;
      const shape=new T.Matrix4().makeScale(sx,sy,sz).setPosition(x,y,z);
      this.probes.push({id:'dragon:'+id,part,shape});
    };
    attach('body',model.scene,0,0,0,2.2,1.9,5.6);
    attach('neck',model.scene,0,1.5,8.5,1,1,4.3);
    attach('left',model.scene.getObjectByName('LeftWing'),-5,1,0,5.5,.65,2.2);
    attach('right',model.scene.getObjectByName('RightWing'),5,1,0,5.5,.65,2.2);
    attach('tail',model.scene.getObjectByName('TailBase'),0,.45,-5,.7,.55,6);
    this.step(0);
  }
  cover(player:Vec3):void {
    this.player.set(player.x,player.y,player.z);
    // Move the simulated territory only while the previous resident is out of interaction range.
    if(this.player.distanceToSquared(this.home)>600*600){
      const home=roostFor(this.seed,Math.round((player.x-110)/span),Math.round((player.z-105)/span));
      if(!home.equals(this.home)){this.removeProxies();this.home.copy(home);}
    }
  }
  step(dt:number):void {
    this.time+=dt;
    if(!this.asset)return;
    const cycle=(this.time+18)%68;
    const air=Math.min(1,Math.max(0,cycle-4)/6,Math.max(0,68-cycle)/8);
    const lift=air*air*(3-2*air);
    const a=(cycle-4)*Math.PI*2/56;
    const x=this.home.x+lift*135*Math.sin(a), z=this.home.z+lift*96*(Math.cos(a)-1);
    const valley=dragonHeight(x,z,this.seed);
    const y=Math.max(valley+6,this.home.y+lift*(20+21*Math.sin(2*a)),valley+lift*34);
    this.actor.position.set(x,y,z);
    this.actor.rotation.set(-.18*Math.cos(2*a)*lift,a+Math.PI/2,-.32*lift,'YXZ');
    this.activity=cycle<4?'栖息':cycle<10?'离巢':cycle>60?'降落':Math.cos(2*a)<-.5?'俯冲':'盘旋';
    const distance=this.actor.position.distanceTo(this.player);
    if(distance<200 || this.time-this.lastAnimation>.18){
      // A glide holds an extended wing pose, then the animation resumes on the next wingbeat.
      const beat=air<.12?.2:Math.cos(2*a)<-.5?.7:((this.time%8)<5?this.time:Math.floor(this.time/8)*8+5);
      this.mixer!.setTime(beat);
      this.lastAnimation=this.time;
    }
    if(distance>(this.near?135:115)){this.removeProxies();return;}
    this.actor.updateMatrixWorld(true);
    for(const p of this.probes){
      this.matrix.copy(p.part.matrixWorld);
      this.matrix.elements[12]!-=this.group.position.x;
      this.matrix.elements[13]!-=this.group.position.y;
      this.matrix.elements[14]!-=this.group.position.z;
      this.matrix.multiply(p.shape);
      if(!this.near)this.colliders.add(p.id,'dragon',new T.IcosahedronGeometry(1,1),this.matrix,false);
      else this.colliders.setTransform(p.id,this.matrix,dt);
    }
    this.near=true;
  }
  private removeProxies():void{
    if(this.near)for(const p of this.probes)this.colliders.remove(p.id);
    this.near=false;
  }
  reset():void{this.removeProxies();this.time=0;this.lastAnimation=-1;this.step(0);}
  shiftOrigin(origin:Vec3):void{this.group.position.set(-origin.x,-origin.y,-origin.z);this.group.updateMatrixWorld(true);}
  snapshot(){return this.asset?[{id:'bronze-crest',type:this.activity,position:{x:this.actor.position.x,y:this.actor.position.y,z:this.actor.position.z},yaw:this.actor.rotation.y}]:[];}
  dispose():void{this.abort.abort();this.removeProxies();this.mixer?.stopAllAction();if(this.asset){this.mixer?.uncacheRoot(this.asset);disposeObject3D(this.asset);}this.group.clear();}
}
