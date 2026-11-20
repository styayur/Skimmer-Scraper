import type { RuleConfig } from '../game/ruleConfig';

/** Edits pre-flight options through a composition-root callback. */
export class RunSettingsPanel {
  public constructor(rules: RuleConfig, onChange: (rules: RuleConfig) => void,
    onOpen: () => boolean, onClose: (resume: boolean) => void, canEdit: () => boolean) {
    const panel = document.querySelector<HTMLElement>('#rules-panel')!;
    const mode = document.querySelector<HTMLSelectElement>('#run-mode')!;
    const grace = document.querySelector<HTMLInputElement>('#run-grace')!;
    const shield = document.querySelector<HTMLInputElement>('#run-shield')!;
    mode.value = rules.mode;
    grace.value = String(rules.graceSeconds);
    shield.checked = rules.shield;
    let resume = false;
    document.querySelector('#rules-open')!.addEventListener('click', () => {
      resume = onOpen(); panel.hidden = false;
      for (const field of [mode, grace, shield]) field.disabled = !canEdit();
      document.querySelector('#rules-note')!.textContent = !canEdit()
        ? '本次飞行规则已锁定；返回标题后可修改。' : '规则在起飞后锁定，重试沿用当前选择。';
    });
    document.querySelector('#rules-close')!.addEventListener('click', () => {
      panel.hidden = true; onClose(resume);
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
