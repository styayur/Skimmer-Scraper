import { generateSeededWorld, type GenerateWorldOptions } from './seededWorld';
import type { WorldData } from './worldTypes';
import { resolveWorldSettings, type WorldPresetId } from './worldConfig';

/** Compatibility wrapper for v0.1 callers. New code should resolve WorldSettings explicitly. */
export const generateSakuraMegacity = (
  seed = 0x51a7a,
  preset: WorldPresetId = 'sakura',
  options: GenerateWorldOptions = {},
): WorldData => generateSeededWorld(
  resolveWorldSettings({ seed: String(seed), preset, mode: 'stable' }),
  options,
);
