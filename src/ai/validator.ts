import { distance, type Vec3 } from '../core/math';
import type { AgentState, CompanionWorld } from '../companions/AgentController';
import { ACTIONS, type Perception, type ResolvedOrder, type TeamPlan, type ValidatedPlan } from './contracts';
import { queryFlightSurface } from '../world/worldTypes';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).length === keys.length && Object.keys(value).every(key=>keys.includes(key));
const finiteVec = (value: Vec3): boolean => [value.x,value.y,value.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e8);
export interface ValidationContext { perception: Perception; epoch: number; time: number; active: boolean; player: Vec3; agents: readonly AgentState[]; world: CompanionWorld; usedIds: ReadonlySet<string> }
export type ValidationResult = { ok: true; plan: ValidatedPlan } | { ok: false; reason: string };
/** Only bounded declarative orders survive this boundary; no executable text is evaluated. */
export const validatePlan = (raw: unknown, context: ValidationContext): ValidationResult => {
  const fail = (reason: string): ValidationResult => ({ok:false,reason});
  if (!context.active) return fail('inactive-state');
  if (!object(raw) || !exact(raw,['requestId','epoch','ttl','risk','formation','orders','reason'])) return fail('schema');
  if (raw.requestId !== context.perception.requestId || raw.epoch !== context.epoch || raw.epoch !== context.perception.epoch) return fail('stale-epoch');
  if (typeof raw.requestId !== 'string' || context.usedIds.has(raw.requestId)) return fail('duplicate');
  if (typeof raw.ttl !== 'number' || !Number.isFinite(raw.ttl) || raw.ttl < 1 || raw.ttl > 12 || context.time-context.perception.time >= raw.ttl || context.time<context.perception.time) return fail('expired');
  if (typeof raw.risk !== 'number' || !Number.isFinite(raw.risk) || raw.risk < 0 || raw.risk > context.perception.riskLimit) return fail('risk-limit');
  if (!['wedge','line','spread'].includes(String(raw.formation))) return fail('formation');
  if (typeof raw.reason !== 'string' || raw.reason.length>160 || /[\x00-\x1f]/.test(raw.reason)) return fail('reason');
  if (!Array.isArray(raw.orders) || raw.orders.length<1 || raw.orders.length>3) return fail('orders');
  const affected=new Set<number>();const resolved:ResolvedOrder[]=[];
  for(const value of raw.orders){
    if(!object(value)||!exact(value,['agents','action','targetId'])||!ACTIONS.includes(value.action as typeof ACTIONS[number]))return fail('action');
    if(!Array.isArray(value.agents)||value.agents.length<1||value.agents.length>3)return fail('agents');
    for(const id of value.agents){
      if(!Number.isInteger(id)||affected.has(id)||!context.agents.some(agent=>agent.id===id&&agent.deployed&&!agent.uncovered))return fail('agents');affected.add(id);
    }
    const target=context.perception.targets.find(candidate=>candidate.id===value.targetId);
    if(value.targetId!==null&&typeof value.targetId!=='string')return fail('target');
    if(value.targetId!==null&&!target)return fail('target');
    // A semantic target needs continuous lease and geometry checks in the mission executive.
    if(target?.semanticKind)return fail('mission-target');
    if(!target&&!['FOLLOW','REGROUP','PROTECT'].includes(String(value.action)))return fail('target');
    let position=target?{...target.position}:{...context.player};
    if(value.action==='RELAY'){
      if(!target||target.kind!=='surface'||!value.agents.includes(target.agentId))return fail('relay-target');
      const partner=context.agents.find(agent=>agent.id===target.agentId)!;position={...partner.flight.position};
    }
    if(!finiteVec(position)||distance(position,context.player)>350)return fail('target-range');
    if((context.world.isCompanionCovered?.(position)??context.world.isCollisionCovered?.(position))===false)return fail('uncovered-target');
    const hit=context.world.queryNearest(position,40);
    if(hit&&hit.distance<=6)return fail('solid-target');
    if(value.action==='RELAY'){
      const surface=queryFlightSurface(context.world,position,32.01);
      if(!surface||surface.distance>32)return fail('relay-surface');
    }
    // Local collision avoidance remains authoritative after this conservative reachability check.
    for(const id of value.agents){
      const origin=context.agents.find(agent=>agent.id===id)!.flight.position;
      for(const t of [0.25,0.5,0.75]){
        const point={x:origin.x+(position.x-origin.x)*t,y:origin.y+(position.y-origin.y)*t,z:origin.z+(position.z-origin.z)*t};
        const solid=context.world.queryNearest(point,4);if(solid&&solid.distance<3.5)return fail('unreachable');
      }
    }
    resolved.push({agents:[...value.agents] as number[],action:value.action as ResolvedOrder['action'],targetId:value.targetId as string|null,target:position});
  }
  return {ok:true,plan:{...(raw as unknown as TeamPlan),orders:resolved.map(({agents,action,targetId})=>({agents,action,targetId})),resolved}};
};
