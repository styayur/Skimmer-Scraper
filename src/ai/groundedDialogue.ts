import { identities, type DialogueTurn } from './companionMemory';
import type { Perception } from './contracts';
import { missionReport } from './missionCommands';
import type { MissionRecord } from './missions';
import { localRadioReply } from './radioCommands';
import type { RadioLanguage } from './radioDialogue';
import type { SpeechAct } from './radioSpeech';

const motivations = [
  ['I like giving the next pilot a route worth flying. That is why I kept those charts.', '我希望下一位飞行员也能找到值得飞的航线。所以那些旧航图我一直留着。'],
  ['On a rescue crew, everyone counts. I still listen for the last wingmate to call in.', '做搜救时，每一架飞机都很重要。我总会等最后一名队友报平安。'],
  ['An unfamiliar ridge always makes me curious. I like finding a new way to read the terrain.', '陌生的山脊总让我好奇。我喜欢试着从不同角度读懂地形。'],
] as const;
const greetings = [
  ['KITE-1 here. Want to talk charts, or hear the flight readings?', '一号在听。想聊聊航图，还是听飞行读数？'],
  ['KITE-2 here. Good to hear your voice, pilot.', '二号在听。队长，听到你的声音真好。'],
  ['KITE-3 here. What caught your eye, pilot?', '三号在听。队长，什么引起了你的注意？'],
] as const;

function requestedAct(message: string): SpeechAct | undefined {
  if (/last (?:message|reply)|what did you (?:just )?say|repeat that|上次.{0,5}说|刚才说|再说一遍/i.test(message)) return 'recall';
  if (/your (?:background|story)|where are you from|你的经历|你的来历|你的过去/i.test(message)) return 'background';
  if (/who are you|call\s*sign|你是.{0,4}谁|呼号/i.test(message)) return 'identity';
  if (/mission|task|finish|complet|result|succeed|任务|完成|成功|结果/i.test(message)) return 'mission';
  if (/altitude|height|surface distance|how far|trust|charge|高度|距离|信任|次数/i.test(message)) return 'flight';
  if (/see\b|seen|saw\b|sight|spotted|detect|island|landmark|coordinates|看见|看到|发现|坐标|浮岛|地标/i.test(message)) return 'observations';
  if (/why|what drives you|为什么/i.test(message)) return 'motivation';
  if (/\b(?:hello|hi|hey)\b|你好|嗨/i.test(message)) return 'greeting';
}

/** A creative exchange is opt-in by topic. Mixed requests stay grounded. */
export function freeDialogueTopic(message: string) {
  const operational = /altitude|speed|distance|where are (we|you) now|coordina|trust|charge|mission|task|hazard|danger|obstacle|see\b|status|height|高度|速度|距离|坐标|当前|现在在哪|信任|任务|危险|障碍|看见|看到|状态/i;
  return !operational.test(message) && /your (background|story|dream|favorite|childhood)|philosoph|tell (me )?a (story|joke)|poem|poetry|童年|往事|你的经历|你的过去|哲学|讲个故事|笑话|写首诗/i.test(message);
}

/** Select a topic from the pilot or an enumerated act. All displayed values come from the simulator. */
export function groundedDialogue(
  message: string, agent: number, language: RadioLanguage, picture: Perception,
  record: MissionRecord | undefined, previous: DialogueTurn | undefined, suggested?: SpeechAct
): string {
  const en = language === 'en-US';
  const lang = en ? 0 : 1;
  const identity = identities[agent - 1]!;
  let topic = requestedAct(message) ?? suggested ?? 'flight';
  if (previous && /tell me more|go on\b|elaborate|多说一点|接着说|详细说/i.test(message)) {
    const earlier = requestedAct(previous.pilot);
    if (earlier === 'observations' || earlier === 'mission' || earlier === 'flight') topic = earlier;
    else topic = 'motivation';
  }
  switch (topic) {
    case 'greeting':
      return greetings[agent - 1]![lang];
    case 'identity':
      return localRadioReply(en ? 'callsign' : '呼号', picture, null, agent, language);
    case 'background':
      return en ? identity.en : identity.zh;
    case 'motivation':
      return motivations[agent - 1]![lang];
    case 'recall':
      if (!previous) return en ? 'This is our first exchange.' : '这是我们第一次通话。';
      if (previous.reply.startsWith('My last reply was') || previous.reply.startsWith('我刚才说'))
        return previous.reply;
      return en ? `My last reply was “${previous.reply}”` : `我刚才说：“${previous.reply}”`;
    case 'mission':
      if (!record) return en ? 'No mission assigned.' : '没有已分配的任务。';
      return missionReport(record, en);
    case 'observations': {
      const island = picture.targets.some(target => target.kind === 'floating-island');
      const structure = picture.targets.some(target => target.kind === 'structure');
      if (island && structure) return en ? 'Our scan shows a floating island and a structure.' : '当前探测到了浮岛和结构。';
      if (island) return en ? 'Our scan shows a floating island.' : '当前探测到了浮岛。';
      if (structure) return en ? 'Our scan shows a structure.' : '当前探测到了结构。';
      return en ? 'Our scan has no confirmed landmark.' : '当前探测范围内没有已确认的地标。';
    }
    case 'flight': {
      const altitude = Math.round(picture.player.position.y);
      const ground = picture.player.surfaceDistance;
      const trust = Math.round(picture.trust * 100);
      const surface = ground === null
        ? (en ? 'No flyable surface within 90 m' : '90 米内没有可贴近表面')
        : (en ? `Nearest flyable surface ${Math.round(ground)} m away` : `最近可贴近表面 ${Math.round(ground)} 米`);
      return en ? `Pilot altitude ${altitude} m. ${surface}. Trust ${trust}%. Relay charges ${picture.charges}.`
        : `队长高度 ${altitude} 米。${surface}。信任 ${trust}%，接力剩余 ${picture.charges} 次。`;
    }
  }
}
