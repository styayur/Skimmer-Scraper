import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Vec3 } from '../core/math';
import { disposeObject3D } from '../model/glb';
import { seededRandom } from './deterministic';
import { dragonspineFloor } from './dragonspineTerrain';
import { islandsAround } from './dragonspineIslands';
import type { DynamicColliderRegistry } from './dynamicColliderRegistry';

// One closed patrol per territory. The still portion and eased departures keep the
// landing continuous even at the cycle boundary. Points are absolute world metres.
export function crownbackPatrol(seed: number, tx: number, tz: number) {
  const random = seededRandom(seed, tx, tz, 'crownback-patrol-1');
  const x = tx * 3600 + (random() - 0.5) * 100;
  const z = tz * 3600 + (random() - 0.5) * 100;
  const stops = [
    [-880, 310, 150], [-580, 370, -280], [-170, 315, -460],
    [350, 420, -850], [820, 650, -430], [900, 720, 110],
    [520, 645, 540], [10, 490, 690], [-530, 390, 640],
  ];
  const islands=islandsAround(seed,tx*3600,tz*3600,1550);
  const nest=islands.find(site=>site.kind==='nest')!;
  const waypoints=stops.map(([dx, y, dz])=>new T.Vector3(x+dx!,y!,z+dz!));
  const perch=waypoints[0]!.set(nest.x+nest.rx*.48,nest.y+24,nest.z);
  // Both legs follow the valley for a full wingspan before banking toward rock.
  waypoints.splice(1,0,perch.clone().add(new T.Vector3(0,35,-245)));
  waypoints.push(perch.clone().add(new T.Vector3(0,35,245)));
  const course=new T.CatmullRomCurve3(waypoints,true,'centripetal');
  // Sample the swept wingspan, then anticipate the rising face of each ridge.
  // This work runs only when a new territory is acquired.
  const stations=192;
  const centers=Array.from({length:stations},(_,i)=>course.getPoint(i/stations));
  const floor=centers.map((center,i)=>{
    const tangent=course.getTangent(i/stations);
    const side=new T.Vector3(tangent.z,0,-tangent.x).normalize();
    let height=center.y;
    const range=Math.hypot(center.x-perch.x,center.z-perch.z);
    const approach=Math.min(1,range/250);
    if(range<500)height=Math.max(height,nest.y+24+170*T.MathUtils.smoothstep(range,0,300));
    for(const width of [-230,-175,-115,-60,0,60,115,175,230])for(const fore of [-148,-75,0,45,118]){
      const xx=center.x+side.x*width+side.z*fore,zz=center.z+side.z*width-side.x*fore;
      height=Math.max(height,dragonspineFloor(xx,zz,seed)+36+144*approach);
      for(const site of islands){
        if(site===nest)continue;
        if(Math.abs(xx-site.x)<site.rx*1.22+26 && Math.abs(zz-site.z)<site.rz*1.22+26)
          height=Math.max(height,site.y+(site.kind==='ridge'?145:117)+165);
      }
    }
    return height;
  });
  for(let i=0;i<centers.length;i++){
    let y=floor[i]!;
    for(let k=-7;k<=7;k++)y=Math.max(y,floor[(i+k+stations)%stations]!-12*Math.abs(k));
    centers[i]!.y=y;
  }
  // Interpolate XZ on the original course. Re-fitting a centripetal spline
  // after lifting its control points also moves its horizontal tangents and wings.
  const slopes=centers.map((p,i)=>{
    const left=p.y-centers[(i+stations-1)%stations]!.y;
    const right=centers[(i+1)%stations]!.y-p.y;
    return left*right>0 ? 2*left*right/(left+right) : 0;
  });
  return new class extends T.Curve<T.Vector3> {
    constructor(){super();}
    getPoint(t:number,out=new T.Vector3()){
      const wrapped=t-Math.floor(t),f=wrapped*stations,i=Math.floor(f),u=f-i;
      course.getPoint(wrapped,out);
      const a=centers[i]!.y,b=centers[(i+1)%stations]!.y;
      out.y=T.MathUtils.lerp(a,b,u*u*(3-2*u))
        +u*(1-u)*((1-u)*slopes[i]!-u*slopes[(i+1)%stations]!);
      return out;
    }
  }();
}

