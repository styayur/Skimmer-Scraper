import { hashNumbers } from './deterministic';
import { mulberry32 } from './rng';

export const CHUNK_SIZE = 220;
export const CITY_SHADOW_LAYER = 5;
export const LEGACY_GENERATOR_VERSION = 2;
export const DENSE_GENERATOR_VERSION = 3;
export const GENERATOR_VERSION = 4;
export const DEFAULT_WORLD_SEED = 0x51a7a;

export type WorldMode = 'stable' | 'ephemeral';
export type LegacyPresetId = 'sakura' | 'neon' | 'archipelago' | 'randomized';
export type WorldPresetId = LegacyPresetId | 'city';
export type ConcretePresetId = Exclude<LegacyPresetId, 'randomized'>;

export interface CityGenerationConfig {
  preset: WorldPresetId;
  architecture?: 'setback' | 'faceted' | 'lantern';
  landmark?: import('./architectureLibrary').TowerModel;
  buildingDensity: number;
  buildingHeightMin: number;
  buildingHeightMax: number;
  streetWidth: number;
  streetSpacing: number;
  bridgeFrequency: number;
  bridgeHeightMin: number;
  bridgeHeightMax: number;
  islandFrequency: number;
  suspendedHeightMin: number;
  suspendedHeightMax: number;
  terrainAmplitude: number;
  buildingVariation: number;
  fogDensity: number;
  farDensity: number;
}

export interface WorldSettings {
  theme?: 'dragonspine' | 'worldforge' | 'kinetic-city';
  dragonSpans?: true;
  generatedPassages?: true;
  paletteHue?: number;
  seed: number;
  seedText: string;
  preset: WorldPresetId;
  mode: WorldMode;
  generatorVersion: number;
  config: CityGenerationConfig;
}

export interface WorldPresetOption {
  id: LegacyPresetId;
  label: string;
  description: string;
}

export const supportsSkyInversion = (settings: WorldSettings): boolean => !settings.theme || settings.theme === 'kinetic-city';

export const WORLD_PRESET_OPTIONS: readonly WorldPresetOption[] = Object.freeze([
  { id: 'sakura', label: 'Sakura Dusk', description: '樱色黄昏、层叠高架与花园屋顶' },
  { id: 'neon', label: 'Neon Megacity', description: '高密度霓虹峡谷与更多空中桥梁' },
  { id: 'archipelago', label: 'Floating Archipelago', description: '起伏地面、更多浮岛与开阔飞行空间' },
  { id: 'randomized', label: 'Randomized', description: '由种子混合三套预设参数' },
]);

const PRESETS: Record<ConcretePresetId, Omit<CityGenerationConfig, 'preset'>> = {
  sakura: {
    buildingDensity: 0.38,
    buildingHeightMin: 54,
    buildingHeightMax: 190,
    streetWidth: 18,
    streetSpacing: 110,
    bridgeFrequency: 0.38,
    bridgeHeightMin: 44,
    bridgeHeightMax: 105,
    islandFrequency: 0.13,
    suspendedHeightMin: 120,
    suspendedHeightMax: 320,
    terrainAmplitude: 0,
    buildingVariation: 1,
    fogDensity: 0.00096,
    farDensity: 0.78,
  },
  neon: {
    buildingDensity: 0.58,
    buildingHeightMin: 70,
    buildingHeightMax: 245,
    streetWidth: 16,
    streetSpacing: 88,
    bridgeFrequency: 0.55,
    bridgeHeightMin: 55,
    bridgeHeightMax: 138,
    islandFrequency: 0.06,
    suspendedHeightMin: 220,
    suspendedHeightMax: 430,
    terrainAmplitude: 0,
    buildingVariation: 1.32,
    fogDensity: 0.00115,
    farDensity: 0.92,
  },
  archipelago: {
    buildingDensity: 0.25,
    buildingHeightMin: 36,
    buildingHeightMax: 145,
    streetWidth: 22,
    streetSpacing: 110,
    bridgeFrequency: 0.22,
    bridgeHeightMin: 34,
    bridgeHeightMax: 78,
    islandFrequency: 0.48,
    suspendedHeightMin: 80,
    suspendedHeightMax: 330,
    terrainAmplitude: 9,
    buildingVariation: 0.86,
    fogDensity: 0.00084,
    farDensity: 0.64,
  },
};

const DENSE_CITY: CityGenerationConfig = {
  preset: 'city',
  buildingDensity: 0.56,
  buildingHeightMin: 58,
  buildingHeightMax: 188,
  streetWidth: 24,
  streetSpacing: 110,
  bridgeFrequency: 0.62,
  bridgeHeightMin: 50,
  bridgeHeightMax: 190,
  islandFrequency: 0.32,
  suspendedHeightMin: 188,
  suspendedHeightMax: 365,
  terrainAmplitude: 0,
  buildingVariation: 1.04,
  fogDensity: 0.001,
  farDensity: 0.78,
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const hashSeedText = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const parseSeedText = (input: string | null | undefined): { seed: number; seedText: string } => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return { seed: DEFAULT_WORLD_SEED, seedText: String(DEFAULT_WORLD_SEED) };
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 16);
    if (Number.isFinite(parsed)) return { seed: parsed >>> 0, seedText: String(parsed >>> 0) };
  }
  if (/^-?\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isSafeInteger(parsed)) return { seed: parsed >>> 0, seedText: String(parsed >>> 0) };
  }
  const seeded = hashSeedText(trimmed);
  return { seed: seeded, seedText: trimmed };
};

