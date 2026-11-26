import {
  DEFAULT_WORLD_SEED,
  LEGACY_GENERATOR_VERSION,
  type WorldMode,
  type WorldPresetId,
  type WorldSettings,
} from '../world/worldConfig';
import { normalizeRules, type RuleConfig } from './ruleConfig';

const LEGACY_BEST_KEY = 'skimmer-scraper.best.v1';
const SCOPED_BEST_PREFIX = 'skimmer-scraper.best.v2';

export interface ScoreContext {
  journey?: boolean;
  surfaceGlide?: boolean;
  worldAsset?: string;
  seedText: string;
  preset: WorldPresetId;
  mode: WorldMode;
  generatorVersion: number;
  rules?: RuleConfig;
}

export const defaultScoreContext: ScoreContext = Object.freeze({
  seedText: String(DEFAULT_WORLD_SEED),
  preset: 'sakura',
  mode: 'stable',
  generatorVersion: LEGACY_GENERATOR_VERSION,
});

export const scoreContextFor = (settings: WorldSettings, rules?: RuleConfig): ScoreContext => ({
  // Keep the existing score key for the same terrain, including after a rollback.
  ...(settings.theme === 'worldforge' ? { worldAsset: 'worldforge-1' } : settings.theme === 'dragonspine' ? { worldAsset: 'ascendant' } :
    settings.generatedPassages ? { worldAsset: 'generated-passages-v1' } : {}),
  seedText: settings.seedText,
  preset: settings.preset,
  mode: settings.mode,
  generatorVersion: settings.generatorVersion,
  ...(rules ? { rules: normalizeRules(rules) } : {}),
});

const standard = (context: ScoreContext): boolean => !context.rules ||
  (context.rules.mode === 'challenge' && context.rules.graceSeconds === 5 && !context.rules.assisted);
export const bestStorageKey = (context: ScoreContext): string => [
  SCOPED_BEST_PREFIX,
  context.mode,
  context.preset,
  `gen${context.generatorVersion}`,
  encodeURIComponent(context.seedText),
].join(':') + (standard(context) ? '' : `:${context.rules!.mode}:grace${context.rules!.graceSeconds}:${context.rules!.assisted ? 'assisted' : 'solo'}`)
  + (context.surfaceGlide ? ':surface-glide' : '') + (context.journey ? ':sky-journey-v3' : '') + (context.worldAsset ? `:local-${encodeURIComponent(context.worldAsset)}` : '');

export const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe * 100) % 100);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

const readPositive = (storage: Storage, key: string): number => {
  try {
    const parsed = Number(storage.getItem(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

const isLegacyDefaultContext = (context: ScoreContext): boolean =>
  !context.surfaceGlide && !context.journey &&
  !context.worldAsset &&
  standard(context) &&
  context.seedText === defaultScoreContext.seedText &&
  context.preset === defaultScoreContext.preset &&
  context.mode === defaultScoreContext.mode &&
  context.generatorVersion === defaultScoreContext.generatorVersion;

export const loadBest = (
  context: ScoreContext = defaultScoreContext,
  storage: Storage = window.localStorage,
): number => {
  const key = bestStorageKey(context);
  try {
    const scoped = storage.getItem(key);
    if (scoped !== null) return readPositive(storage, key);
  } catch {
    return 0;
  }

  if (!isLegacyDefaultContext(context)) return 0;
  const legacy = readPositive(storage, LEGACY_BEST_KEY);
  if (legacy > 0) {
    try {
      storage.setItem(key, String(legacy));
    } catch {}
  }
  return legacy;
};

export const submitBest = (
  runTime: number,
  context: ScoreContext = defaultScoreContext,
  storage: Storage = window.localStorage,
): { best: number; isNewBest: boolean } => {
  if (context.rules?.mode === 'free') return { best: 0, isNewBest: false };
  const previous = loadBest(context, storage);
  if (!(runTime > previous)) return { best: previous, isNewBest: false };
  try {
    storage.setItem(bestStorageKey(context), String(runTime));
  } catch {
    return { best: runTime, isNewBest: true };
  }
  return { best: runTime, isNewBest: true };
};
