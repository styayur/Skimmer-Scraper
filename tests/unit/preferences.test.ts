import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type GamePreferences,
} from '../../src/game/preferences';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  public get length(): number { return this.data.size; }
  public clear(): void { this.data.clear(); }
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  public removeItem(key: string): void { this.data.delete(key); }
  public setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('game preferences', () => {
  it('round-trips camera, comfort, and recording-hint preferences', () => {
    const storage = new MemoryStorage();
    const preferences: GamePreferences = {
      cameraMode: 'cockpit',
      visualStimulation: 'reduced',
      recordingHintDismissed: true,
    };
    savePreferences(preferences, storage);
    expect(loadPreferences(storage)).toEqual(preferences);
  });

  it('falls back safely to defaults for missing or malformed data', () => {
    const storage = new MemoryStorage();
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
    storage.setItem('skimmer-scraper.preferences.v2', '{broken');
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });
});
