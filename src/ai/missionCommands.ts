import type { Perception, PerceivedTarget } from './contracts';
import type { Assignment, MissionPlan, MissionRecord, MissionType } from './missions';
import { addressedAgent, commandKind } from './radioCommands';

const address =
  /(?:\bKITE[- ]?\d+|\bwingman\s+\d+|\bnumber\s+\d+|风筝\s*[一二三四五六七八九\d]+号?|[一二三四五六七八九\d]+号)/i;
const isQuestion =
  /^(?:what|why|where|who|how|when|which|do you|did|is|was|were|tell me|describe|explain)\b|^(?:为什么|怎么|你是|你会|什么|介绍|刚才|还记得)|(?:吗|么)[？?]?$/i;
export function directive(message: string): string | null {
  const stripped = message
    .replace(new RegExp(`^(?:${address.source}|all (?:units|wingmates)|全体)[，,:：\\s]*`, 'i'), '')
    .trim();
  if (isQuestion.test(stripped)) return null;
  return stripped.replace(/^(?:please\s+|can you\s+|could you\s+|请|帮我|去|给我)/i, '').trim();
}
export const explicitLegacy = (message: string): boolean => {
  const text = directive(message);
  return (
    !!text &&
    /^(?:follow|lead|take point|navigate|scout|rally|gather up|regroup|hold|keep|maintain|find|prepare|surface relay|跟|领航|带路|侦察|集合|归队|保持|维持|找|准备|地表接力|表面接力)/i.test(
      text
    )
  );
};

const missionVerbs: ReadonlyArray<[MissionType, RegExp]> = [
  ['FIND_GLIDE_SURFACE', /^(?:find|look for|locate|search for|寻找|找|搜索).*(?:glid|滑行|贴面)/i],
  ['FIND_PASSAGE', /^(?:find|look for|locate|search for|寻找|找|搜索).*(?:passage|corridor|通道)/i],
  [
    'INSPECT_LANDMARK',
    /^(?:inspect|investigate|survey|observe|scout|侦察|观察|调查|检查).*(?:island|landmark|structure|地标|浮岛|建筑|结构)/i,
  ],
  ['ESCORT', /^(?:escort|protect|护航|保护)/i],
  ['WAIT_AND_REGROUP', /^(?:wait|等待|等候|等\d)/i],
  ['PATROL', /^(?:patrol|巡航|巡逻)/i],
];

function selectTarget(type: MissionType, clause: string, agentId: number, targets: PerceivedTarget[]) {
  switch (type) {
    case 'INSPECT_LANDMARK': {
      const wantsIsland = /island|浮岛/i.test(clause);
      return targets.find(
        (t) => t.capabilities?.includes('inspect') && (!wantsIsland || t.kind === 'floating-island')
      );
    }
    case 'FIND_GLIDE_SURFACE':
      return targets.find((t) => t.capabilities?.includes('glide'));
    case 'FIND_PASSAGE':
    case 'PATROL':
      return targets
        .filter((t) => t.kind === 'route')
        .sort((a, b) => (b.clearance ?? 41) - (a.clearance ?? 41))[0];
    case 'SURFACE_RELAY':
      return targets.find((t) => t.kind === 'surface' && t.agentId === agentId);
  }
}

const preferredAgent: Record<MissionType, number> = {
  FOLLOW: 1,
  REGROUP: 1,
  ESCORT: 2,
  FIND_PASSAGE: 1,
  INSPECT_LANDMARK: 3,
  FIND_GLIDE_SURFACE: 1,
  WAIT_AND_REGROUP: 1,
  PATROL: 3,
  SURFACE_RELAY: 2,
};
export const missionPrefix = /^(?:mission|task|任务)\s*[:：]\s*/i;
export function missionCommand(message: string, p: Perception): MissionPlan | null {
  const explicitlyRequested = missionPrefix.test(message);
  message = message.replace(missionPrefix, '');
  const clauses = message
    .split(new RegExp(`[;；]|(?:[,，、]|\\band\\b|然后|并且|和|\\s)+(?=\\s*${address.source})`, 'i'))
    .map((x) => x.trim())
    .filter(Boolean);
  const missions: Assignment[] = [];
  let advanced = false;
  for (const clause of clauses) {
    const verb = directive(clause);
    if (!verb) return null;
    let type = missionVerbs.find(([, pattern]) => pattern.test(verb))?.[0];
    if (type) {
      advanced = true;
    } else {
      const legacy = explicitLegacy(clause) && commandKind(clause);
      if (legacy === 'follow' || legacy === 'formation') type = 'FOLLOW';
      else if (legacy === 'regroup') type = 'REGROUP';
      else if (legacy === 'relay') type = 'SURFACE_RELAY';
      else if (legacy === 'safe-route' || legacy === 'lead') type = 'FIND_PASSAGE';
      else return null;
    }
    const preferred = preferredAgent[type];
    const deployed = p.agents.filter((a) => a.deployed);
    const specified = address.test(clause);
    const id = specified
      ? (addressedAgent(clause) ?? 0)
      : (deployed.find((a) => a.id === preferred)?.id ?? deployed[0]?.id ?? 0);
    const everyone =
      /\ball (?:units|wingmates)\b|全体/i.test(clause) || (!specified && ['FOLLOW', 'REGROUP'].includes(type));
    const agentIds = everyone ? deployed.map((a) => a.id) : [id];
    const target = selectTarget(type, clause, id, p.targets);
    const mission: Assignment = { agentIds, type, targetId: target?.id ?? null, timeoutSeconds: 60 };
    if (type === 'WAIT_AND_REGROUP') {
      const seconds = /^(?:wait(?: for)?|等(?:待|候)?)\s*([+-]?[\d.]+)\s*(?:seconds?|secs?|s\b|秒)/i.exec(verb);
      // An unknown condition must fail validation rather than silently becoming a three-second wait.
      const simple = /^(?:wait|等待|等候)(?:\s+(?:here|and regroup|then regroup)|后归队)?[.。!！]?$/i.test(
        verb
      );
      mission.waitSeconds = simple ? 3 : 0;
      if (seconds) mission.waitSeconds = Number(seconds[1]);
    }
    missions.push(mission);
  }
  if (!missions.length || (!explicitlyRequested && !advanced && clauses.length === 1)) return null;
  return { schemaVersion: 2, requestId: p.requestId, epoch: p.epoch, missions, dialogue: [] };
}

