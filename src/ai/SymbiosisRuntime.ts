import { clamp, distance, forwardFromAttitude, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { CompanionTeam, CompanionWorld, AgentTask } from '../companions/AgentController';
import type { RunRulesState } from '../game/runRules';
import { queryFlightSurface } from '../world/worldTypes';
import { attemptRelay, createRelay, createTrust, relayEligibility, trustEvent, type TrustEvent } from '../game/cooperation';
import { ModelClient, type ModelReply } from './modelClient';
import { validatePlan } from './validator';
import type { AgentAction, Perception, ValidatedPlan } from './contracts';
import { RadioDialogue, radioText, type RadioPriority } from './radioDialogue';
import { addressedAgent, localRadioIntent, localRadioReply } from './radioCommands';

interface Context { player:FlightState; rules:RunRulesState; world:CompanionWorld; seed:number; active:boolean }
interface Trace { time:number; event:string; data:unknown }
interface RadioOutcome {
  requestId: string;
  speaker: number;
  due: number;
  starts: Array<{ id: number; position: Vec3; action: AgentAction }>;
  chinese: boolean;
}
const readRadioReply = (raw: unknown): { plan: unknown; agent: number; text: string } | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2) return null;
  const envelope = raw as { plan?: unknown; reply?: { agentId?: unknown; text?: unknown } };
  const reply = envelope.reply;
  if (!Object.hasOwn(envelope, 'plan') || !reply || typeof reply !== 'object' || Array.isArray(reply) || Object.keys(reply).length !== 2
      || typeof reply.agentId !== 'number' || !Number.isInteger(reply.agentId) || typeof reply.text !== 'string'
      || Array.from(reply.text).length > 140) return null;
  const text = radioText(reply.text, 140);
  return text ? { plan: envelope.plan, agent: reply.agentId, text } : null;
};
const tasks:Record<AgentAction,AgentTask>={FOLLOW:'FORMATION_FOLLOW',LEAD:'LEAD',REGROUP:'REGROUP',SCOUT:'SCOUT',PROTECT:'PROTECT',RELAY:'RELAY',HOLD:'HOLD'};
/** Plain bounded state; async planning never runs inside fixed-step physics. */
export class SymbiosisRuntime {
  public readonly radio = new RadioDialogue();
  public trust=createTrust(); public relay=createRelay(); public time=0; public epoch=0;
  public trace:Trace[]=[]; public memory:Perception['memory']=[];
  public lastPlan:ValidatedPlan|null=null; public planner='Local Autonomous Controller';
  public relayFlash:{from:Vec3;to:Vec3;until:number}|null=null;
  private serial=0; private used=new Set<string>(); private context:Context|null=null;
  private lead:{origin:Vec3;direction:Vec3;id:number;until:number}|null=null;
  private cooldowns=new Map<string,number>(); private separated=new Set<number>();
  private impacts=0; private lastOutcome=0; private planUntil=0;
  private relayTried='';
  private radioGeneration = 0;
  private radioPending = false;
  private radioPlanUntil = 0;
  private radioOutcome: RadioOutcome | null = null;
  private nextReport = 0;
  private nextRisk = 0;
  public constructor(public readonly team:CompanionTeam,public readonly client=new ModelClient()){}
  public reset():void {
    this.invalidate();this.time=0;this.trust=createTrust();this.relay=createRelay();this.trace=[];this.memory=[];
    this.cooldowns.clear();this.separated.clear();this.impacts=0;this.lastOutcome=0;
    this.radio.reset();this.nextReport=0;this.nextRisk=0;
  }
  public invalidate():void {
    this.epoch++;this.client.cancel();this.team.clearTargets();this.lastPlan=null;this.lead=null;
    this.context=null;this.planner='Local Autonomous Controller';this.relayFlash=null;
    this.separated.clear();this.impacts=this.team.agents.reduce((count,agent)=>count+agent.impacts,0);
    this.radioGeneration++;this.radioPending=false;this.radioPlanUntil=0;this.radioOutcome=null;this.radio.interrupt();
  }
  public suspend():void { if(this.context?.active)this.invalidate(); }
  private record(event:string,data:unknown):void {this.trace.push({time:this.time,event,data});if(this.trace.length>256)this.trace.shift();}
  private event(event:TrustEvent,identity:string=event,cooldown=10):void {
    if(this.time<(this.cooldowns.get(identity)??-Infinity))return;
    this.cooldowns.set(identity,this.time+cooldown);this.trust=trustEvent(this.trust,event,this.time);
    this.record('trust',this.trust.events.at(-1));
    if(event==='accepted-lead')this.flightReport(1,'领先航段已确认，继续沿安全间隔飞行。');
    if(event==='regroup-benefit')this.flightReport(1,'队形已收拢，伴机回到你身边。');
    if(event==='lost-coordination')this.flightReport(2,'编队距离拉大，正在重新集合。','risk');
    if(event==='impact')this.flightReport(2,'伴机防护罩接触障碍，正在避开。','risk');
    if(event==='relay-success')this.flightReport(2,'地表接力已生效。','risk');
  }
  public perception():Perception|null {
    const c=this.context;if(!c?.active||!this.team.agents.some(a=>a.deployed))return null;
    const f=forwardFromAttitude(c.player.attitude);const right={x:Math.cos(c.player.attitude.yaw),z:-Math.sin(c.player.attitude.yaw)};
    const targets:Perception['targets']=[];
    for(const side of [0,-1,1]){
      const position={x:c.player.position.x+f.x*90+right.x*side*38,y:c.player.position.y+f.y*90+8+Math.abs(side)*12,z:c.player.position.z+f.z*90+right.z*side*38};
      if((c.world.isCompanionCovered?.(position)??c.world.isCollisionCovered?.(position))===false)continue;
      const hit=c.world.queryNearest(position,40);if(hit&&hit.distance<=8)continue;
      targets.push({id:side===0?'route-ahead':side<0?'route-left':'route-right',kind:'route',position,clearance:hit?.distance??null});
    }
    for(const agent of this.team.agents){
      const hit=queryFlightSurface(c.world,agent.flight.position,32.01);
      if(agent.deployed&&!agent.uncovered&&hit&&hit.distance>6&&hit.distance<=32)
        targets.push({id:`surface-${agent.id}`,kind:'surface',agentId:agent.id,position:{...agent.flight.position},clearance:hit.distance});
    }
    return{requestId:`${this.epoch}-${++this.serial}`,epoch:this.epoch,time:this.time,seed:c.seed,
      player:{position:{...c.player.position},velocity:{...c.player.velocity},grace:c.rules.grace,graceLimit:c.rules.config.graceSeconds,surfaceDistance:queryFlightSurface(c.world,c.player.position,90)?.distance??null,mode:c.rules.config.mode},
      trust:this.trust.value,riskLimit:clamp(0.15+this.trust.value*0.65,0.15,0.8),charges:this.relay.charges,
      relayReady:this.team.agents.some(partner=>!relayEligibility(this.relay,{time:this.time,trust:this.trust.value,player:c.player.position,rules:c.rules,world:c.world,partner,requested:true})),
      agents:this.team.agents.map(a=>({id:a.id,position:{...a.flight.position},velocity:{...a.flight.velocity},task:a.task,surfaceDistance:a.surfaceDistance,deployed:a.deployed&&!a.uncovered})),
      targets,memory:this.memory.slice(-8)};
  }
  public async request():Promise<boolean>{
    if(this.radioPending||this.time<this.radioPlanUntil||!this.client.canRequest())return false;
    const perception=this.perception();if(!perception)return false;
    this.record('perception',perception);const reply=await this.client.request(perception);
    if(!reply){this.record('fallback',{reason:this.client.snapshot().error??'cancelled'});return false;}
    return this.accept(reply,perception,'Model Planner');
  }

