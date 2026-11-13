import { describe, expect, it } from 'vitest';
import {
  createProximityFeedback,
  sampleProximityFeedback,
  updateProximityFeedback,
} from '../../src/game/proximityFeedback';

describe('proximity feedback mapping', () => {
  it('maps distance bands to continuous zones', () => {
    expect(sampleProximityFeedback(null)).toEqual({ intensity: 0, zone: 'detached' });
    expect(sampleProximityFeedback(33).zone).toBe('detached');
    expect(sampleProximityFeedback(32).zone).toBe('near');
    expect(sampleProximityFeedback(12).zone).toBe('strong');
    expect(sampleProximityFeedback(5).zone).toBe('extreme');
    expect(sampleProximityFeedback(3.2).intensity).toBeCloseTo(1, 5);
  });

  it('is monotonic as the aircraft approaches a surface', () => {
    const distances = [32, 24, 18, 12, 8, 5, 4, 3.2];
    const values = distances.map((distance) => sampleProximityFeedback(distance).intensity);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]!).toBeGreaterThanOrEqual(values[index - 1]!);
    }
  });

  it('smooths rising and falling feedback and honors reduced visual scale', () => {
    let state = createProximityFeedback();
    for (let index = 0; index < 30; index += 1) {
      state = updateProximityFeedback(state, 4, 1 / 120, 0.3);
    }
    expect(state.intensity).toBeGreaterThan(0.5);
    expect(state.visualIntensity).toBeCloseTo(state.intensity * 0.3, 5);
    const peak = state.intensity;
    for (let index = 0; index < 15; index += 1) {
      state = updateProximityFeedback(state, null, 1 / 120, 0.3);
    }
    expect(state.intensity).toBeLessThan(peak);
  });
});
