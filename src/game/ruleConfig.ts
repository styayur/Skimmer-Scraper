export interface RuleConfig {
  mode: 'challenge' | 'free';
  graceSeconds: number;
  shield: boolean;
  assisted: boolean;
}
export const DEFAULT_RULE_CONFIG: Readonly<RuleConfig> = Object.freeze({
  mode: 'challenge', graceSeconds: 5, shield: false, assisted: false,
});
export const normalizeRules = (value: Partial<RuleConfig> = {}): RuleConfig => ({
  mode: value.mode === 'free' ? 'free' : 'challenge',
  graceSeconds: Number.isFinite(value.graceSeconds)
    ? Math.round(Math.min(15, Math.max(1, value.graceSeconds!)) * 10) / 10 : 5,
  shield: value.mode === 'free' && value.shield !== false,
  assisted: value.assisted === true,
});
const KEY = 'skimmer-scraper.rules.v3';
export const loadRules = (storage: Storage = localStorage): RuleConfig => {
  try { return normalizeRules(JSON.parse(storage.getItem(KEY) ?? '{}')); }
  catch { return normalizeRules(); }
};
export const saveRules = (rules: RuleConfig, storage: Storage = localStorage): void => {
  try { storage.setItem(KEY, JSON.stringify(normalizeRules(rules))); } catch { /* optional */ }
};
