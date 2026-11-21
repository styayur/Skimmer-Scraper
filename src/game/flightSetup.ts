import { loadCompanions, normalizeCompanions } from '../companions/settings';
import { loadRules, normalizeRules } from './ruleConfig';

/** Earlier versions did not store their defaults, so any saved pilot data matters. */
export const loadFlightSetup = (storage: Storage, hasLocalAircraft: boolean) => {
  let returning = hasLocalAircraft;
  try {
    for (let i = 0; !returning && i < storage.length; i++) {
      returning = storage.key(i)?.startsWith('skimmer-scraper.') === true;
    }
  } catch {
    // Restrictive browser storage must not prevent a pilot from flying.
  }
  const companions = returning ? loadCompanions(storage) : normalizeCompanions({ count: 3 });
  const rules = returning ? loadRules(storage) : normalizeRules({ mode: 'free' });
  return { returning, companions, rules: { ...rules, assisted: companions.count > 0 } };
};
