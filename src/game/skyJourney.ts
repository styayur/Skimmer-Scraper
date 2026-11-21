import { clamp } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { RunRulesState } from './runRules';
export const SKY_HEIGHT=520;
export const SKY_DIVE_SECONDS=1.2;
export type SkyPhase='ASCENT'|'THRESHOLD'|'INVERSION'|'WORLD_SWAP'|'DIVE'|'RECOVERY';
const durations={THRESHOLD:.4,INVERSION:1.2,DIVE:SKY_DIVE_SECONDS,RECOVERY:.8};
/** Fixed-time sequence. Resource exchange is an explicitly acknowledged async boundary. */
export class SkyJourney {
 public phase:SkyPhase='ASCENT';public phaseTime=0;public time=0;public worldIndex=0;public crossings=0;
 public history:Array<{phase:SkyPhase;world:number;time:number}>=[];private armed=true;private skipRequested=false;
 public get active():boolean{return this.phase!=='ASCENT';}
 public get progress():number{return this.phase==='WORLD_SWAP'?0:this.phase==='ASCENT'?0:clamp(this.phaseTime/durations[this.phase],0,1);}
 private enter(phase:SkyPhase):void {this.phase=phase;this.phaseTime=0;this.history.push({phase,world:this.worldIndex,time:this.time});if(this.history.length>128)this.history.shift();}
 public reset():void {this.phase='ASCENT';this.phaseTime=0;this.time=0;this.worldIndex=0;this.crossings=0;this.history=[];this.armed=true;this.skipRequested=false;}
 public observe(previousY:number,next:FlightState,rules:RunRulesState,dt:number):boolean {
  if(!(dt>0)||!Number.isFinite(dt))return false;
  this.time+=dt;if(this.active)return false;if(next.position.y<SKY_HEIGHT-70)this.armed=true;
  if(this.armed&&rules.status==='running'&&previousY<SKY_HEIGHT&&next.position.y>=SKY_HEIGHT&&next.velocity.y>8){this.armed=false;this.enter('THRESHOLD');return true;}
  return false;
 }
 public step(dt:number):'swap'|'completed'|null {
  if(!this.active||this.phase==='WORLD_SWAP'||!(dt>0)||!Number.isFinite(dt))return null;
  this.time+=dt;this.phaseTime+=dt;
  if(this.skipRequested){
   this.skipRequested=false;
   if(this.phase==='THRESHOLD'||this.phase==='INVERSION'){this.enter('WORLD_SWAP');return'swap';}
   if(this.phase==='DIVE')this.enter('RECOVERY');else if(this.phase==='RECOVERY')this.phaseTime=durations.RECOVERY;
  }
  if(this.phase==='THRESHOLD'&&this.phaseTime+1e-9>=durations.THRESHOLD)this.enter('INVERSION');
  else if(this.phase==='INVERSION'&&this.phaseTime+1e-9>=durations.INVERSION){this.enter('WORLD_SWAP');return'swap';}
  else if(this.phase==='DIVE'&&this.phaseTime+1e-9>=durations.DIVE)this.enter('RECOVERY');
  else if(this.phase==='RECOVERY'&&this.phaseTime+1e-9>=durations.RECOVERY){this.crossings++;this.enter('ASCENT');return'completed';}
  return null;
 }
 public worldReady():void {if(this.phase!=='WORLD_SWAP')throw Error('Unexpected world acknowledgement');this.worldIndex++;this.enter('DIVE');}
 public skip():void {if(this.active&&this.phase!=='WORLD_SWAP')this.skipRequested=true;}
 public snapshot(){return{phase:this.phase,phaseTime:this.phaseTime,time:this.time,progress:this.progress,worldIndex:this.worldIndex,crossings:this.crossings,active:this.active,height:SKY_HEIGHT,history:this.history.slice()};}
}
