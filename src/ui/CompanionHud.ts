import { localizeDiagnostic } from '../i18n/diagnostics';
import { t, wingmateName } from '../i18n';
import type { AgentState, AgentTask } from '../companions/AgentController';
const labels: Record<AgentTask, string> = { FORMATION_FOLLOW: t('ui.formation'), INDEPENDENT_FOLLOW: t('companionHud.following'),
  LEAD: t('companionHud.leading'), REGROUP: t('companionHud.regrouping'), AVOID: t('companionHud.avoidingObstacle'), RECOVER: t('companionHud.returning'), SCOUT: t('companionHud.scouting'), PROTECT: t('companionHud.escorting'), RELAY: t('companionHud.relay'), HOLD: t('companionHud.holding') };
export const updateCompanionHud = (agents: readonly AgentState[], planner: string): void => {
  const element = document.querySelector<HTMLElement>('#companion-status')!;
  element.hidden = agents.length === 0;
  if (element.dataset.planner !== planner) {
    element.dataset.planner = planner;
    element.title = localizeDiagnostic(planner);
  }
  const signature = agents.map(agent => `${agent.id}:${agent.deployed ? agent.task : 'waiting'}`).join('|');
  if (element.dataset.signature === signature) return;
  element.dataset.signature = signature;
  element.replaceChildren(...agents.map(agent => {
    const status = document.createElement('span');
    status.dataset.wing = String(agent.id);
    status.textContent = `${wingmateName(agent.id)} ${agent.deployed ? labels[agent.task] : t('companionHud.standby')}`;
    return status;
  }));
};
