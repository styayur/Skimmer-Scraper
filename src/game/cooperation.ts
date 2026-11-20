import { clamp, distance, type Vec3 } from '../core/math';
import type { AgentState, CompanionWorld } from '../companions/AgentController';
import type { RunRulesState } from './runRules';

export type TrustEvent = 'accepted-lead' | 'regroup-benefit' | 'relay-success' | 'relay-failure' | 'bad-plan' | 'lost-coordination' | 'impact';
export interface TrustState { value: number; events: Array<{time:number;event:TrustEvent;delta:number;value:number}> }
export const createTrust = ():TrustState=>({value:0.5,events:[]});
const deltas:Record<TrustEvent,number>={'accepted-lead':0.08,'regroup-benefit':0.04,'relay-success':0.12,'relay-failure':-0.04,'bad-plan':-0.05,'lost-coordination':-0.05,impact:-0.025};
export const trustEvent = (state:TrustState,event:TrustEvent,time:number):TrustState=>{
  const value=clamp(state.value+deltas[event],0,1);
  return{value,events:[...state.events,{time,event,delta:value-state.value,value}].slice(-64)};
};
export interface RelayState { charges:number; cooldownUntil:number; attempts:number; successes:number; failures:number }
export const createRelay=():RelayState=>({charges:2,cooldownUntil:0,attempts:0,successes:0,failures:0});
export interface RelayContext { time:number; trust:number; player:Vec3; rules:RunRulesState; partner:AgentState; world:CompanionWorld; requested:boolean }
export interface RelayResult { state:RelayState; rules:RunRulesState; success:boolean; reason:string; bonus:number }
export const relayEligibility=(state:RelayState,context:RelayContext):string|null=>{
  if(context.rules.status!=='running'||!context.rules.config.assisted)return'inactive';
  if(!context.partner.deployed||context.partner.uncovered)return'partner-unavailable';
  if(context.trust<(context.requested?0.55:0.7))return'trust';
  if(state.charges<=0)return'no-charges';if(context.time<state.cooldownUntil)return'cooldown';
  if(distance(context.player,context.partner.flight.position)>70)return'distance';
  const hit=context.world.queryNearest(context.partner.flight.position,32.01);
  if(!hit||hit.distance>32||hit.distance<=3.2)return'partner-surface';
  const surface=context.world.queryNearest(context.player,32.01);
  if(context.rules.config.mode==='challenge'&&(surface&&surface.distance<=32))return'player-safe';
  if(context.rules.config.mode==='challenge'&&context.rules.grace>Math.min(2,context.rules.config.graceSeconds*0.4))return'not-needed';
  for(let index=1;index<10;index++){
    const t=index/10;const target=context.partner.flight.position;
    const point={x:context.player.x+(target.x-context.player.x)*t,y:context.player.y+(target.y-context.player.y)*t,z:context.player.z+(target.z-context.player.z)*t};
    const obstruction=context.world.queryNearest(point,3.3);if(obstruction&&obstruction.distance<=3.2)return'obstructed';
  }
  return null;
};
/** A finite geometric rescue, never a permanent proximity exemption. */
export const attemptRelay=(state:RelayState,context:RelayContext):RelayResult=>{
  const reason=relayEligibility(state,context);
  if(reason)return{state:{...state,attempts:state.attempts+1,failures:state.failures+1},rules:context.rules,success:false,reason,bonus:0};
  const bonus=context.rules.config.mode==='challenge'?Math.min(1.25,context.rules.config.graceSeconds-context.rules.grace):0;
  return{state:{...state,charges:state.charges-1,cooldownUntil:context.time+20,attempts:state.attempts+1,successes:state.successes+1},
    rules:{...context.rules,grace:context.rules.grace+bonus},success:true,reason:bonus?'survival-rescue':'free-flight-training',bonus};
};
