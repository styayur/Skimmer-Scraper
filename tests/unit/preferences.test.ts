import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type GamePreferences,
} from '../../src/game/preferences';
import { loadFlightSetup } from '../../src/game/flightSetup';
import { loadCameraAnchor, recommendCameraAnchor, saveCameraAnchor } from '../../src/model/cameraAnchors';

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

  it('migrates a saved Nose view and preserves other preferences', () => {
    const storage = new MemoryStorage();
    storage.setItem('skimmer-scraper.preferences.v2', JSON.stringify({
      cameraMode: 'nose', visualStimulation: 'reduced', recordingHintDismissed: true,
    }));
    const migrated = { cameraMode: 'cockpit', visualStimulation: 'reduced', recordingHintDismissed: true };
    expect(loadPreferences(storage)).toEqual(migrated);
    expect(JSON.parse(storage.getItem('skimmer-scraper.preferences.v2')!)).toEqual(migrated);
  });
});

describe('first flight setup', () => {
  it('uses free flight and three companions for a new pilot', () => {
    const storage = new MemoryStorage();
    storage.setItem('another-app.preference', '1');
    expect(loadFlightSetup(storage, false)).toEqual({
      returning: false,
      rules: { mode: 'free', shield: true, graceSeconds: 5, assisted: true },
      companions: { count: 3, formation: 'wedge', behavior: 'formation' },
    });
  });

  it('preserves historical defaults for pilots with a score or a local aircraft', () => {
    const storage = new MemoryStorage();
    expect(loadFlightSetup(storage, true).rules.mode).toBe('challenge');
    storage.setItem('skimmer-scraper.best.v1', '12.5');
    expect(loadFlightSetup(storage, false).companions.count).toBe(0);
    expect(loadFlightSetup(storage, false).rules.mode).toBe('challenge');
    expect(storage.getItem('skimmer-scraper.best.v1')).toBe('12.5');
  });
});

describe('cockpit anchors', () => {
  it('derives distinct positions from the normalized aircraft bounds', () => {
    const bounds = { min: { x: -2, y: -0.4, z: -4 }, max: { x: 4, y: 0.6, z: 4 } };
    const standard = recommendCameraAnchor(bounds, 'standard');
    expect(standard.x).toBe(1);
    expect(recommendCameraAnchor(bounds, 'fighter').z).toBeLessThan(standard.z);
    expect(recommendCameraAnchor(bounds, 'glider').z).toBeGreaterThan(standard.z);
    expect(recommendCameraAnchor(bounds, 'high').y).toBeGreaterThan(standard.y);
  });

  it('preserves historical per-aircraft XYZ alongside named presets', () => {
    const storage = new MemoryStorage();
    const anchor = { x: 0.7, y: 1.2, z: -2.1 };
    storage.setItem('skimmer-scraper.camera-anchors.v3', JSON.stringify({ procedural: anchor }));
    expect(saveCameraAnchor('imported-aircraft', { preset: 'high', anchor }, storage)).toBe(true);
    expect(loadCameraAnchor('procedural', storage)).toEqual({ preset: 'custom', anchor });
    expect(loadCameraAnchor('imported-aircraft', storage)).toEqual({ preset: 'high', anchor });
  });
});
