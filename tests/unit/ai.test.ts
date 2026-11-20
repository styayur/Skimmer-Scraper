import { describe,it,expect,vi } from 'vitest';
import { CompanionTeam, type CompanionWorld } from '../../src/companions/AgentController';
import { createFlightState } from '../../src/flight/flightModel';
import { createRunRules,updateRunRules } from '../../src/game/runRules';
import { createRelay,createTrust,trustEvent,attemptRelay } from '../../src/game/cooperation';
import { SymbiosisRuntime } from '../../src/ai/SymbiosisRuntime';
import { ModelClient,validateModelConfig } from '../../src/ai/modelClient';
import { DEFAULT_MODEL_CONFIG } from '../../src/ai/contracts';
import { validatePlan } from '../../src/ai/validator';
const ground:CompanionWorld={isCollisionCovered:()=>true,queryNearest:(p,r)=>p.y<=r?{distance:Math.abs(p.y),point:{x:p.x,y:0,z:p.z},chunkId:'g',surfaceId:'g'}:null};
const fixture=()=>{
 const player=createFlightState({position:{x:0,y:45,z:0},yaw:0});const team=new CompanionTeam();team.configure({count:3,formation:'wedge',behavior:'formation'});team.reset(player,ground);
 const runtime=new SymbiosisRuntime(team);const rules=createRunRules({assisted:true,mode:'challenge'});runtime.step(player,rules,ground,334458,1/120);
 const perception=runtime.perception()!;const plan={requestId:perception.requestId,epoch:perception.epoch,ttl:10,risk:0.3,formation:'line',orders:[{agents:[1],action:'SCOUT',targetId:'route-ahead'}],reason:'侦察前方'};
 const context={perception,epoch:runtime.epoch,time:runtime.time,active:true,player:player.position,agents:team.agents,world:ground,usedIds:new Set<string>()};return{player,team,runtime,rules,perception,plan,context};
};
describe('declarative AI boundary',()=>{
 it('executes an approved plan, moves an independent aircraft, records outcomes and expires to local',()=>{
  const f=fixture();expect(f.runtime.replay(f.plan,f.perception)).toBe(true);const before={...f.team.agents[0].flight.position};
  for(let i=0;i<120;i++){f.team.step(f.player,ground,1/120);f.runtime.step(f.player,f.rules,ground,334458,1/120);}
  expect(f.team.agents[0].flight.position).not.toEqual(before);expect(f.team.agents[0].navigationTask).toBe('SCOUT');expect(f.runtime.trace.some(t=>t.event==='outcome')).toBe(true);
  f.runtime.step(f.player,f.rules,ground,334458,11);expect(f.runtime.planner).toBe('Local Autonomous Controller');
 });
 it.each([
  ['extra code',{code:'alert(1)'}],['unknown target',{orders:[{agents:[1],action:'SCOUT',targetId:'invented'}]}],
  ['excess risk',{risk:1}],['NaN',{risk:NaN}],['expired',{ttl:0}],['stale epoch',{epoch:99}],
  ['duplicate agents',{orders:[{agents:[1,1],action:'FOLLOW',targetId:null}]}],['unknown agent',{orders:[{agents:[8],action:'FOLLOW',targetId:null}]}],
  ['executable action',{orders:[{agents:[1],action:'eval',targetId:'route-ahead'}]}],['injected object',{reason:{script:'run()'}}],
 ])('rejects %s',(_name,patch)=>{const f=fixture();expect(validatePlan({...f.plan,...patch},f.context).ok).toBe(false);});
 it('rejects duplicates, inactive sessions, stale replies and occluded/uncovered destinations',()=>{
  const f=fixture();expect(validatePlan(f.plan,{...f.context,usedIds:new Set([f.plan.requestId])}).ok).toBe(false);
  expect(validatePlan(f.plan,{...f.context,active:false}).ok).toBe(false);expect(validatePlan(f.plan,{...f.context,time:11}).ok).toBe(false);
  expect(validatePlan(f.plan,{...f.context,world:{...ground,isCollisionCovered:()=>false}}).ok).toBe(false);
  const solid={queryNearest:()=>({distance:0,point:{x:0,y:0,z:0},chunkId:'x',surfaceId:'x'})};expect(validatePlan(f.plan,{...f.context,world:solid}).ok).toBe(false);
  f.runtime.invalidate();expect(f.runtime.replay(f.plan,f.perception)).toBe(false);
 });
 it.each(['FOLLOW','LEAD','REGROUP','SCOUT','PROTECT','HOLD'])('supports %s with published targets',action=>{const f=fixture();expect(validatePlan({...f.plan,orders:[{agents:[1,2,3],action,targetId:'route-ahead'}]},f.context).ok).toBe(true);});
});
describe('observable Trust and finite Surface Relay',()=>{
 it('never gains Trust from idle time; earned Trust changes spacing and risk',()=>{
  const f=fixture();f.runtime.step(f.player,f.rules,ground,1,60);expect(f.runtime.trust.value).toBe(.5);
  let trust=createTrust();for(let i=0;i<20;i++)trust=trustEvent(trust,'accepted-lead',i);expect(trust.value).toBe(1);
  const low=fixture();low.team.cooperation.trust=0;low.team.step(low.player,ground,.2);const wide=low.team.agents[0].target;
  low.team.cooperation.trust=1;low.team.step(low.player,ground,.2);expect(Math.abs(low.team.agents[0].target.x)).toBeLessThan(Math.abs(wide.x));
 });
 it('earns accepted-lead from actual player progress, not a model-set Trust',()=>{
  const f=fixture();f.runtime.replay({...f.plan,orders:[{agents:[1],action:'LEAD',targetId:'route-ahead'}]},f.perception);
  const moved={...f.player,position:{...f.player.position,z:-55}};f.runtime.step(moved,f.rules,ground,1,1);expect(f.runtime.trust.value).toBe(.58);
 });
 it('rescues real geometry, extends survival by 1.25s, then refuses cooldown, resource exhaustion, obstruction and range',()=>{
  const f=fixture();const partner=f.team.agents[0];partner.flight.position={x:0,y:20,z:-10};
  const rules={...f.rules,grace:.6};const context={time:1,trust:.8,player:f.player.position,rules,partner,world:ground,requested:true};
  const success=attemptRelay(createRelay(),context);expect(success.success).toBe(true);expect(success.rules.grace).toBe(1.85);
  expect(updateRunRules(rules,{distance:45},1).status).toBe('failed');expect(updateRunRules(success.rules,{distance:45},1).status).toBe('running');
  expect(attemptRelay(success.state,context).reason).toBe('cooldown');const second=attemptRelay(success.state,{...context,time:22});expect(second.success).toBe(true);
  expect(attemptRelay(second.state,{...context,time:50}).reason).toBe('no-charges');
  expect(attemptRelay(createRelay(),{...context,trust:.5}).reason).toBe('trust');
  expect(attemptRelay(createRelay(),{...context,player:{x:200,y:45,z:0}}).reason).toBe('distance');
  expect(attemptRelay(createRelay(),{...context,world:{queryNearest:(p,r)=>p.y>25?{distance:0,point:p,chunkId:'wall',surfaceId:'wall'}:ground.queryNearest(p,r)}}).success).toBe(false);
 });
 it('free-flight training consumes resources but never edits survival rules or solo scoring',()=>{
  const f=fixture();f.team.agents[0].flight.position.y=20;const rules=createRunRules({mode:'free',assisted:true});
  const result=attemptRelay(createRelay(),{time:1,trust:.8,player:f.player.position,rules,partner:f.team.agents[0],world:ground,requested:true});
  expect(result.success).toBe(true);expect(result.bonus).toBe(0);expect(result.rules.grace).toBe(rules.grace);expect(result.state.charges).toBe(1);
 });
});
describe('BYOK transport and budgets',()=>{
 const key='sk-test-memory-only-12345';const reply=(decision:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(decision)}}],usage:{prompt_tokens:50,completion_tokens:20,total_tokens:70}}));
 it('never persists keys, serializes only state, bounds concurrency and counts usage',async()=>{
  const f=fixture();let resolve!:(r:Response)=>void;const transport=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));
  const client=new ModelClient(transport);client.connect(DEFAULT_MODEL_CONFIG,key);const pending=client.request(f.perception);expect(client.canRequest()).toBe(false);expect(await client.request(f.perception)).toBeNull();
  const call=transport.mock.calls[0] as unknown as [string,RequestInit];expect(call[1].body).not.toContain(key);expect(call[1].redirect).toBe('error');
  resolve(reply(f.plan));expect((await pending)?.usage.total).toBe(70);expect(JSON.stringify(client)).not.toContain(key);expect(JSON.stringify(client.snapshot())).not.toContain(key);
  client.disconnect();expect(client.snapshot().connected).toBe(false);
 });
 it('enforces page-lifetime request and token budgets across reconnects',async()=>{
  const f=fixture();const transport=vi.fn(async()=>reply(f.plan));const client=new ModelClient(transport,()=>100000);
  client.connect({...DEFAULT_MODEL_CONFIG,maxRequests:1},key);await client.request(f.perception);client.disconnect();client.connect({...DEFAULT_MODEL_CONFIG,maxRequests:1},key);
  expect(await client.request(f.perception)).toBeNull();expect(transport).toHaveBeenCalledTimes(1);
  const limited=new ModelClient(transport);limited.connect({...DEFAULT_MODEL_CONFIG,tokenBudget:1000},key);expect(await limited.request(f.perception)).toBeNull();
 });
 it.each([401,403,429,500])('safely falls back on HTTP %s',async status=>{const f=fixture();const client=new ModelClient(async()=>new Response('private provider error',{status}));client.connect(DEFAULT_MODEL_CONFIG,key);expect(await client.request(f.perception)).toBeNull();expect(client.snapshot().error).toBe(`http-${status}`);if(status<429)expect(client.snapshot().connected).toBe(false);});
 it.each(['bad JSON','empty', 'key echo','oversize'])('rejects %s without leaking it',async kind=>{
  const f=fixture();const response=kind==='bad JSON'?new Response('broken'):kind==='empty'?reply(null):kind==='key echo'?reply({key}):new Response('x'.repeat(65537));
  const client=new ModelClient(async()=>response);client.connect(DEFAULT_MODEL_CONFIG,key);const result=await client.request(f.perception);
  if(kind!=='empty')expect(result).toBeNull();expect(JSON.stringify(client.snapshot())).not.toContain(key);
 });
 it('aborts on timeout and disconnect; ignores obsolete responses',async()=>{
  vi.useFakeTimers();try{
   const f=fixture();const transport:typeof fetch=async(_u,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('Abort'))));
   const client=new ModelClient(transport);client.connect({...DEFAULT_MODEL_CONFIG,timeoutMs:1000},key);const p=client.request(f.perception);await vi.advanceTimersByTimeAsync(1001);expect(await p).toBeNull();expect(client.snapshot().error).toBe('timeout');
   const other=new ModelClient(transport);other.connect(DEFAULT_MODEL_CONFIG,key);const q=other.request(f.perception);other.disconnect();expect(await q).toBeNull();expect(other.snapshot().cancellations).toBe(1);
  }finally{vi.useRealTimers();}
 });
 it('requires HTTPS and explicit endpoint trust and disallows credentials or key-bearing URLs',()=>{
  for(const endpoint of ['http://example.com/chat','https://a:b@example.com/chat','https://api.deepseek.com/chat/completions?key=x'])expect(()=>validateModelConfig({...DEFAULT_MODEL_CONFIG,endpoint})).toThrow();
  expect(()=>validateModelConfig({...DEFAULT_MODEL_CONFIG,provider:'custom',endpoint:'https://example.com/chat'})).toThrow();
  expect(validateModelConfig({...DEFAULT_MODEL_CONFIG,provider:'custom',trusted:true,endpoint:'http://127.0.0.1:8000/chat'}).trusted).toBe(true);
 });
});
