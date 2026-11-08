import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, resolveWorldSettings } from '../../src/world/worldConfig';
import { terrainHeightAt } from '../../src/world/terrain';

describe('terrain continuity', () => {
  it('is flat at the safe spawn area for the default city', () => {
    const settings = resolveWorldSettings({ seed: '334458', preset: 'sakura' });
    expect(terrainHeightAt(0, 120, settings)).toBe(0);
    expect(terrainHeightAt(0, 0, settings)).toBe(0);
  });

  it('varies for archipelago but matches exactly across chunk boundaries', () => {
    const settings = resolveWorldSettings({ seed: 'islands', preset: 'archipelago' });
    const x = CHUNK_SIZE;
    for (const z of [-440, -220, 0, 220, 440]) {
      expect(terrainHeightAt(x, z, settings)).toBeCloseTo(terrainHeightAt(x - 1e-6, z, settings), 5);
    }
    expect(terrainHeightAt(350, 350, settings)).not.toBe(0);
  });

  it('depends on the stable seed, not generation order', () => {
    const a = resolveWorldSettings({ seed: 'A', preset: 'archipelago' });
    const b = resolveWorldSettings({ seed: 'B', preset: 'archipelago' });
    expect(terrainHeightAt(420, -360, a)).not.toBe(terrainHeightAt(420, -360, b));
  });
});

