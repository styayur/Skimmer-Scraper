import { normalizeCompanions, saveCompanions, type CompanionSettings } from '../companions/settings';

export const bindCompanionSettings = (settings: CompanionSettings, canEditCount: () => boolean,
  change: (settings: CompanionSettings) => void): void => {
  const count = document.querySelector<HTMLSelectElement>('#companion-count')!;
  const formation = document.querySelector<HTMLSelectElement>('#companion-formation')!;
  const behavior = document.querySelector<HTMLSelectElement>('#companion-behavior')!;
  count.value = String(settings.count); formation.value = settings.formation; behavior.value = settings.behavior;
  document.querySelector('#rules-open')!.addEventListener('click', () => { count.disabled = !canEditCount(); });
  const update = (): void => {
    settings = normalizeCompanions({ count: canEditCount() ? Number(count.value) : settings.count,
      formation: formation.value as CompanionSettings['formation'], behavior: behavior.value as CompanionSettings['behavior'] });
    saveCompanions(settings); change(settings);
  };
  count.addEventListener('change', update); formation.addEventListener('change', update); behavior.addEventListener('change', update);
};
