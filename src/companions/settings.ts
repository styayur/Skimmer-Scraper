export interface CompanionSettings {
  count: number;
  formation: 'wedge' | 'line' | 'spread';
  behavior: 'formation' | 'independent' | 'lead';
}
export const normalizeCompanions = (value: Partial<CompanionSettings> = {}): CompanionSettings => ({
  count: Number.isFinite(value.count) ? Math.round(Math.min(3, Math.max(0, value.count!))) : 0,
  formation: value.formation === 'line' || value.formation === 'spread' ? value.formation : 'wedge',
  behavior: value.behavior === 'independent' || value.behavior === 'lead' ? value.behavior : 'formation',
});
const KEY = 'skimmer-scraper.companions.v3';
export const loadCompanions = (): CompanionSettings => {
  try { return normalizeCompanions(JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { return normalizeCompanions(); }
};
export const saveCompanions = (settings: CompanionSettings): void => {
  try { localStorage.setItem(KEY, JSON.stringify(normalizeCompanions(settings))); } catch { /* optional */ }
};