const isPreset = (value: string | null): value is LegacyPresetId =>
  value === 'sakura' || value === 'neon' || value === 'archipelago' || value === 'randomized';

export const resolveGenerationConfig = (preset: WorldPresetId, seed: number): CityGenerationConfig => {
  if (preset === 'city') return { ...DENSE_CITY };
  if (preset !== 'randomized') return { preset, ...PRESETS[preset] };
  const random = mulberry32(hashNumbers(seed, 0x7a11d0, LEGACY_GENERATOR_VERSION));
  const ids: ConcretePresetId[] = ['sakura', 'neon', 'archipelago'];
  const baseId = ids[Math.floor(random() * ids.length)] ?? 'sakura';
  const base = PRESETS[baseId];
  return {
    preset,
    buildingDensity: clamp(base.buildingDensity + (random() - 0.5) * 0.16, 0.18, 0.72),
    buildingHeightMin: base.buildingHeightMin * (0.9 + random() * 0.2),
    buildingHeightMax: base.buildingHeightMax * (0.88 + random() * 0.3),
    streetWidth: base.streetWidth,
    streetSpacing: base.streetSpacing,
    bridgeFrequency: clamp(base.bridgeFrequency + (random() - 0.5) * 0.2, 0.08, 0.72),
    bridgeHeightMin: base.bridgeHeightMin,
    bridgeHeightMax: base.bridgeHeightMax,
    islandFrequency: clamp(base.islandFrequency + (random() - 0.5) * 0.22, 0.02, 0.64),
    suspendedHeightMin: base.suspendedHeightMin,
    suspendedHeightMax: base.suspendedHeightMax,
    terrainAmplitude: base.terrainAmplitude + (random() - 0.5) * 4,
    buildingVariation: base.buildingVariation * (0.85 + random() * 0.35),
    fogDensity: base.fogDensity * (0.9 + random() * 0.2),
    farDensity: clamp(base.farDensity + (random() - 0.5) * 0.18, 0.42, 1),
  };
};

export const resolveWorldSettings = (options: {
  seed?: string | null;
  preset?: string | null;
  mode?: string | null;
  generatorVersion?: number;
} = {}): WorldSettings => {
  const parsedSeed = parseSeedText(options.seed);
  const legacyPreset = isPreset(options.preset ?? null) ? options.preset as LegacyPresetId : null;
  const legacy = options.generatorVersion === LEGACY_GENERATOR_VERSION
    || (options.generatorVersion === undefined && legacyPreset !== null);
  const preset: WorldPresetId = legacy ? legacyPreset ?? 'sakura' : 'city';
  const mode: WorldMode = options.mode === 'ephemeral' ? 'ephemeral' : 'stable';
  return {
    ...parsedSeed,
    preset,
    mode,
    generatorVersion: legacy ? LEGACY_GENERATOR_VERSION
      : options.generatorVersion === DENSE_GENERATOR_VERSION ? DENSE_GENERATOR_VERSION : GENERATOR_VERSION,
    config: resolveGenerationConfig(preset, parsedSeed.seed),
  };
};

export const worldSettingsFromSearch = (search: string | URLSearchParams): WorldSettings => {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const explicit = params.get('gen');
  const theme = params.get('theme');
  const dragon = theme === 'dragonspine' || theme === 'ascendant' || theme === 'dragon';
  const kinetic = theme === 'kinetic-city';
  const hasLegacyFields = params.has('seed') || params.has('preset') || params.has('world');
  const generatorVersion = explicit === String(GENERATOR_VERSION) || (!explicit && !hasLegacyFields)
    ? GENERATOR_VERSION
    : explicit === String(DENSE_GENERATOR_VERSION) ? DENSE_GENERATOR_VERSION : LEGACY_GENERATOR_VERSION;
  const settings = resolveWorldSettings({
    seed: params.get('seed'),
    preset: params.get('preset'),
    mode: params.get('world'),
    generatorVersion: dragon || kinetic || theme === 'worldforge' ? GENERATOR_VERSION : generatorVersion,
  });
  if (theme === 'worldforge' || kinetic) settings.theme = theme;
  if (dragon) settings.theme = 'dragonspine';
  if (dragon && params.get('spans') === '1') settings.dragonSpans = true;
  if (!settings.theme && settings.generatorVersion === GENERATOR_VERSION && params.get('passages') === '1') {
    settings.generatedPassages = true;
  }
  return settings;
};

export const buildWorldShareUrl = (baseHref: string, settings: Pick<WorldSettings, 'theme' | 'seedText' | 'preset' | 'mode' | 'generatorVersion' | 'generatedPassages' | 'dragonSpans'>): string => {
  const url = new URL(baseHref);
  url.search = '';
  url.hash = '';
  if (settings.theme) url.searchParams.set('theme', settings.theme);
  if (settings.theme === 'dragonspine' && settings.dragonSpans) url.searchParams.set('spans', '1');
  if (settings.generatedPassages && !settings.theme && settings.generatorVersion === GENERATOR_VERSION) {
    url.searchParams.set('passages', '1');
  }
  url.searchParams.set('seed', settings.seedText);
  if (settings.generatorVersion === LEGACY_GENERATOR_VERSION) url.searchParams.set('preset', settings.preset);
  url.searchParams.set('world', settings.mode);
  url.searchParams.set('gen', String(settings.generatorVersion));
  return url.toString();
};

