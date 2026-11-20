import { describe, expect, it } from 'vitest';
import { normalizeRules } from '../../src/game/ruleConfig';
import { createRunRules, updateRunRules } from '../../src/game/runRules';
import { bestStorageKey, defaultScoreContext } from '../../src/game/storage';

describe('v0.3 rule configurations', () => {
  it('honors every selectable tenth-second boundary at120Hz', () => {
    for (let tenth = 10; tenth <= 150; tenth++) {
      const graceSeconds = tenth / 10;
      let state = createRunRules({ graceSeconds });
      const frames = Math.round(graceSeconds * 120);
      for (let frame = 0; frame < frames - 1; frame++) state = updateRunRules(state, { distance: null }, 1 / 120);
      expect(state.status, `before${graceSeconds}s`).toBe('running');
      expect(updateRunRules(state, { distance: null }, 1 / 120).status, `at${graceSeconds}s`).toBe('failed');
    }
  });
  it('clamps untrusted settings and keeps standard defaults', () => {
    expect(normalizeRules().graceSeconds).toBe(5);
    expect(normalizeRules({ graceSeconds: NaN }).graceSeconds).toBe(5);
    expect(normalizeRules({ graceSeconds: 0 }).graceSeconds).toBe(1);
    expect(normalizeRules({ graceSeconds: 100 }).graceSeconds).toBe(15);
  });
  it.each([1, 1.1, 5, 7.3, 15])('expires exactly at %s seconds across fixed frames', (graceSeconds) => {
    for (const fps of [30, 60, 120, 144]) {
      let state = createRunRules({ graceSeconds });
      for (let frame = 0; frame < Math.ceil(graceSeconds * fps); frame++) {
        state = updateRunRules(state, { distance: null }, 1 / fps);
      }
      expect(state.status).toBe('failed');
      expect(state.elapsed).toBeCloseTo(graceSeconds, 1);
    }
  });
  it('keeps free flight alive and restores selected grace on contact', () => {
    const free = createRunRules({ mode: 'free', graceSeconds: 12 });
    expect(updateRunRules(free, { distance: null }, 100).status).toBe('running');
    expect(updateRunRules(free, { distance: 1 }, 1).status).toBe('running');
    const away = updateRunRules(createRunRules({ graceSeconds: 12 }), { distance: null }, 3);
    expect(updateRunRules(away, { distance: 20 }, 1).grace).toBe(12);
  });
  it('preserves legacy standard score keys and separates custom/assisted/free', () => {
    const key = bestStorageKey(defaultScoreContext);
    expect(bestStorageKey({ ...defaultScoreContext, rules: normalizeRules() })).toBe(key);
    const keys = [normalizeRules({ graceSeconds: 6 }), normalizeRules({ assisted: true }), normalizeRules({ mode: 'free' })]
      .map(rules => bestStorageKey({ ...defaultScoreContext, rules }));
    expect(new Set([key, ...keys]).size).toBe(4);
  });
});