  public canSendDialogue(): boolean {
    return this.context?.active === true && !this.radioPending && this.team.agents.some(agent=>agent.deployed&&!agent.uncovered);
  }

  /** Typed and transcribed commands share the existing plan validator and team controller. */
  public async sendDialogue(raw: string): Promise<boolean> {
    if(!this.canSendDialogue())return false;
    if(this.client.containsCredential(raw))return false;
    const message = radioText(raw.slice(0, 2000));
    if(!message)return false;
    const generation=++this.radioGeneration;
    this.radioPending=true;
    this.radio.player(message);
    try {
      if(this.client.snapshot().pending){
        this.client.cancel();
        await this.client.idle();
      }
      if(generation!==this.radioGeneration)return false;
      const perception=this.perception();if(!perception)return false;
      const intent=localRadioIntent(message,perception,this.team.settings.formation);
      const model=this.client.canRequest(true) ? await this.client.request(perception,message) : null;
      if(generation!==this.radioGeneration||!this.context?.active)return false;
      const response=model&&readRadioReply(model.decision);
      if(model&&response&&this.radioAgent(response.agent)===response.agent){
        const isQuestion=response.plan===null;
        if(isQuestion&&!intent || !isQuestion&&this.accept({...model,decision:response.plan},perception,'Model Radio')){
          this.radio.report(response.agent,response.text,'model','reply',this.time);
          this.record('radio-interpretation',{source:'model',intent:intent?.kind??null,requestId:perception.requestId,agent:response.agent,
            action:isQuestion?null:this.lastPlan?.orders,latencyMs:model.latencyMs,usage:model.usage});
          if(!isQuestion)this.trackRadioOutcome(perception,response.agent,message);
          return true;
        }
      }
      const agent=this.radioAgent(intent?.agent??addressedAgent(message)??1);
      if(agent===null)return false;
      const applied=!!intent?.plan&&this.accept({decision:intent.plan,usage:{input:0,output:0,total:0,cached:0},latencyMs:0,
        provider:'local',model:'local radio'},perception,'Local Radio');
      this.radio.report(agent,localRadioReply(message,perception,intent,applied,agent),'local','reply',this.time);
      this.record('radio-interpretation',{source:'local',intent:intent?.kind??null,requestId:perception.requestId,agent,
        action:applied?this.lastPlan?.orders:null,modelFallback:!!model||this.client.snapshot().connected});
      if(applied)this.trackRadioOutcome(perception,agent,message);
      return true;
    } finally {
      if(generation===this.radioGeneration)this.radioPending=false;
    }
  }

