import { describe, expect, it } from 'vitest';
import {
  COLLISION_RADIUS,
  GRACE_SECONDS,
  SURFACE_RANGE,
  createRunRules,
  updateRunRules,
  type RunRulesState,
} from '../../src/game/runRules';

const runFor = (seconds: number, distance: number | null): RunRulesState => {
  let state = createRunRules();
  const dt = 1 / 120;
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps && state.status === 'running'; i += 1) {
    state = updateRunRules(state, { distance }, dt);
  }
  return state;
};

describe('run rules', () => {
  it('resets the five second grace whenever a surface is in range', () => {
    const state = runFor(3, SURFACE_RANGE);
    expect(state.locked).toBe(true);
    expect(state.grace).toBe(GRACE_SECONDS);
    expect(state.status).toBe('running');
  });

  it('fails after five continuous seconds away from all surfaces', () => {
    let state = createRunRules();
    for (let i = 0; i < 599; i += 1) {
      state = updateRunRules(state, { distance: null }, 1 / 120);
    }
    expect(state.status).toBe('running');
    state = updateRunRules(state, { distance: null }, 1 / 120);
    expect(state.status).toBe('failed');
    expect(state.failureReason).toBe('grace-expired');
    expect(state.grace).toBe(0);
  });

  it('replenishes grace after briefly leaving range', () => {
    let state = runFor(2, null);
    expect(state.grace).toBeGreaterThan(2.9);
    state = updateRunRules(state, { distance: SURFACE_RANGE - 1 }, 1 / 120);
    expect(state.grace).toBe(GRACE_SECONDS);
    expect(state.locked).toBe(true);
  });

  it('fails immediately on surface impact', () => {
    const state = updateRunRules(createRunRules(), { distance: COLLISION_RADIUS }, 1 / 120);
    expect(state.status).toBe('failed');
    expect(state.failureReason).toBe('impact');
  });

  it('keeps elapsed time and does not mutate failed state', () => {
    const failed = updateRunRules(createRunRules(), { distance: 0 }, 1 / 120);
    const next = updateRunRules(failed, { distance: SURFACE_RANGE }, 1);
    expect(next).toBe(failed);
    expect(next.elapsed).toBeCloseTo(1 / 120);
  });
});
