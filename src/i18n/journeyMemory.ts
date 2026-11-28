import type { Observation } from '../ai/journeyMemory';
import { missionName } from '../ai/missionCommands';
import { missionTypes } from '../ai/missions';
import type { Locale } from './locale';

const en = {
  title: 'Journey Memory', enabled: 'Remember shared flights on this device',
  share: 'Let my connected model select a memory when I ask about past flights',
  description: 'Each entry keeps the world, time, wingmate and event. To save a radio contact without its words, say “remember this conversation”. To recall a memory, ask “what do you remember from past flights?”',
  days: 'Keep for (days)', capacity: 'Maximum entries', erase: 'Clear all memories', remove: 'Delete',
  empty: 'No saved memories.', unavailable: 'Journey Memory could not read or save this journal.',
  off: 'Journey Memory is off.', saved: 'I logged our radio contact.', team: 'Flight team',
  past: 'From our flight log', visit: 'Visited world', island: 'Spotted floating island', dragon: 'Spotted Crownback',
  structure: 'Observed landmark', glide: 'Captured a surface glide', crossing: 'Crossed into a new sky',
  'survival-rescue': 'Completed a rescue relay', 'radio-contact': 'Made radio contact',
  city: 'Sakura Megacity', dragonspine: 'Dragonspine', worldforge: 'WorldForge', 'kinetic-city': 'Kinetic City', imported: 'Imported world',
};
const zh: typeof en = {
  title: '旅程记忆', enabled: '在此设备记住共同飞行的经历',
  share: '当我询问过往飞行时，允许已连接的模型选取一条记忆',
  description: '每条记忆记录世界、时间、伴机和事件。说“记下这次通话”可记住联络这件事，不保存通话原文。询问“还记得以前的飞行吗”即可回忆过往。',
  days: '保留天数', capacity: '最多保留条数', erase: '清除全部记忆', remove: '删除',
  empty: '尚无已保存的记忆。', unavailable: '旅程记忆无法读取或保存这份记录。',
  off: '旅程记忆未启用。', saved: '已记下我们这次联络。', team: '飞行编队',
  past: '以往的飞行记录', visit: '到访世界', island: '发现浮岛', dragon: '发现冠脊巨龙',
  structure: '观察地标', glide: '成功捕获滑行面', crossing: '穿越天空',
  'survival-rescue': '完成接力救援', 'radio-contact': '与伴机联络',
  city: '樱色巨城', dragonspine: '龙脊群岛', worldforge: '世界锻造场', 'kinetic-city': '动能之城', imported: '导入的世界',
};
export const journeyText = (locale: Locale) => locale === 'en-US' ? en : zh;

export function describeObservation(entry: Observation, locale: Locale) {
  const labels = journeyText(locale);
  const mission = missionTypes.find(type => type === entry.detail);
  const detail = entry.detail in labels ? labels[entry.detail as keyof typeof labels] : missionName(mission!, locale === 'en-US');
  const who = entry.agent ? `KITE-${entry.agent}` : labels.team;
  return `${who} · ${labels[entry.world.realm]} · ${detail}`;
}
