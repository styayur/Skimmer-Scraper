import { describe, expect, it } from 'vitest';
import { exportPilot, importPilot } from '../../src/game/pilotSave';
import {
  bestStorageKey,
  defaultScoreContext,
  formatTime,
  loadBest,
  scoreContextFor,
  submitBest,
  type ScoreContext,
} from '../../src/game/storage';
import { resolveWorldSettings, worldSettingsFromSearch } from '../../src/world/worldConfig';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  public get length(): number { return this.data.size; }
  public clear(): void { this.data.clear(); }
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  public removeItem(key: string): void { this.data.delete(key); }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
}

it('restores pilot settings and preserves better scores and unrelated application data', () => {
  const storage = new MemoryStorage();
  storage.setItem('skimmer-scraper.best.v1', '80');
  storage.setItem('skimmer-scraper.preferences.v2', '{"cameraMode":"cockpit"}');
  storage.setItem('unrelated', 'private');
  const backup = exportPilot(storage);
  expect(backup).not.toContain('private');
  storage.setItem('skimmer-scraper.best.v1', '120');
  storage.removeItem('skimmer-scraper.preferences.v2');
  importPilot(storage, backup);
  expect(storage.getItem('skimmer-scraper.best.v1')).toBe('120');
  expect(storage.getItem('skimmer-scraper.preferences.v2')).toContain('cockpit');
  const invalid = JSON.parse(backup);
  invalid.records.unrelated = 'modified';
  expect(() => importPilot(storage, JSON.stringify(invalid))).toThrow();
  expect(storage.getItem('unrelated')).toBe('private');
});

const context = (overrides: Partial<ScoreContext> = {}): ScoreContext => ({
  ...defaultScoreContext,
  ...overrides,
});

describe('local score storage', () => {
  it('formats survival time with stable centiseconds', () => {
    expect(formatTime(0)).toBe('00:00.00');
    expect(formatTime(61.239)).toBe('01:01.23');
    expect(formatTime(Number.NaN)).toBe('00:00.00');
  });

  it('stores only a strictly better local best in the selected scenario', () => {
    const storage = new MemoryStorage();
    const selected = context();
    expect(loadBest(selected, storage)).toBe(0);
    expect(submitBest(12.5, selected, storage)).toEqual({ best: 12.5, isNewBest: true });
    expect(submitBest(11.9, selected, storage)).toEqual({ best: 12.5, isNewBest: false });
    expect(submitBest(13.1, selected, storage)).toEqual({ best: 13.1, isNewBest: true });
    expect(loadBest(selected, storage)).toBe(13.1);
  });

  it('isolates mode, preset, seed and generator-version records', () => {
    const storage = new MemoryStorage();
    const stable = context({ mode: 'stable' });
    const ephemeral = context({ mode: 'ephemeral' });
    const neon = context({ preset: 'neon' });
    const otherSeed = context({ seedText: 'other-seed' });
    const nextGenerator = context({ generatorVersion: 3 });

    expect(submitBest(20, stable, storage)).toEqual({ best: 20, isNewBest: true });
    expect(loadBest(ephemeral, storage)).toBe(0);
    expect(loadBest(neon, storage)).toBe(0);
    expect(loadBest(otherSeed, storage)).toBe(0);
    expect(loadBest(nextGenerator, storage)).toBe(0);

    expect(submitBest(7, ephemeral, storage).best).toBe(7);
    expect(loadBest(stable, storage)).toBe(20);
    expect(loadBest(ephemeral, storage)).toBe(7);
    expect(new Set([
      bestStorageKey(stable),
      bestStorageKey(ephemeral),
      bestStorageKey(neon),
      bestStorageKey(otherSeed),
      bestStorageKey(nextGenerator),
    ]).size).toBe(5);
  });

  it('migrates the v0.1 global best into the default stable scenario only', () => {
    const storage = new MemoryStorage();
    storage.setItem('skimmer-scraper.best.v1', '21.4');
    expect(loadBest(context(), storage)).toBe(21.4);
    expect(storage.getItem(bestStorageKey(context()))).toBe('21.4');
    expect(loadBest(context({ mode: 'ephemeral' }), storage)).toBe(0);
    expect(loadBest(context({ preset: 'neon' }), storage)).toBe(0);
  });

  it('derives score context from the resolved world settings', () => {
    const settings = resolveWorldSettings({ seed: 'score-share', preset: 'archipelago', mode: 'ephemeral' });
    expect(scoreContextFor(settings)).toEqual({
      seedText: settings.seedText,
      preset: 'archipelago',
      mode: 'ephemeral',
      generatorVersion: settings.generatorVersion,
    });
  });
});

it('continues the matching Dragonspine record and preserves the original map record for rollback', () => {
  const storage = new MemoryStorage();
  const city = scoreContextFor(worldSettingsFromSearch('?seed=334458&gen=4'));
  const original = { ...city, worldAsset: 'dragon' };
  const ascendant = { ...city, worldAsset: 'ascendant' };
  submitBest(31, original, storage);
  submitBest(17, ascendant, storage);
  submitBest(23, city, storage);
  for (const theme of ['dragon', 'ascendant', 'dragonspine']) {
    const unified = scoreContextFor(worldSettingsFromSearch('?seed=334458&theme=' + theme));
    expect(bestStorageKey(unified)).toBe(bestStorageKey(ascendant));
    expect(loadBest(unified, storage)).toBe(17);
  }
  const unified = scoreContextFor(worldSettingsFromSearch('?seed=334458&theme=dragonspine'));
  expect(submitBest(19, unified, storage).isNewBest).toBe(true);
  const restored = new MemoryStorage();
  importPilot(restored, exportPilot(storage));
  expect(loadBest(original, restored)).toBe(31);
  expect(loadBest(ascendant, restored)).toBe(19);
  expect(loadBest(city, restored)).toBe(23);
});