  public flightReport(agent: number, text: string, kind: RadioPriority = 'notice'): void {
    const speaker=this.radioAgent(agent);if(speaker===null)return;
    if(kind==='risk'){
      if(this.time<this.nextRisk)return;
      this.nextRisk=this.time+5;
    }else{
      if(this.time<this.nextReport)return;
      this.nextReport=this.time+20;
    }
    this.radio.report(speaker,text,'local',kind,this.time);
  }

  private radioAgent(preferred: number): number | null {
    const available=this.team.agents.filter(agent=>agent.deployed&&!agent.uncovered);
    return available.find(agent=>agent.id===preferred)?.id??available[0]?.id??null;
  }

  private trackRadioOutcome(perception:Perception,speaker:number,message:string):void {
    const plan=this.lastPlan;
    if(!plan||plan.requestId!==perception.requestId)return;
    const starts=plan.orders.flatMap(order=>order.agents.map(id=>({id,action:order.action,
      position:{...this.team.agents.find(agent=>agent.id===id)!.flight.position}})));
    this.radioPlanUntil=this.planUntil;
    this.radioOutcome={requestId:plan.requestId,speaker,due:this.time+1.4,starts,chinese:/[\u3400-\u9fff]/.test(message)};
  }

  private reportRadioOutcome(): void {
    const outcome=this.radioOutcome;
    if(!outcome||this.time<outcome.due)return;
    this.radioOutcome=null;
    if(this.lastPlan?.requestId!==outcome.requestId)return;
    const positions=outcome.starts.flatMap(start=>{
      const agent=this.team.agents.find(member=>member.id===start.id&&member.deployed&&!member.uncovered);
      return agent?[{id:agent.id,action:start.action,task:agent.task,position:{...agent.flight.position},
        meters:distance(start.position,agent.flight.position)}]:[];
    });
    this.record('radio-outcome',{requestId:outcome.requestId,positions});
    const moving=positions.find(agent=>agent.task===tasks[agent.action]&&agent.meters>5);
    const speaker=this.radioAgent(moving?.id??outcome.speaker);
    if(speaker===null)return;
    const meters=moving&&Math.round(moving.meters);
    const text=outcome.chinese ? meters ? `指令执行中。已飞行 ${meters} 米。` : '正在调整队形，安全避障优先。'
      : meters ? `Order in progress. ${meters} m flown.` : 'Adjusting the team flight path around hazards.';
    this.radio.report(speaker,text,'local','notice',this.time);
  }
  /** Replays are deliberately labelled and still pass current geometry, epoch and TTL checks. */
  public replay(decision:unknown,perception:Perception):boolean {
    return this.accept({decision,usage:{input:0,output:0,total:0,cached:0},latencyMs:0,provider:'recording',model:'recorded'},perception,'Recorded Model Plan');
  }
  private accept(reply:ModelReply,perception:Perception,label:string):boolean {
    const c=this.context;
    if(!c)return false;
    const result=validatePlan(reply.decision,{perception,epoch:this.epoch,time:this.time,active:c.active,player:c.player.position,agents:this.team.agents,world:c.world,usedIds:this.used});
    this.record('decision',{...reply,validation:result.ok?'accepted':result.reason});
    if(!result.ok){if(!['stale-epoch','inactive-state'].includes(result.reason))this.event('bad-plan');return false;}
    const plan=result.plan;this.used.add(plan.requestId);if(this.used.size>128)this.used.delete(this.used.values().next().value!);
    this.team.clearTargets();this.team.configure({...this.team.settings,formation:plan.formation});
    this.team.cooperation={trust:this.trust.value,risk:plan.risk};
    for(const order of plan.resolved)for(const id of order.agents)this.team.setTarget(id,order.target,tasks[order.action],plan.ttl-(this.time-perception.time),order.targetId==='route-left'?-1:order.targetId==='route-right'?1:0);
    this.lastPlan=plan;this.planUntil=perception.time+plan.ttl;this.planner=`${label} · ${reply.model}`;
    const lead=plan.resolved.find(order=>order.action==='LEAD');
    if(lead){
      const direction=forwardFromAttitude(c.player.attitude);
      this.trackLead(lead.agents[0]!,{x:c.player.position.x+direction.x*90,y:c.player.position.y+direction.y*90,z:c.player.position.z+direction.z*90},plan.ttl);
    }
    this.record('execution',{plan,agents:this.positions()});return true;
  }
  private trackLead(id:number,target:Vec3,ttl:number):void {
    const p=this.context!.player.position;const gap=distance(p,target)||1;
    this.lead={origin:{...p},direction:{x:(target.x-p.x)/gap,y:(target.y-p.y)/gap,z:(target.z-p.z)/gap},id,until:this.time+ttl};
  }
  private positions():unknown {return this.team.agents.map(a=>({id:a.id,task:a.task,position:{...a.flight.position},target:{...a.target},impacts:a.impacts}));}
  public step(player:FlightState,rules:RunRulesState,world:CompanionWorld,seed:number,dt:number):RunRulesState {
    this.time+=dt;this.context={player,rules,world,seed,active:rules.status==='running'};
    this.radio.step(this.time);this.reportRadioOutcome();
    this.team.cooperation.trust=this.trust.value;
    if(this.lastPlan&&this.time>=this.planUntil){this.record('expired',{requestId:this.lastPlan.requestId});this.lastPlan=null;this.team.clearTargets();this.team.cooperation.risk=0.3;this.planner='Local Autonomous Controller';}
    if(this.lastPlan&&this.time-this.lastOutcome>=1){
      this.lastOutcome=this.time;this.record('outcome',{agents:this.positions(),player:{...player.position},grace:rules.grace,trust:this.trust.value,relay:{...this.relay}});
      this.memory.push({event:'flight',action:this.lastPlan.orders.map(o=>o.action).join('/'),progress:Math.round(player.speed)});if(this.memory.length>24)this.memory.shift();
    }
    if(!this.lead&&this.team.settings.behavior==='lead'&&this.time>1){
      const agent=this.team.agents.find(a=>a.id===1&&a.deployed&&a.navigationTask==='LEAD');
      if(agent)this.trackLead(agent.id,agent.target,10);
    }
    if(this.lead){
      const l=this.lead;const d={x:player.position.x-l.origin.x,y:player.position.y-l.origin.y,z:player.position.z-l.origin.z};
      const progress=d.x*l.direction.x+d.y*l.direction.y+d.z*l.direction.z;
      const agent=this.team.agents.find(a=>a.id===l.id);
      if(progress>50&&agent&&distance(player.position,agent.flight.position)<100){this.event('accepted-lead','accepted-lead',12);this.lead=null;}
      else if(this.time>l.until)this.lead=null;
    }
    for(const agent of this.team.agents){
      const gap=distance(player.position,agent.flight.position);
      if(gap>180){if(!this.separated.has(agent.id))this.event('lost-coordination',`lost-${agent.id}`,20);this.separated.add(agent.id);}
      if(gap<50&&this.separated.delete(agent.id))this.event('regroup-benefit',`regroup-${agent.id}`,20);
    }
    const impacts=this.team.agents.reduce((n,a)=>n+a.impacts,0);if(impacts>this.impacts)this.event('impact');this.impacts=impacts;
    const requested=this.lastPlan?.resolved.filter(o=>o.action==='RELAY').flatMap(o=>o.agents)??[];
    const eligible=this.team.agents.find(partner=>!relayEligibility(this.relay,{time:this.time,trust:this.trust.value,player:player.position,rules,partner,world,requested:requested.includes(partner.id)}));
    if(eligible&&(rules.config.mode==='challenge'||requested.includes(eligible.id))){this.relayTried=this.lastPlan?.requestId??'';return this.relayAttempt(eligible.id,requested.includes(eligible.id));}
    if(requested.length&&this.lastPlan&&this.relayTried!==this.lastPlan.requestId&&
      (rules.config.mode==='free'||rules.grace<=Math.min(2,rules.config.graceSeconds*.4))){
      this.relayTried=this.lastPlan.requestId;return this.relayAttempt(requested[0]!);
    }
    return rules;
  }
  public relayAttempt(id:number,requested=true):RunRulesState {
    const c=this.context;if(!c)throw Error('Relay requires an active simulation context');const partner=this.team.agents.find(a=>a.id===id);
    if(!partner)return c.rules;
    const result=attemptRelay(this.relay,{time:this.time,trust:this.trust.value,player:c.player.position,rules:c.rules,partner,world:c.world,requested});
    this.relay=result.state;c.rules=result.rules;this.event(result.success?'relay-success':'relay-failure',`relay-${id}`,1);
    this.record('relay',{agent:id,success:result.success,reason:result.reason,bonus:result.bonus,charges:this.relay.charges,player:{...c.player.position},partner:{...partner.flight.position},surface: queryFlightSurface(c.world,partner.flight.position,33)?.distance??null});
    if(result.success)this.relayFlash={from:{...c.player.position},to:{...partner.flight.position},until:this.time+1};
    return result.rules;
  }
  public snapshot(){return{planner:this.planner,time:this.time,epoch:this.epoch,trust:{...this.trust,events:this.trust.events.slice()},relay:{...this.relay},model:this.client.snapshot(),config:this.client.publicConfig(),lastPlan:this.lastPlan,trace:this.trace.slice(),memory:this.memory.slice(),radio:{...this.radio.snapshot(),pending:this.radioPending}};}
}
