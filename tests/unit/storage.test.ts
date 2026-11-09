import { describe, expect, it } from 'vitest';
import {
  bestStorageKey,
  defaultScoreContext,
  formatTime,
  loadBest,
  scoreContextFor,
  submitBest,
  type ScoreContext,
} from '../../src/game/storage';
import { resolveWorldSettings } from '../../src/world/worldConfig';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  public get length(): number { return this.data.size; }
  public clear(): void { this.data.clear(); }
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  public removeItem(key: string): void { this.data.delete(key); }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
}

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
