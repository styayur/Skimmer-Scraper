import type { Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
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
/** A cinematic follows only the already swept, stationary-column entry corridor. */
export const stepSkyDive=(flight:FlightState,start:Vec3,end:Vec3,progress:number,dt:number):FlightState=>{
 if(!(dt>0)||!Number.isFinite(dt)||!Number.isFinite(progress))return flight;
 const t=Math.min(1,Math.max(0,progress));const blend=t*t*(3-2*t);
 const position={x:start.x+(end.x-start.x)*blend,y:start.y+(end.y-start.y)*blend,z:start.z+(end.z-start.z)*blend};
 return{...flight,position,velocity:{x:0,y:(position.y-flight.position.y)/dt,z:0},elapsed:flight.elapsed+dt,
  attitude:{yaw:0,pitch:-(1-blend),roll:0},boosting:false};
};