export function patrolPhase(seconds: number) {
  const cycle = ((seconds + 32) % 192 + 192) % 192;
  // Integrate a trapezoidal velocity profile over a 176-second circuit.
  const t = Math.max(0, cycle - 16);
  const ramp = 14;
  const length = 176 - ramp;
  if (t < ramp) return t * t / (2 * ramp * length);
  if (t > 176 - ramp) return 1 - (176 - t) ** 2 / (2 * ramp * length);
  return (t - ramp * 0.5) / length;
}

type Tier = 'far' | 'middle' | 'near';
export function crownbackPitch(verticalHeading:number,u:number) {
  // Flare on the final approach: the centre of mass descends while the neck and
  // tail level over the landing shelf.
  return T.MathUtils.clamp(-Math.asin(verticalHeading),-.35,.35)*crownbackWingWeight(u);
}
export function crownbackWingWeight(u:number) {
  return T.MathUtils.smoothstep(Math.min(u,1-u),.012,.07);
}
interface Model { scene: T.Group; mixer: T.AnimationMixer; actions:T.AnimationAction[]; }
interface Probe { id: string; bone: T.Object3D; shape: T.Matrix4; }
type Point = [number, number, number];
type Segment = [string, Point, Point, number, number];

// Endpoints follow the rest mesh in Three coordinates. Rotate the long axis
// along the segment before projecting into each bone's bind coordinate system.
const segments: Segment[] = [
  ['Chest',[0,1,-29],[0,1,31],16,12], ['Neck',[0,3,26],[0,14,79],8,7],
  ['Crown',[0,16,75],[0,16,118],10,7], ['Tail',[0,0,-25],[0,5,-85],8,6],
  ['Fan',[0,5,-80],[0,12,-147],4,4],
];
for (const [sign, side] of [[-1,'Port'],[1,'Starboard']] as const) {
  segments.push([side,[sign*12,6,15],[sign*54,16,0],8,5],
    [side,[sign*54,16,0],[sign*99,24,38],5,4],
    [side+'Hand',[sign*99,24,38],[sign*226,6,-18],4,3],
    [side+'Hand',[sign*105,21,29],[sign*153,1,-64],12,2.5]);
}

export class CrownbackFlight {
  readonly group = new T.Group();
  private readonly actor = new T.Group();
  private readonly abort = new AbortController();
  private readonly models = new Map<Tier, Model>();
  private readonly probes: Probe[] = [];
  private readonly origin = new T.Vector3();
  private readonly pilot = new T.Vector3();
  private readonly heading = new T.Vector3();
  private readonly transform = new T.Matrix4();
  private tx = 0;
  private tz = 0;
  private route: T.Curve<T.Vector3>;
  private seconds = 0;
  private interactive = false;
  private tier: Tier = 'far';
  private high = false;
  private visibleModel?: Model;
  private collisionModel?: Model;

  constructor(private readonly seed: number, private readonly colliders: DynamicColliderRegistry) {
    this.group.add(this.actor);
    this.route = crownbackPatrol(seed, 0, 0);
    this.step(0);
    void this.load();
  }

  private async load() {
    const loader = new GLTFLoader();
    for (const tier of ['far','middle','near'] as const) {
      try {
        const url = new URL('./realms/dragonspine/crownback-' + tier + '.glb', document.baseURI);
        const response = await fetch(url, {signal:this.abort.signal});
        if (!response.ok) throw Error(String(response.status));
        const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
        if (this.abort.signal.aborted) { disposeObject3D(gltf.scene); return; }
        gltf.scene.updateMatrixWorld(true);
        const mixer = new T.AnimationMixer(gltf.scene);
        const actions=gltf.animations.map(clip=>mixer.clipAction(clip).play());
        const model={scene:gltf.scene,mixer,actions};
        if(!this.collisionModel){
          try { this.bindProbes(gltf.scene); }
          catch(error) { disposeObject3D(gltf.scene); throw error; }
          this.collisionModel=model;
        }

        gltf.scene.visible = false;
        this.actor.add(gltf.scene);
        this.models.set(tier,model);
        this.step(0);
      } catch (error) {
        if (this.abort.signal.aborted) return;
        console.warn('Crownback ' + tier + ' unavailable', error);
      }
    }
  }