const missionNames: Record<MissionType, [string, string]> = {
  FOLLOW: ['跟随', 'follow'],
  REGROUP: ['归队', 'regroup'],
  ESCORT: ['护航', 'escort'],
  FIND_PASSAGE: ['寻找通道', 'find passage'],
  INSPECT_LANDMARK: ['观察地标', 'inspect landmark'],
  FIND_GLIDE_SURFACE: ['寻找滑行面', 'find glide surface'],
  WAIT_AND_REGROUP: ['等待后归队', 'wait and regroup'],
  PATROL: ['巡航', 'patrol'],
  SURFACE_RELAY: ['地表接力', 'Surface Relay'],
};
export const missionName = (type: MissionType, english: boolean) => missionNames[type][english ? 1 : 0];
const observations: Record<NonNullable<MissionRecord['observed']>, [string, string]> = {
  passage: ['已引导通过航路', 'guided through the passage'],
  structure: ['已观察到结构', 'structure observed'],
  'floating-island': ['已观察到浮岛', 'floating island observed'],
  'glide-surface': ['已观察到滑行面', 'glide surface observed'],
  'patrol-waypoint': ['已巡视航路点', 'patrol point visited'],
};
export function missionReport(record: MissionRecord, english: boolean): string {
  const outcomes = {
    running: ['进行中', 'in progress'],
    completed: ['已完成', 'completed'],
    failed: ['失败', 'failed'],
    cancelled: ['已取消', 'cancelled'],
  };
  const parts = [`KITE-${record.agentId}`, missionName(record.type, english), outcomes[record.outcome][english ? 1 : 0]];
  if (record.observed) parts.push(observations[record.observed][english ? 1 : 0]);
  parts.push(record.reason ? missionReason(record.reason, english) : `${Math.round(record.progress * 100)}%`);
  return parts.join(' · ');
}
export function missionReason(reason: string, english: boolean): string {
  const labels: Record<string, [string, string]> = {
    'agent-unavailable': ['指定伴机不可用', 'wingmate unavailable'],
    'resource-conflict': ['指令重复分配了伴机', 'conflicting assignments'],
    'target-unavailable': ['没有观测到所需目标', 'requested target not observed'],
    'target-unloaded': ['目标已失效', 'target lost'],
    unreachable: ['航线受阻', 'route obstructed'],
    deadline: ['任务超时', 'mission timed out'],
    'action-timeout': ['阶段超时', 'phase timed out'],
    'wait-duration': ['等待时间无效', 'invalid wait duration'],
    'world-changed': ['世界已切换', 'world changed'],
    returned: ['已归队', 'back in formation'],
    'in-formation': ['编队已确认', 'formation confirmed'],
    replaced: ['收到新指令', 'superseded'],
    'pilot-cancelled': ['飞行员取消任务', 'cancelled by pilot'],
    trust: ['信任不足', 'insufficient trust'],
    cooldown: ['接力冷却中', 'Relay cooling down'],
    'no-charges': ['接力用尽', 'no Relay charges'],
    'not-needed': ['尚无需救援', 'rescue not needed'],
    'player-safe': ['玩家已在安全范围内', 'pilot already safe'],
    distance: ['超出距离', 'out of range'],
    obstructed: ['救援路径受阻', 'rescue path obstructed'],
    'partner-surface': ['缺少接力表面', 'no relay surface'],
    'survival-rescue': ['救援生效', 'rescue applied'],
    'free-flight-training': ['接力训练完成', 'training Relay complete'],
  };
  return labels[reason]?.[english ? 1 : 0] ?? (english ? 'assignment unavailable' : '任务不可用');
}
