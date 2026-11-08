const BEST_KEY = 'skimmer-scraper.best.v1';

export const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe * 100) % 100);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

export const loadBest = (storage: Storage = window.localStorage): number => {
  try {
    const parsed = Number(storage.getItem(BEST_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

export const submitBest = (
  runTime: number,
  storage: Storage = window.localStorage,
): { best: number; isNewBest: boolean } => {
  const previous = loadBest(storage);
  if (!(runTime > previous)) return { best: previous, isNewBest: false };
  try {
    storage.setItem(BEST_KEY, String(runTime));
  } catch {
    return { best: runTime, isNewBest: true };
  }
  return { best: runTime, isNewBest: true };
};