  private bindProbes(scene: T.Group) {
    const up = new T.Vector3(0,1,0);
    const probes:Probe[]=[];
    for (const [index, [name,start,end,width,depth]] of segments.entries()) {
      const bone = scene.getObjectByName(name);
      if (!bone) throw Error('Missing Crownback bone ' + name);
      const a = new T.Vector3(...start), b = new T.Vector3(...end);
      const direction = b.clone().sub(a);
      const along = direction.clone().normalize();
      const across = up.clone().cross(along).normalize();
      const orientation = new T.Matrix4().makeBasis(across, along, across.clone().cross(along));
      const pose = orientation.scale(new T.Vector3(width,direction.length()*.53,depth)).setPosition(a.lerp(b,.5));
      probes.push({id:'crownback:'+index, bone, shape:bone.matrixWorld.clone().invert().multiply(pose)});
    }
    this.probes.push(...probes);
  }

  cover(position: Vec3) {
    this.pilot.copy(position);
    const tx = Math.round(position.x/3600), tz = Math.round(position.z/3600);
    if ((tx !== this.tx || tz !== this.tz) && this.pilot.distanceTo(this.actor.position) > 2300) {
      this.tx=tx; this.tz=tz;
      this.route = crownbackPatrol(this.seed,tx,tz);
    }
  }

  step(dt: number) {
    this.seconds += dt;
    const u = patrolPhase(this.seconds);
    this.route.getPointAt(u,this.actor.position);
    this.route.getTangentAt(u,this.heading);
    this.actor.rotation.set(crownbackPitch(this.heading.y,u),Math.atan2(this.heading.x,this.heading.z),
      -.17*Math.sin(2*Math.PI*u), 'YXZ');
    const distance = this.pilot.distanceTo(this.actor.position);
    const near = (this.high ? 620 : 420) + (this.tier === 'near' ? 55 : 0);
    const middle = (this.high ? 1300 : 1000) + (this.tier === 'middle' ? 100 : 0);
    this.tier = distance < near ? 'near' : distance < middle ? 'middle' : 'far';
    const coarse = this.collisionModel;
    const model = this.models.get(this.tier) ?? this.models.get('middle') ?? coarse;
    if (!model) return;
    if (this.visibleModel !== model) {
      if (this.visibleModel) this.visibleModel.scene.visible = false;
      model.scene.visible = true;
      this.visibleModel = model;
    }
    const beat = u === 0 ? 0 : this.seconds % 8;
    const weight=crownbackWingWeight(u);
    for(const action of model.actions)action.setEffectiveWeight(weight);
    model.mixer.setTime(beat);
    if (distance > (this.interactive ? 365 : 330) || !coarse) { this.clearProbes(); return; }
    if (model !== coarse) {
      for(const action of coarse.actions)action.setEffectiveWeight(weight);
      coarse.mixer.setTime(beat);
    }
    coarse.scene.updateWorldMatrix(true,true);
    for (const probe of this.probes) {
      this.transform.copy(probe.bone.matrixWorld).multiply(probe.shape);
      const e = this.transform.elements;
      e[12] += this.origin.x; e[13] += this.origin.y; e[14] += this.origin.z;
      if (this.interactive) this.colliders.setTransform(probe.id,this.transform,dt);
      else this.colliders.add(probe.id,'dragon',new T.IcosahedronGeometry(1,1),this.transform,false);
    }
    this.interactive=true;
  }

  private clearProbes() {
    if (!this.interactive) return;
    for (const probe of this.probes) this.colliders.remove(probe.id);
    this.interactive=false;
  }
  get residentPosition() { return this.actor.position; }
  setQuality(name: 'balanced' | 'high') { this.high=name==='high'; }
  shiftOrigin(origin: Vec3) { this.origin.copy(origin); this.group.position.copy(origin).negate(); }
  reset() { this.clearProbes(); this.seconds=0; this.step(0); }
  snapshot() {
    return this.visibleModel ? [{id:'crownback',type:patrolPhase(this.seconds)===0?'栖息':'巡航',
      position:{x:this.actor.position.x,y:this.actor.position.y,z:this.actor.position.z},yaw:this.actor.rotation.y}] : [];
  }
  dispose() {
    this.abort.abort();
    this.clearProbes();
    for (const {scene,mixer} of this.models.values()) {
      mixer.stopAllAction(); mixer.uncacheRoot(scene);
      const skeletons=new Set<T.Skeleton>();
      scene.traverse(node=>{ if(node instanceof T.SkinnedMesh)skeletons.add(node.skeleton); });
      for(const skeleton of skeletons)skeleton.dispose();
      disposeObject3D(scene);
    }
    this.models.clear(); this.probes.length=0; this.visibleModel=undefined; this.collisionModel=undefined;
    this.group.clear();
  }
}
