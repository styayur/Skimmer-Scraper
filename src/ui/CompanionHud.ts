import type { AgentState, AgentTask } from '../companions/AgentController';
const labels: Record<AgentTask, string> = { FORMATION_FOLLOW: '编队', INDEPENDENT_FOLLOW: '跟随',
  LEAD: '领航', REGROUP: '集合', AVOID: '避障', RECOVER: '归队', SCOUT: '侦察', PROTECT: '护航', RELAY: '接力', HOLD: '盘旋' };
export const updateCompanionHud = (agents: readonly AgentState[], planner: string): void => {
  const element = document.querySelector<HTMLElement>('#companion-status')!;
  element.hidden = agents.length === 0;
  element.title = planner;
  const signature = agents.map(agent => `${agent.id}:${agent.deployed ? agent.task : 'waiting'}`).join('|');
  if (element.dataset.signature === signature) return;
  element.dataset.signature = signature;
  element.replaceChildren(...agents.map(agent => {
    const status = document.createElement('span');
    status.dataset.wing = String(agent.id);
    status.textContent = `${agent.callsign} ${agent.deployed ? labels[agent.task] : '待命'}`;
    return status;
  }));
};
