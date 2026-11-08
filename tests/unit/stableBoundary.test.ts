import { describe, expect, it } from 'vitest';
import { bridgeLineAt, stableBoundaryProfile } from '../../src/world/stableBoundary';
import { CHUNK_SIZE, resolveWorldSettings } from '../../src/world/worldConfig';

describe('stable boundary data', () => {
  it('repeats terrain and bridge definitions for the same seed and coordinate', () => {
    const settings = resolveWorldSettings({ seed: 'boundary-repeat', preset: 'archipelago' });
    const first = stableBoundaryProfile(settings, 3, -2);
    const second = stableBoundaryProfile(settings, 3, -2);
    expect(second).toEqual(first);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('keeps shared terrain edges exact between neighbouring chunks', () => {
    const settings = resolveWorldSettings({ seed: 'boundary-edge', preset: 'archipelago' });
    const west = stableBoundaryProfile(settings, 0, 0);
    const east = stableBoundaryProfile(settings, 1, 0);
    const westEdge = new Map(
      west.terrain
        .filter((sample) => sample.x === CHUNK_SIZE)
        .map((sample) => [sample.z, sample.height]),
    );
    const eastEdge = new Map(
      east.terrain
        .filter((sample) => sample.x === CHUNK_SIZE)
        .map((sample) => [sample.z, sample.height]),
    );
    expect(westEdge.size).toBeGreaterThanOrEqual(9);
    for (const [z, height] of westEdge) expect(eastEdge.get(z)).toBeCloseTo(height, 10);
  });

  it('uses one revision-free bridge definition on both sides of a chunk border', () => {
    const settings = resolveWorldSettings({ seed: 'boundary-bridge', preset: 'neon' });
    const west = stableBoundaryProfile(settings, 0, 0);
    const east = stableBoundaryProfile(settings, 1, 0);
    const sharedWest = west.bridges.filter((line) => line.axis === 'x');
    const sharedEast = east.bridges.filter((line) => line.axis === 'x');
    expect(sharedWest.length).toBeGreaterThan(0);
    for (const line of sharedWest) {
      const opposite = sharedEast.find((candidate) => candidate.lineIndex === line.lineIndex);
      expect(opposite).toEqual(line);
      expect(bridgeLineAt(settings, 'x', line.lineIndex)).toEqual({
        enabled: line.enabled,
        height: line.height,
      });
    }
  });
});
