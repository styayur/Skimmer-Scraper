import {
  DEFAULT_WORLD_SEED,
  GENERATOR_VERSION,
  type WorldMode,
  type WorldPresetId,
  type WorldSettings,
} from '../world/worldConfig';

const LEGACY_BEST_KEY = 'skimmer-scraper.best.v1';
const SCOPED_BEST_PREFIX = 'skimmer-scraper.best.v2';

export interface ScoreContext {
  seedText: string;
  preset: WorldPresetId;
  mode: WorldMode;
  generatorVersion: number;
}

export const defaultScoreContext: ScoreContext = Object.freeze({
  seedText: String(DEFAULT_WORLD_SEED),
  preset: 'sakura',
  mode: 'stable',
  generatorVersion: GENERATOR_VERSION,
});

export const scoreContextFor = (settings: WorldSettings): ScoreContext => ({
  seedText: settings.seedText,
  preset: settings.preset,
  mode: settings.mode,
  generatorVersion: settings.generatorVersion,
});

export const bestStorageKey = (context: ScoreContext): string => [
  SCOPED_BEST_PREFIX,
  context.mode,
  context.preset,
  `gen${context.generatorVersion}`,
  encodeURIComponent(context.seedText),
].join(':');

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
  const previous = loadBest(context, storage);
  if (!(runTime > previous)) return { best: previous, isNewBest: false };
  try {
    storage.setItem(bestStorageKey(context), String(runTime));
  } catch {
    return { best: runTime, isNewBest: true };
  }
  return { best: runTime, isNewBest: true };
};
