import { describe, expect, it } from 'vitest';
import { FixedStepRunner } from '../../src/core/fixedStep';

describe('fixed-step runner', () => {
  it('carries fractional frame time into subsequent frames', () => {
    const runner = new FixedStepRunner(0.01, 12);
    const first = runner.advance(0.025, () => {});
    const second = runner.advance(0.005, () => {});
    expect(first.steps).toBe(2);
    expect(first.alpha).toBeCloseTo(0.5);
    expect(second.steps).toBe(1);
  });

  it('caps catch-up work and reports dropped time', () => {
    const runner = new FixedStepRunner(0.01, 3);
    const result = runner.advance(0.2, () => {});
    expect(result.steps).toBe(3);
    expect(result.droppedSeconds).toBeGreaterThan(0.13);
  });

  it('stops stepping when the callback asks to halt', () => {
    const runner = new FixedStepRunner(0.01, 8);
    let calls = 0;
    const result = runner.advance(0.08, () => {
      calls += 1;
      return calls < 2;
    });
    expect(result.steps).toBe(1);
  });
});

