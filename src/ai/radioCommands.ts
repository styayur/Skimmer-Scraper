import type { Perception, TeamOrder, TeamPlan } from './contracts';
import { COMPANION_PROFILES, radioLanguageOf, type RadioLanguage } from './radioDialogue';

export type RadioCommand = 'follow' | 'lead' | 'scout-left' | 'regroup' | 'formation' | 'safe-route' | 'relay';
export interface LocalRadioIntent { kind: RadioCommand; plan: TeamPlan | null; agent: number | null }

export const localRadioReply = (message: string, perception: Perception, intent: LocalRadioIntent | null, agent: number,
  language: RadioLanguage = radioLanguageOf(message)): string => {
  const lang = language === 'zh-CN' ? 0 : 1;
  if (intent) {
    if (!intent.agent) return ['指定的伴机暂时不可用。', 'That wingmate is unavailable.'][lang]!;
    if (intent.kind === 'relay') return ['接力暂不可用。请留意可用表面、信任和剩余次数。', 'Surface Relay is unavailable. Check surface contact, Trust and charges.'][lang]!;
    return ['航线未通过安全检查，继续本地伴飞。', 'The route did not clear the safety check. Continuing autonomous flight.'][lang]!;
  }
  const profile = COMPANION_PROFILES.find(item => item.id === agent)!;
  if (/你是.{0,4}谁|呼号|who\s+are\s+you|call\s*sign/i.test(message)) {
    return lang === 0 ? `我是 ${profile.callsign}，${profile.role}。负责${profile.focus}。`
      : `${profile.callsign}, ${profile.role}. Ready for your call.`;
  }
  const ground = perception.player.surfaceDistance;
  const distance = ground === null ? ['90 米内没有可贴近表面', 'no flyable surface within 90 m'][lang]
    : [`最近可贴近表面 ${Math.round(ground)} 米`, `nearest flyable surface ${Math.round(ground)} m away`][lang];
  const trust = Math.round(perception.trust * 100);
  if (agent === 2) return lang === 0 ? `${distance}。信任 ${trust}%，接力剩余 ${perception.charges} 次。`
    : `${distance}. Trust ${trust}%, ${perception.charges} Relay charges.`;
  if (agent === 3) {
    const altitude = Math.round(perception.player.position.y);
    return lang === 0 ? `侦察通报。当前高度 ${altitude} 米，${distance}。` : `Scout report. Altitude ${altitude} m, ${distance}.`;
  }
  return lang === 0 ? `飞行通报。${distance}，信任 ${trust}%。` : `Flight report. ${distance}, Trust ${trust}%.`;
};

export const commandKind = (message: string): RadioCommand | null => {
  if (/\b(?:surface\s+relay|prepare\s+relay)\b|准备.{0,4}接力|地表接力|表面接力/i.test(message)) return 'relay';
  if (/\bscout\b.*\bleft\b|侦察.{0,12}左|左.{0,8}侦察/i.test(message)) return 'scout-left';
  if (/\bsafe\s+(?:route|path|way)\b|安全.{0,3}(?:路线|航线|路径)/i.test(message)) return 'safe-route';
  if (/\b(?:regroup|rally|gather up)\b|集合|归队/i.test(message)) return 'regroup';
  if (/\b(?:hold|keep|maintain)\b.*\bformation\b|保持.{0,4}队形|维持.{0,4}编队/i.test(message)) return 'formation';
  if (/\b(?:lead|take point|navigate)\b|领航|带路/i.test(message)) return 'lead';
  if (/\bfollow\b|跟随|跟上|跟我/i.test(message)) return 'follow';
  return null;
};

export const addressedAgent = (message: string): number | null => {
  const number = /(?:\bkite[- ]?|\b(?:number|wingman)\s+)(\d+)\b|(?:风筝\s*([一二三四五六七八九十\d]+)\s*号?|([一二三四五六七八九十\d]+)\s*号)/i.exec(message);
  const value = number?.[1] ?? number?.[2] ?? number?.[3];
  if (!value) return null;
  const id = { 一: 1, 二: 2, 三: 3 }[value] ?? Number(value);
  return Number.isInteger(id) ? id : 0;
};

export const localRadioIntent = (message: string, perception: Perception, formation: TeamPlan['formation']): LocalRadioIntent | null => {
  const kind = commandKind(message);
  if (!kind) return null;
  const available = perception.agents.filter(agent => agent.deployed).map(agent => agent.id);
  const intended = addressedAgent(message);
  const preferred = intended ?? (kind === 'scout-left' || kind === 'relay' ? 2 : 1);
  const agent = available.includes(preferred) ? preferred : intended === null ? available[0] ?? null : null;
  const routes = perception.targets.filter(target => target.kind === 'route');
  const safest = [...routes].sort((a, b) => (b.clearance ?? 41) - (a.clearance ?? 41))[0];
  let order: TeamOrder | null = null;
  if (agent !== null) {
    if (kind === 'regroup' || kind === 'formation' || kind === 'follow') {
      order = { agents: intended === null ? available : [agent], action: kind === 'regroup' ? 'REGROUP' : 'FOLLOW', targetId: null };
    } else if (kind === 'relay') {
      const target = perception.targets.find(t => t.kind === 'surface' && t.agentId === agent)
        ?? (intended === null ? perception.targets.find(t => t.kind === 'surface') : undefined);
      if (target?.agentId && perception.charges > 0) order = { agents: [target.agentId], action: 'RELAY', targetId: target.id };
    } else {
      const target = kind === 'scout-left' ? routes.find(t => t.id === 'route-left') : kind === 'safe-route' ? safest
        : routes.find(t => t.id === 'route-ahead') ?? safest;
      if (target) order = { agents: [agent], action: kind === 'scout-left' ? 'SCOUT' : 'LEAD', targetId: target.id };
    }
  }
  return { kind, agent: order?.agents[0] ?? agent, plan: order ? {
    requestId: perception.requestId, epoch: perception.epoch, ttl: 10, risk: Math.min(0.27, perception.riskLimit),
    formation, orders: [order], reason: 'Player radio command',
  } : null };
};
