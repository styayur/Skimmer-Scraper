import type { AgentState, AgentTask } from '../companions/AgentController';
import { distance, type Vec3 } from '../core/math';
const labels: Record<AgentTask, string> = { FORMATION_FOLLOW: '编队跟随', INDEPENDENT_FOLLOW: '独立跟随',
  LEAD: '领航', REGROUP: '重新集合', AVOID: '避障', RECOVER: '恢复航线' };
export const updateCompanionHud = (agents: readonly AgentState[], player: Vec3): void => {
  const element = document.querySelector<HTMLElement>('#companion-status')!;
  element.hidden = agents.length === 0;
  const text = ['Local Autonomous Controller', ...agents.map(agent =>
    `${agent.callsign} · ${agent.deployed ? labels[agent.task] : '等待安全部署'} · ${Math.round(distance(agent.flight.position, player))} m`)].join('\n');
  if (element.textContent !== text) element.textContent = text;
};
