import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORLD_SEED,
  GENERATOR_VERSION,
  LEGACY_GENERATOR_VERSION,
  buildWorldShareUrl,
  parseSeedText,
  resolveWorldSettings,
  worldSettingsFromSearch,
} from '../../src/world/worldConfig';

describe('world settings', () => {
  it('parses stable numeric and string seeds without global randomness', () => {
    expect(parseSeedText('334458')).toEqual({ seed: 334458, seedText: '334458' });
    expect(parseSeedText('0x51a7a').seed).toBe(DEFAULT_WORLD_SEED);
    const first = parseSeedText('sakura-city');
    const second = parseSeedText('sakura-city');
    expect(first).toEqual(second);
    expect(first.seed).toBeGreaterThan(0);
  });

  it('resolves all presets and includes generator version', () => {
    for (const preset of ['sakura', 'neon', 'archipelago', 'randomized'] as const) {
      const settings = resolveWorldSettings({ seed: '42', preset, mode: 'stable' });
      expect(settings.preset).toBe(preset);
      expect(settings.generatorVersion).toBe(LEGACY_GENERATOR_VERSION);
      expect(settings.config.buildingDensity).toBeGreaterThan(0);
      expect(settings.config.streetSpacing).toBeGreaterThan(0);
    }
  });

  it('round-trips seed, preset and mode through share URLs', () => {
    const settings = resolveWorldSettings({ seed: 'shared-seed', preset: 'archipelago', mode: 'ephemeral' });
    const url = buildWorldShareUrl('https://example.com/Skimmer-Scraper/?old=1#x', settings);
    const parsed = worldSettingsFromSearch(new URL(url).search);
    expect(parsed.seed).toBe(settings.seed);
    expect(parsed.preset).toBe('archipelago');
    expect(parsed.mode).toBe('ephemeral');
    expect(new URL(url).searchParams.get('world')).toBe('ephemeral');
    expect(new URL(url).searchParams.get('gen')).toBe(String(LEGACY_GENERATOR_VERSION));
    expect(new URL(url).pathname).toBe('/Skimmer-Scraper/');
    expect(worldSettingsFromSearch('?world=unknown').mode).toBe('stable');
  });

  it('keeps existing seed-only links and emits versioned links for new worlds', () => {
    expect(worldSettingsFromSearch('?seed=334458').generatorVersion).toBe(LEGACY_GENERATOR_VERSION);
    expect(worldSettingsFromSearch('?seed=334458').preset).toBe('sakura');
    expect(worldSettingsFromSearch('').preset).toBe('city');
    const city = worldSettingsFromSearch('?gen=3&seed=334458&preset=archipelago&world=ephemeral');
    expect(worldSettingsFromSearch('').generatorVersion).toBe(GENERATOR_VERSION);
    expect(city).toMatchObject({ generatorVersion: 3, mode: 'ephemeral', preset: 'city' });
    const share = new URL(buildWorldShareUrl('https://example.com/Skimmer-Scraper/', city));
    expect(share.searchParams.has('preset')).toBe(false);
    expect(worldSettingsFromSearch(share.search)).toEqual(city);
  });
});
