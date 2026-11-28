import { clamp, distance, forwardFromAttitude, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { CompanionTeam, CompanionWorld, AgentTask } from '../companions/AgentController';
import type { RunRulesState } from '../game/runRules';
import { queryFlightSurface } from '../world/worldTypes';
import { attemptRelay, createRelay, createTrust, relayEligibility, trustEvent, type TrustEvent } from '../game/cooperation';
import { ModelClient, type ModelReply } from './modelClient';
import { validatePlan } from './validator';
import type { AgentAction, Perception, ValidatedPlan } from './contracts';
import { RadioDialogue, radioLanguageOf, radioText, type RadioLanguage, type RadioPriority } from './radioDialogue';
import { selectedLocale } from '../i18n/locale';
import { addressedAgent, localRadioIntent, localRadioReply, type LocalRadioIntent } from './radioCommands';
import { CompanionMemory } from './companionMemory';
import { shareableObservation, type HistoricalWorld, type JourneyMemory, type JourneyEvent, type JourneyDetail } from './journeyMemory';
import { describeObservation, journeyText } from '../i18n/journeyMemory';
import { freeDialogueTopic, groundedDialogue } from './groundedDialogue';
import { readUtterance, type SpeechAct } from './radioSpeech';
import { directive, explicitLegacy, missionCommand, missionName, missionPrefix, missionReason, missionReport } from './missionCommands';
import { missionEnvelopeShape, matchesMissionIntent, MissionExecutive, validateMissions, type MissionContext, type MissionPlan, type MissionRecord } from './missions';
import { clearApproach, SemanticTargets } from './semanticTargets';

interface Context { player:FlightState; rules:RunRulesState; world:CompanionWorld; seed:number; active:boolean }
interface Trace { time:number; event:string; data:unknown }
interface RadioOutcome {
  requestId: string;
  speaker: number;
  due: number;
  starts: Array<{ id: number; position: Vec3; action: AgentAction }>;
  chinese: boolean;
}
const readRadioReply = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2) return null;
  const envelope = raw as Record<string, unknown>;
  if (!Object.hasOwn(envelope, 'plan')) return null;
  const reply = readUtterance(envelope.reply);
  return reply ? { plan: envelope.plan, ...reply } : null;
};
const tasks:Record<AgentAction,AgentTask>={FOLLOW:'FORMATION_FOLLOW',LEAD:'LEAD',REGROUP:'REGROUP',SCOUT:'SCOUT',PROTECT:'PROTECT',RELAY:'RELAY',HOLD:'HOLD'};
/** Plain bounded state; async planning never runs inside fixed-step physics. */
export class SymbiosisRuntime {
  public readonly radio = new RadioDialogue();
  public radioLanguage: RadioLanguage | undefined;
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
  private readonly pictures=new Map<string,{perception:Perception;registry:SemanticTargets}>();
  private readonly dialogue=new CompanionMemory();
  private readonly missions:MissionExecutive;
  private nextMissionTick=0;
  private nextSurvey = 8;
  private surveyed = new Set<string>();
  private historicalWorld: HistoricalWorld | null = null;
  private pendingVisit = false;
  public constructor(public readonly team:CompanionTeam,public readonly client=new ModelClient(),private readonly journal?: JourneyMemory){
    this.missions=new MissionExecutive(team,result=>this.missionOutcome(result));
  }
  public enterWorld(world: HistoricalWorld): void {
    this.historicalWorld = world;
    this.pendingVisit = true;
    this.recordVisit();
  }
  private recordVisit(): void {
    if (this.pendingVisit && this.team.agents.some(a => a.deployed)) {
      this.pendingVisit = false;
      void this.remember('visit', 'visit', 0);
    }
  }
  private remember(event: JourneyEvent, detail: JourneyDetail, agent: number) {
    if (this.historicalWorld && this.team.agents.some(a => a.deployed))
      return this.journal?.remember(this.historicalWorld, event, detail, agent);
  }
  public reset():void {
    this.invalidate();this.time=0;this.trust=createTrust();this.relay=createRelay();this.trace=[];this.memory=[];
    this.cooldowns.clear();this.separated.clear();this.impacts=0;this.lastOutcome=0;
    this.missions.reset();this.dialogue.clear();this.used.clear();this.nextSurvey=8;
    this.radio.reset();this.nextReport=0;this.nextRisk=0;
  }
  public invalidate():void {
    this.surveyed.clear();
    this.nextSurvey = this.time + 8;
    this.historicalWorld = null;
    this.pendingVisit = false;
    this.missions.invalidate();this.pictures.clear();this.nextMissionTick=0;
    this.epoch++;this.client.cancel();this.team.clearTargets();this.lastPlan=null;this.lead=null;
    this.context=null;this.planner='Local Autonomous Controller';this.relayFlash=null;
    this.separated.clear();this.impacts=this.team.agents.reduce((count,agent)=>count+agent.impacts,0);
    this.radioGeneration++;this.radioPending=false;this.radioPlanUntil=0;this.radioOutcome=null;this.radio.interrupt();
  }
  public suspend():void {
    if (!this.context?.active) return;
    this.context.active=false;this.pictures.clear();
    this.client.cancel();this.radioGeneration++;this.radioPending=false;this.radio.interrupt();
  }
  public disconnectModel(): void {
    this.client.disconnect();
    this.radioGeneration++;
    this.radioPending = false;
    if (this.lastPlan && this.planner.startsWith('Model Planner')) {
      const agents = this.lastPlan.orders.flatMap(order => order.agents);
      for (const id of agents) this.team.clearTarget(id);
      this.removeOrders(agents);
      this.team.cooperation.risk = 0.3;
    }
  }
  private missionContext():MissionContext {
    const c=this.context!;
    return {team:this.team,world:c.world,time:this.time,epoch:this.epoch,player:c.player.position,active:c.active,
      relayReason:id=>{
        const partner=this.team.agents.find(a=>a.id===id);
        return partner?relayEligibility(this.relay,{time:this.time,trust:this.trust.value,player:c.player.position,
          rules:c.rules,world:c.world,partner,requested:true}):'agent-unavailable';
      }};
  }
  private episode(event:string,action:string,progress:number):void {
    this.memory.push({event,action,progress});if(this.memory.length>24)this.memory.shift();
  }
  private missionOutcome(result:MissionRecord):void {
    this.record('mission-outcome',result);this.episode(result.outcome,result.type,result.progress);
    if (!this.context?.active || result.reason==='world-changed' || result.reason==='replaced') return;
    if (result.outcome === 'completed') {
      void this.remember('mission', result.type, result.agentId);
      if (result.observed === 'structure' || result.observed === 'guided-landmark')
        void this.remember('landmark', 'structure', result.agentId);
      if (result.observed === 'floating-island') void this.remember('landmark', 'island', result.agentId);
    }
    const speaker=this.radioAgent(result.agentId);if(speaker===null)return;
    const locale=this.radioLanguage??selectedLocale, en=locale==='en-US';
    this.radio.report(speaker,missionReport(result,en),'local','notice',this.time,locale);
  }
  private record(event:string,data:unknown):void {this.trace.push({time:this.time,event,data});if(this.trace.length>256)this.trace.shift();}
  private event(event:TrustEvent,identity:string=event,cooldown=10):void {
    if(this.time<(this.cooldowns.get(identity)??-Infinity))return;
    this.cooldowns.set(identity,this.time+cooldown);this.trust=trustEvent(this.trust,event,this.time);
    this.record('trust',this.trust.events.at(-1));
    this.episode(event,'team',Math.round(this.trust.value*100));
    if(event==='accepted-lead')this.flightReport(1, 'heading', 'notice');
    if(event==='regroup-benefit')this.flightReport(1, 'formation', 'notice');
    if(event==='lost-coordination')this.flightReport(2, 'risk', 'risk');
    if(event==='impact')this.flightReport(2, 'obstacle', 'risk');
    if(event==='relay-success')this.flightReport(2, 'rescue', 'risk');
  }
  public perception():Perception|null {
    const c=this.context;if(!c?.active||!this.team.agents.some(a=>a.deployed))return null;
    const f=forwardFromAttitude(c.player.attitude);const right={x:Math.cos(c.player.attitude.yaw),z:-Math.sin(c.player.attitude.yaw)};
    const targets:Perception['targets']=[];
    for(const side of [0,-1,1]){
      const position={x:c.player.position.x+f.x*90+right.x*side*38,y:c.player.position.y+f.y*90+8+Math.abs(side)*12,z:c.player.position.z+f.z*90+right.z*side*38};
      if((c.world.isCompanionCovered?.(position)??c.world.isCollisionCovered?.(position))===false)continue;
      const hit=c.world.queryNearest(position,40);if(hit&&hit.distance<=8)continue;
      if(!clearApproach(c.world,c.player.position,position))continue;
      targets.push({id:side===0?'route-ahead':side<0?'route-left':'route-right',kind:'route',position,clearance:hit?.distance??null});
    }
    for(const agent of this.team.agents){
      const hit=queryFlightSurface(c.world,agent.flight.position,32.01);
      if(agent.deployed&&!agent.uncovered&&hit&&hit.distance>6&&hit.distance<=32)
        targets.push({id:`surface-${agent.id}`,kind:'surface',agentId:agent.id,position:{...agent.flight.position},clearance:hit.distance});
    }
    const registry=new SemanticTargets();
    targets.push(...registry.observe(c.world,c.player,this.epoch));
    const perception:Perception={requestId:`${this.epoch}-${++this.serial}`,epoch:this.epoch,time:this.time,seed:c.seed,
      player:{position:{...c.player.position},velocity:{...c.player.velocity},grace:c.rules.grace,graceLimit:c.rules.config.graceSeconds,surfaceDistance:queryFlightSurface(c.world,c.player.position,90)?.distance??null,mode:c.rules.config.mode},
      trust:this.trust.value,riskLimit:clamp(0.15+this.trust.value*0.65,0.15,0.8),charges:this.relay.charges,
      relayReady:this.team.agents.some(partner=>!relayEligibility(this.relay,{time:this.time,trust:this.trust.value,player:c.player.position,rules:c.rules,world:c.world,partner,requested:true})),
      agents:this.team.agents.map(a=>({id:a.id,position:{...a.flight.position},velocity:{...a.flight.velocity},task:a.task,surfaceDistance:a.surfaceDistance,deployed:a.deployed&&!a.uncovered})),
      targets,memory:this.memory.slice(-8)};
    this.pictures.set(perception.requestId,{perception:structuredClone(perception),registry});
    if(this.pictures.size>16)this.pictures.delete(this.pictures.keys().next().value!);
    return perception;
  }
  public async request():Promise<boolean>{
    if(this.radioPending||this.missions.busy||this.time<this.radioPlanUntil||!this.client.backgroundAvailable()||!this.client.canRequest())return false;
    const perception=this.perception();if(!perception)return false;
    this.record('perception',perception);const reply=await this.client.request(perception,undefined,undefined,undefined,undefined,true);
    if(!reply){this.record('fallback',{reason:this.client.snapshot().error??'cancelled'});return false;}
    return this.accept(reply,perception,'Model Planner');
  }

