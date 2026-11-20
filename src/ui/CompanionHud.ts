import type { AgentState, AgentTask } from '../companions/AgentController';
import { distance, type Vec3 } from '../core/math';
const labels: Record<AgentTask, string> = { FORMATION_FOLLOW: '编队跟随', INDEPENDENT_FOLLOW: '独立跟随',
  LEAD: '领航', REGROUP: '重新集合', AVOID: '避障', RECOVER: '恢复航线', SCOUT: '侦察', PROTECT: '护航', RELAY: '表面接力', HOLD: '盘旋等待' };
export const updateCompanionHud = (agents: readonly AgentState[], player: Vec3, planner = 'Local Autonomous Controller'): void => {
  const element = document.querySelector<HTMLElement>('#companion-status')!;
  element.hidden = agents.length === 0;
  const text = [planner, ...agents.map(agent =>
    `${agent.callsign} · ${agent.deployed ? labels[agent.task] : '等待安全部署'} · ${Math.round(distance(agent.flight.position, player))} m`)].join('\n');
  if (element.textContent !== text) element.textContent = text;
};
