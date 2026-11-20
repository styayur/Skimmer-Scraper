import type { Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { SpawnState } from '../world/renderWorld';
import type { SurfaceProvider } from '../world/worldTypes';
export const chooseSkyEntry=(spawn:Vec3,world:SurfaceProvider):Vec3|null=>{
 for(const height of [60,40,24,12]){
  let safe=true;
  for(let y=0;y<=height;y++){
   const hit=world.queryNearest({...spawn,y:spawn.y+y},7);
   if(hit&&hit.distance<6.5){safe=false;break;}
  }
  if(safe)return{...spawn,y:spawn.y+height};
 }
 return null;
};
/** Check a reaction corridor as well as the vertical dive: a safe point alone can face a bridge. */
export const chooseSkyArrival=(spawn:SpawnState,world:SurfaceProvider & {isCompanionCovered?(position:Vec3):boolean}):SpawnState|null=>{
 for(const height of [0,-8,4])for(const [dx,dz] of [[0,0],[0,40],[0,-40],[40,0],[-40,0]]){
  const position={x:spawn.position.x+dx,y:spawn.position.y+height,z:spawn.position.z+dz};
  const nearest=world.queryNearest(position,33);if(!nearest||nearest.distance<10||nearest.distance>32||!chooseSkyEntry(position,world))continue;
  for(const yaw of [spawn.yaw,spawn.yaw+Math.PI,spawn.yaw+Math.PI/2,spawn.yaw-Math.PI/2]){
   let safe=true;
   for(let along=0;along<=180;along+=3){
    const p={x:position.x-Math.sin(yaw)*along,y:position.y-.015*along,z:position.z-Math.cos(yaw)*along};
    if(world.isCompanionCovered?.(p)===false){safe=false;break;}
    const hit=world.queryNearest(p,7);if(hit&&hit.distance<6.5){safe=false;break;}
   }
   if(safe)return{...spawn,position,yaw,pitch:-.015};
  }
 }
 return null;
};
/** A cinematic follows only the already swept, stationary-column entry corridor. */
export const stepSkyDive=(flight:FlightState,start:Vec3,end:Vec3,progress:number,dt:number,yaw=0):FlightState=>{
 if(!(dt>0)||!Number.isFinite(dt)||!Number.isFinite(progress))return flight;
 const t=Math.min(1,Math.max(0,progress));const blend=t*t*(3-2*t);
 const position={x:start.x+(end.x-start.x)*blend,y:start.y+(end.y-start.y)*blend,z:start.z+(end.z-start.z)*blend};
 return{...flight,position,velocity:{x:0,y:(position.y-flight.position.y)/dt,z:0},elapsed:flight.elapsed+dt,
  attitude:{yaw,pitch:-(1-blend),roll:0},boosting:false};
};