  public canSendDialogue(): boolean {
    return this.context?.active === true && this.team.agents.some(agent=>agent.deployed&&!agent.uncovered);
  }

  /** Typed and transcribed commands share the existing plan validator and team controller. */
  public async sendDialogue(raw: string, useModel = true): Promise<boolean> {
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
      const proposal=missionCommand(message,perception);
      const explicitMission=missionPrefix.test(message);
      if (proposal || explicitMission || explicitLegacy(message) || /cancel|abort|取消|撤销/i.test(message))
        this.nextSurvey = this.time + 65;
      const intent=!proposal&&explicitLegacy(message)?localRadioIntent(message,perception,this.team.settings.formation):null;
      const language=this.radioLanguage??radioLanguageOf(message);
      const en=language==='en-US';
      const speaker=this.radioAgent(addressedAgent(message)??proposal?.missions[0]?.agentIds[0]??intent?.agent??1)!;
      const report=(text:string,agent=speaker,source:'model'|'local'='local')=>{
        this.radio.report(agent,text,source,'reply',this.time,language);
        this.dialogue.add({agent,epoch:this.epoch,pilot:message,reply:radioText(text,140)},useModel && this.client.snapshot().connected);
        return true;
      };
      const addressed = addressedAgent(message);
      if (addressed !== null && this.radioAgent(addressed) !== addressed)
        return report(en ? 'That wingmate is unavailable.' : '指定的伴机暂时不可用。');
      if (/remember this conversation|记下这次通话/i.test(message)) {
        const saved = await this.remember('dialogue', 'radio-contact', speaker);
        if (generation !== this.radioGeneration) return false;
        const labels = journeyText(language);
        this.radio.report(speaker, saved ? labels.saved : this.journal?.unavailable ? labels.unavailable : labels.off,
          'local', 'reply', this.time, language, 'journey-recall');
        return true;
      }
      if (/past flights?|journey memor(?:y|ies)|以前的飞行|过往飞行|旅程记忆/i.test(message)) {
        const snapshot = this.journal?.snapshot();
        const recent = snapshot?.enabled ? snapshot.entries.filter(e => !addressed || !e.agent || e.agent === addressed).slice(-6).reverse() : [];
        const model = recent.length && snapshot?.shareWithModel && useModel && this.client.canRequest(true)
          ? await this.client.request(perception, 'Recall a shared flight', language, undefined,
            { turns: [], working: [], historicalObservations: recent.map(shareableObservation) }) : null;
        if (generation !== this.radioGeneration || !this.context?.active) return false;
        const current = this.journal?.snapshot();
        const choice = model?.decision;
        const index = current?.shareWithModel && choice && typeof choice === 'object'
          && Object.keys(choice).length === 1 && 'observation' in choice && typeof choice.observation === 'number'
          && Number.isInteger(choice.observation) && recent[choice.observation] ? choice.observation : 0;
        const entry = current?.entries.find(e => e.id === recent[index]?.id);
        const labels = journeyText(language);
        const line = !current?.enabled ? labels.off : entry ? `${labels.past} · ${describeObservation(entry, language)}` : labels.empty;
        // History bypasses session dialogue context and cloud speech even after model consent is revoked.
        this.radio.report(speaker, line, 'local', 'reply', this.time, language, 'journey-recall');
        return true;
      }
      const conversation = (agent: number, picture: Perception, act?: SpeechAct) => {
        const latest = this.missions.snapshot().filter(m => m.agentId === agent && m.epoch === this.epoch).at(-1);
        return groundedDialogue(message, agent, language, picture, latest, this.dialogue.recent(agent), act);
      };
      if (/^(?:cancel|abort|stand down|取消|撤销|停止任务)/i.test(directive(message)??'')) {
        const id=addressedAgent(message);
        const ids=id===null?perception.agents.map(a=>a.id):[id];
        const active=this.missions.snapshot().some(m=>m.outcome==='running'&&ids.includes(m.agentId)) ||
          this.lastPlan?.orders.some(o=>o.agents.some(a=>ids.includes(a)));
        this.missions.cancel(ids,'pilot-cancelled');this.removeOrders(ids);
        for(const agent of ids)this.team.clearTarget(agent);
        return report(active?(en?'Orders cancelled.':'任务已取消。'):(en?'No active order for that wingmate.':'该伴机没有进行中的任务。'));
      }
      const records = this.missions.snapshot();
      if (!intent && !proposal && /mission status|task status|任务进度|任务状态/i.test(message)) {
        return report(conversation(speaker, perception, 'mission'));
      }
      const freeDialogue = !intent && !proposal && !explicitMission && freeDialogueTopic(message);
      const working=records.slice(-4).map(({agentId,type,phase,outcome,reason,observed,epoch})=>({agentId,type,phase,outcome,reason,observed,epoch}));
      const model=useModel&&this.client.canRequest(true) ? await this.client.request(perception,message,language,intent?.plan?.orders,
        {turns:this.dialogue.context(),missions:proposal?.missions??(intent?undefined:[]),working,explicitMission,freeDialogue}) : null;
      if(generation!==this.radioGeneration||!this.context?.active || !this.pictures.has(perception.requestId))return false;
      if (this.radioAgent(speaker) !== speaker) return false;
      const modelSpeech = (agent: number, act?: SpeechAct, acceptedOrder = false) => {
        const picture = this.perception();
        if (!picture || !model) return false;
        const acknowledgement = en ? 'Copy. Order accepted.' : '收到，指令已接受。';
        report(acceptedOrder ? acknowledgement : conversation(agent, picture, act), agent, 'model');
        this.record('radio-interpretation', {
          source: 'model', intent: intent?.kind ?? null, requestId: perception.requestId, agent,
          readings: { altitude: picture.player.position.y, surfaceDistance: picture.player.surfaceDistance, trust: picture.trust },
          action: acceptedOrder ? this.lastPlan?.orders : null, latencyMs: model.latencyMs, usage: model.usage,
        });
        if (acceptedOrder) this.trackRadioOutcome(perception, agent, language);
        return true;
      };
      if (proposal) {
        const result=this.applyMission(proposal,perception,model?.decision);
        const names=proposal.missions.map(m=>`KITE-${m.agentIds.join('/')} ${missionName(m.type,en)}`).join(en?', ':'，');
        return report(result==='accepted'?(en?`Assigned: ${names}.`:`已分配：${names}。`):missionReason(result,en));
      }
      if (!intent && model) {
        const checked=validateMissions(model.decision,perception,this.missionContext(),this.pictures.get(perception.requestId)!.registry,this.used);
        if (explicitMission && checked.ok && checked.assignments.length) {
          const assigned = addressedAgent(message);
          if (assigned !== null && checked.assignments.some(({order}) => order.agentIds.some(id => id !== assigned)))
            return report(en ? 'The plan did not match the requested wingmate.' : '任务分配与指定伴机不符。');
          this.startMissions(checked.assignments, perception);
          const names = checked.assignments.map(({order}) => missionName(order.type, en));
          return report(en ? `Assigned: ${names.join(', ')}.` : `已分配：${names.join('，')}。`);
        }
        if (explicitMission && !checked.ok) return report(missionReason(checked.reason,en));
        if (!explicitMission && checked.ok && !checked.assignments.length) {
          const line = checked.dialogue.find(line => line.agentId === speaker);
          if (freeDialogue && line?.freeText) return report(line.freeText, speaker, 'model');
          if (line) return modelSpeech(speaker, line.act);
        }
      }
      if (explicitMission) return report(en ? 'No matching mission. Try “patrol” or “find a passage”.' : '没有匹配的任务。请试试“巡航”或“寻找通道”。');
      const response=model&&readRadioReply(model.decision);
      if (model && response && response.agentId === speaker && this.time - perception.time < 12) {
        if (response.plan === null && !intent) return modelSpeech(speaker, response.act);
        if (response.plan !== null && intent && this.accept({ ...model, decision: response.plan }, perception, 'Model Radio', intent))
          return modelSpeech(speaker, response.act, true);
      }
      const agent=this.radioAgent(intent?.agent??addressedAgent(message)??1);
      if(agent===null)return false;
      const applied=!!intent?.plan&&this.accept({decision:intent.plan,usage:{input:0,output:0,total:0,cached:0},latencyMs:0,
        provider:'local',model:'local radio'},perception,'Local Radio');
      if (applied) {
        this.radio.reportFixed(agent, 'command', language, 'reply', this.time);
        const line=this.radio.snapshot().history.at(-1);
        if(line?.agent===agent)this.dialogue.add({agent,epoch:this.epoch,pilot:message,reply:line.text},useModel && this.client.snapshot().connected);
      } else {
        const current = this.perception();
        if (!current) return false;
        const reply = intent ? localRadioReply(message, current, intent, agent, language) : conversation(agent, current);
        report(reply,agent);
      }
      this.record('radio-interpretation',{source:'local',intent:intent?.kind??null,requestId:perception.requestId,agent,
        action:applied?this.lastPlan?.orders:null,modelFallback:useModel&&(!!model||this.client.snapshot().connected)});
      if(applied)this.trackRadioOutcome(perception,agent,language);
      return true;
    } finally {
      if(generation===this.radioGeneration)this.radioPending=false;
    }
  }

  public flightReport(agent: number, message: string | readonly [string, string], kind: RadioPriority = 'notice'): void {
    const speaker=this.radioAgent(agent);if(speaker===null)return;
    if(typeof message==='string'){
      if (this.time<(this.cooldowns.get('report-'+message)??-Infinity))return;
      this.cooldowns.set('report-'+message,this.time+(kind==='risk'?8:35));
      if(['glide','island','crossing','dragon'].includes(message))this.episode(message,'observed',1);
      if (message === 'glide' || message === 'crossing') void this.remember('maneuver', message, speaker);
      if (message === 'island' || message === 'dragon') void this.remember('landmark', message, speaker);
    }
    if(kind==='risk'){
      if(this.time<this.nextRisk)return;
      this.nextRisk=this.time+5;
    }else{
      if(this.time<this.nextReport || this.time<this.nextRisk)return;
      this.nextReport=this.time+20;
    }
    const locale = this.radioLanguage ?? selectedLocale;
    if (typeof message === 'string') this.radio.reportFixed(agent, message, locale, kind, this.time, speaker);
    else this.radio.report(speaker, message[locale === 'en-US' ? 1 : 0], 'local', kind, this.time, locale);
  }

  private radioAgent(preferred: number): number | null {
    const available=this.team.agents.filter(agent=>agent.deployed&&!agent.uncovered);
    return available.find(agent=>agent.id===preferred)?.id??available[0]?.id??null;
  }

  private trackRadioOutcome(perception:Perception,speaker:number,language:RadioLanguage):void {
    const plan=this.lastPlan;
    if(!plan||plan.requestId!==perception.requestId)return;
    const starts=plan.orders.flatMap(order=>order.agents.map(id=>({id,action:order.action,
      position:{...this.team.agents.find(agent=>agent.id===id)!.flight.position}})));
    this.radioPlanUntil=this.planUntil;
    this.radioOutcome={requestId:plan.requestId,speaker,due:this.time+1.4,starts,chinese:language==='zh-CN'};
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
    this.radio.report(speaker,text,'local','notice',this.time,outcome.chinese ? 'zh-CN' : 'en-US');
  }
  /** Replays are deliberately labelled and still pass current geometry, epoch and TTL checks. */
  public replay(decision:unknown,perception:Perception):boolean {
    const picture=this.pictures.get(perception.requestId);
    if(!picture)return false;
    perception=picture.perception;
    if(decision && typeof decision==='object' && 'schemaVersion' in decision && this.context) {
      const checked=validateMissions(decision,perception,this.missionContext(),picture.registry,this.used);
      if (!checked.ok) return false;
      this.startMissions(checked.assignments,perception);
      return true;
    }
    return this.accept({decision,usage:{input:0,output:0,total:0,cached:0},latencyMs:0,provider:'recording',model:'recorded'},perception,'Recorded Model Plan');
  }
  private consume(requestId:string):void {
    this.used.add(requestId);
    if (this.used.size > 128) this.used.delete(this.used.values().next().value!);
  }
  private removeOrders(ids:readonly number[]):void {
    const plan = this.lastPlan;
    if (!plan) return;
    const resolved = plan.resolved
      .map(order => ({ ...order, agents: order.agents.filter(id => !ids.includes(id)) }))
      .filter(order => order.agents.length > 0);
    const orders = resolved.map(({agents,action,targetId}) => ({agents,action,targetId}));
    this.lastPlan = resolved.length ? { ...plan, resolved, orders } : null;
    if (this.lead && ids.includes(this.lead.id)) this.lead = null;
    if (!this.lastPlan) {
      this.radioPlanUntil = 0;
      this.planner = 'Local Autonomous Controller';
    }
  }
  private startMissions(assignments:Parameters<MissionExecutive['start']>[0],p:Perception,priority:MissionRecord['priority']='pilot'):void {
    this.consume(p.requestId);
    const ids=assignments.flatMap(a=>a.order.agentIds);
    this.removeOrders(ids);
    ids.forEach(id=>this.team.clearTarget(id));
    this.missions.start(assignments,p,this.time,priority);
    this.nextMissionTick=this.time;
  }
  private applyMission(proposal:MissionPlan,p:Perception,model:unknown):string {
    const live=this.missionContext();
    const registry=this.pictures.get(p.requestId)!.registry;
    if(model) {
      const checked=validateMissions(model,p,live,registry,this.used);
      if (checked.ok && matchesMissionIntent(checked.assignments,proposal.missions)) {
        this.startMissions(checked.assignments,p);
        this.record('mission-validation',{requestId:p.requestId,source:'model',result:'accepted'});
        return 'accepted';
      }
      const result = checked.ok ? 'intent-mismatch' : checked.reason;
      this.record('mission-validation',{requestId:p.requestId,source:'model',result,shape:missionEnvelopeShape(model)});
    }
    const checked=validateMissions(proposal,p,live,registry,this.used);
    this.record('mission-validation',{requestId:p.requestId,source:'local',result:checked.ok?'accepted':checked.reason});
    if(!checked.ok)return checked.reason;
    this.startMissions(checked.assignments,p);
    return 'accepted';
  }
  private accept(reply:ModelReply,perception:Perception,label:string,pilotIntent:LocalRadioIntent|null=null):boolean {
    const c=this.context;
    if(!c)return false;
    const result=validatePlan(reply.decision,{perception,epoch:this.epoch,time:this.time,active:c.active,player:c.player.position,agents:this.team.agents,world:c.world,usedIds:this.used});
    if(result.ok&&pilotIntent){
      const required=pilotIntent.plan?.orders[0];
      const matching=required&&result.plan.orders.filter(order=>order.action===required.action&&
        (pilotIntent.kind!=='scout-left'||order.targetId===required.targetId));
      if(!required||!matching||matching.length!==result.plan.orders.length||
        matching.some(order=>order.targetId!==required.targetId||order.agents.some(id=>!required.agents.includes(id)))||
        !required.agents.every(id=>matching.some(order=>order.agents.includes(id)))){
        this.record('decision',{requestId:perception.requestId,validation:'radio-command-mismatch'});
        return false;
      }
    }
    this.record('decision',{requestId:perception.requestId,model:reply.model,usage:reply.usage,latencyMs:reply.latencyMs,
      decision:result.ok?{...result.plan,reason:'Validated flight order',resolved:undefined}:undefined,validation:result.ok?'accepted':result.reason});
    if(!result.ok){if(!['stale-epoch','inactive-state'].includes(result.reason))this.event('bad-plan');return false;}
    const plan={...result.plan,reason:'Validated flight order'};this.consume(plan.requestId);
    for (const order of this.lastPlan?.orders ?? []) {
      for (const id of order.agents) this.team.clearTarget(id);
    }
    this.missions.cancel(plan.orders.flatMap(o=>o.agents),'replaced');
    this.team.configure({...this.team.settings,formation:plan.formation});
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
  private independentSurvey(): void {
    this.nextSurvey = this.time + 8;
    if (this.team.settings.behavior !== 'independent' || !this.context?.world.semanticCandidates ||
      this.radioPending || this.missions.busy || this.lastPlan || this.client.snapshot().connected) return;
    const picture = this.perception();
    if (!picture) return;
    const registry = this.pictures.get(picture.requestId)!.registry, live = this.missionContext();
    if (!picture.targets.some(target => registry.site(target.id)?.authored)) return;
    const assignments: Parameters<MissionExecutive['start']>[0] = [];
    for (const [agent, type, capability] of [[1, 'FIND_GLIDE_ROUTE', 'glide'], [2, 'FIND_ESCAPE', 'release'],
      [3, 'SCOUT_BRANCH', 'scout']] as const) {
      if (!picture.agents.some(a => a.id === agent && a.deployed)) continue;
      for (const target of picture.targets) {
        // Authored sites precede the locally sampled alternatives for this request.
        if (!target.capabilities?.includes(capability) || !registry.site(target.id) || this.surveyed.has(target.id + capability)) continue;
        const decision = validateMissions({ schemaVersion: 2, epoch: this.epoch, requestId: picture.requestId, dialogue: [],
          missions: [{ agentIds: [agent], type, targetId: target.id, timeoutSeconds: 45 }] }, picture, live, registry, this.used);
        if (!decision.ok) continue;
        assignments.push(...decision.assignments);
        this.surveyed.add(target.id + capability);
        if (this.surveyed.size > 24) this.surveyed.delete(this.surveyed.values().next().value!);
        break;
      }
    }
    if (assignments.length) {
      this.startMissions(assignments, picture, 'local');
      this.nextSurvey = this.time + 45;
    }
  }
  public step(player:FlightState,rules:RunRulesState,world:CompanionWorld,seed:number,dt:number):RunRulesState {
    if (!(dt>0) || !Number.isFinite(dt) || rules.status!=='running') {this.suspend();return rules;}
    if (this.context && world !== this.context.world) this.invalidate();
    this.time+=dt;this.context={player,rules,world,seed,active:rules.status==='running'};
    if (this.pendingVisit) this.recordVisit();
    if (this.time >= this.nextSurvey) this.independentSurvey();
    this.radio.step(this.time);this.reportRadioOutcome();
    if(this.missions.busy && this.time>=this.nextMissionTick){
      this.nextMissionTick=this.time+.2;
      if(this.team.agents.some(agent=>agent.task==='AVOID' && this.missions.escorting(agent.id)))this.flightReport(2,'obstacle','risk');
      this.missions.tick(this.missionContext(),id=>{
        const reason=this.missionContext().relayReason(id);
        if(reason)return{success:false,reason};
        rules=this.relayAttempt(id);
        return {success:true,reason:rules.config.mode==='challenge'?'survival-rescue':'free-flight-training'};
      });
    }
    this.team.cooperation.trust=this.trust.value;
    if(this.lastPlan&&this.time>=this.planUntil){this.record('expired',{requestId:this.lastPlan.requestId});this.lastPlan=null;this.team.cooperation.risk=0.3;this.planner='Local Autonomous Controller';}
    if(this.lastPlan&&this.time-this.lastOutcome>=1){
      this.lastOutcome=this.time;this.record('outcome',{agents:this.positions(),player:{...player.position},grace:rules.grace,trust:this.trust.value,relay:{...this.relay}});
      this.episode('flight',this.lastPlan.orders.map(o=>o.action).join('/'),Math.round(player.speed));
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
    if (result.success && result.reason === 'survival-rescue') void this.remember('rescue', 'survival-rescue', id);
    this.record('relay',{agent:id,success:result.success,reason:result.reason,bonus:result.bonus,charges:this.relay.charges,player:{...c.player.position},partner:{...partner.flight.position},surface: queryFlightSurface(c.world,partner.flight.position,33)?.distance??null});
    if(result.success)this.relayFlash={from:{...c.player.position},to:{...partner.flight.position},until:this.time+1};
    return result.rules;
  }
  public snapshot(){return{planner:this.planner,time:this.time,epoch:this.epoch,trust:{...this.trust,events:this.trust.events.slice()},relay:{...this.relay},model:this.client.snapshot(),config:this.client.publicConfig(),lastPlan:this.lastPlan,trace:this.trace.slice(),memory:this.memory.slice(),missions:this.missions.snapshot(),dialogueTurns:this.dialogue.size,radio:{...this.radio.snapshot(),pending:this.radioPending}};}
}
