import type { RuleConfig } from '../game/ruleConfig';

/** Edits pre-flight options through a composition-root callback. */
export class RunSettingsPanel {
  public constructor(rules: RuleConfig, onChange: (rules: RuleConfig) => void,
    canEdit: () => boolean) {
    const panel = document.querySelector<HTMLElement>('#rules-panel')!;
    const mode = document.querySelector<HTMLSelectElement>('#run-mode')!;
    const grace = document.querySelector<HTMLInputElement>('#run-grace')!;
    const shield = document.querySelector<HTMLInputElement>('#run-shield')!;
    const note = document.getElementById('rules-note')!;
    mode.value = rules.mode;
    grace.value = String(rules.graceSeconds);
    shield.checked = rules.shield;
    panel.addEventListener('skimmer:open', () => {
      const locked = !canEdit();
      for (const field of [mode, grace, shield]) field.disabled = locked;
      note.hidden = !locked;
      note.textContent = locked ? '规则已锁定，返回标题可修改。' : '';
    });
    const change = (): void => {
      if (!canEdit()) return;
      rules = { ...rules, mode: mode.value === 'free' ? 'free' : 'challenge',
        graceSeconds: Number(grace.value), shield: shield.checked };
      onChange(rules);
    };
    mode.addEventListener('change', () => {
      shield.checked = mode.value === 'free'; change();
    });
    grace.addEventListener('change', change);
    shield.addEventListener('change', change);
  }
}
