import { describe, expect, it } from 'vitest';
import { EXPERIENCE_CONFIG } from '../../src/config/experience';
import { targetFovForMode } from '../../src/render/cameraRig';

describe('camera FOV configuration', () => {
  it('keeps chase and cockpit FOV inside independent bounds', () => {
    for (const mode of ['chase', 'cockpit'] as const) {
      const settings = EXPERIENCE_CONFIG.camera[mode];
      const low = targetFovForMode(mode, 0, false);
      const high = targetFovForMode(mode, 200, true);
      expect(low).toBeGreaterThanOrEqual(settings.minFov);
      expect(high).toBeLessThanOrEqual(settings.maxFov);
      expect(high).toBeGreaterThan(low);
    }
  });

  it('smoothly varies with speed and boost without unbounded growth', () => {
    const cruise = targetFovForMode('chase', 66, false);
    const fast = targetFovForMode('chase', 105, false);
    const boost = targetFovForMode('chase', 105, true);
    expect(fast).toBeGreaterThan(cruise);
    expect(boost).toBeGreaterThan(fast);
    expect(boost - cruise).toBeLessThanOrEqual(15);
  });

  it('reduces dynamic FOV in comfort mode while retaining speed response', () => {
    const standard = targetFovForMode('cockpit', 110, true, false);
    const comfort = targetFovForMode('cockpit', 110, true, true);
    const comfortCruise = targetFovForMode('cockpit', 66, false, true);
    expect(comfort).toBeLessThan(standard);
    expect(comfort).toBeGreaterThan(comfortCruise);
  });
});
