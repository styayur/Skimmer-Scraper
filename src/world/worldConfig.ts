import { hashNumbers } from './deterministic';
import { mulberry32 } from './rng';

export const CHUNK_SIZE = 220;
export const GENERATOR_VERSION = 2;
export const DEFAULT_WORLD_SEED = 0x51a7a;

export type WorldMode = 'stable' | 'ephemeral';
export type WorldPresetId = 'sakura' | 'neon' | 'archipelago' | 'randomized';
export type ConcretePresetId = Exclude<WorldPresetId, 'randomized'>;

export interface CityGenerationConfig {
  preset: WorldPresetId;
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
  seed: number;
  seedText: string;
  preset: WorldPresetId;
  mode: WorldMode;
  generatorVersion: number;
  config: CityGenerationConfig;
}

export interface WorldPresetOption {
  id: WorldPresetId;
  label: string;
  description: string;
}

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

const isPreset = (value: string | null): value is WorldPresetId =>
  value === 'sakura' || value === 'neon' || value === 'archipelago' || value === 'randomized';

export const resolveGenerationConfig = (preset: WorldPresetId, seed: number): CityGenerationConfig => {
  if (preset !== 'randomized') return { preset, ...PRESETS[preset] };
  const random = mulberry32(hashNumbers(seed, 0x7a11d0, GENERATOR_VERSION));
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
} = {}): WorldSettings => {
  const parsedSeed = parseSeedText(options.seed);
  const preset = isPreset(options.preset ?? null) ? options.preset as WorldPresetId : 'sakura';
  const mode: WorldMode = options.mode === 'ephemeral' ? 'ephemeral' : 'stable';
  return {
    ...parsedSeed,
    preset,
    mode,
    generatorVersion: GENERATOR_VERSION,
    config: resolveGenerationConfig(preset, parsedSeed.seed),
  };
};

export const worldSettingsFromSearch = (search: string | URLSearchParams): WorldSettings => {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return resolveWorldSettings({
    seed: params.get('seed'),
    preset: params.get('preset'),
    mode: params.get('world'),
  });
};

export const buildWorldShareUrl = (baseHref: string, settings: Pick<WorldSettings, 'seedText' | 'preset' | 'mode'>): string => {
  const url = new URL(baseHref);
  url.search = '';
  url.hash = '';
  url.searchParams.set('seed', settings.seedText);
  url.searchParams.set('preset', settings.preset);
  url.searchParams.set('world', settings.mode);
  url.searchParams.set('gen', String(GENERATOR_VERSION));
  return url.toString();
};

