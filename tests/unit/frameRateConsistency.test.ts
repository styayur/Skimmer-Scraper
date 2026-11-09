import { describe, expect, it } from 'vitest';
import { FixedStepRunner } from '../../src/core/fixedStep';
import { FLIGHT, createFlightState, stepFlight, type FlightState } from '../../src/flight/flightModel';
import { createRunRules, updateRunRules, type RunRulesState } from '../../src/game/runRules';

interface SimulatedRun {
  fps: number;
  flight: FlightState;
  rules: RunRulesState;
  steps: number;
}

const simulate = (
  fps: number,
  seconds: number,
  distanceAt: (elapsed: number) => number | null,
): SimulatedRun => {
  const runner = new FixedStepRunner(FLIGHT.fixedDt, 32);
  let flight = createFlightState({
    position: { x: 0, y: 1_000, z: 0 },
    yaw: 0.2,
    pitch: 0,
    speed: 66,
  });
  let rules = createRunRules();
  let steps = 0;
  const frameCount = Math.round(seconds * fps);
  for (let frame = 0; frame < frameCount; frame += 1) {
    runner.advance(1 / fps, (dt) => {
      flight = stepFlight(flight, {
        pitch: 0.14,
        roll: -0.22,
        yaw: 0.06,
        boost: flight.elapsed < 2.4,
      }, dt);
      rules = updateRunRules(rules, { distance: distanceAt(flight.elapsed) }, dt);
      steps += 1;
      return rules.status === 'running';
    });
    if (rules.status === 'failed') break;
  }
  return { fps, flight, rules, steps };
};

const expectEquivalent = (runs: SimulatedRun[]): void => {
  const baseline = runs[0]!;
  for (const run of runs.slice(1)) {
    expect(run.steps).toBe(baseline.steps);
    expect(run.flight.elapsed).toBeCloseTo(baseline.flight.elapsed, 9);
    expect(run.flight.position.x).toBeCloseTo(baseline.flight.position.x, 5);
    expect(run.flight.position.y).toBeCloseTo(baseline.flight.position.y, 5);
    expect(run.flight.position.z).toBeCloseTo(baseline.flight.position.z, 5);
    expect(run.flight.attitude.pitch).toBeCloseTo(baseline.flight.attitude.pitch, 9);
    expect(run.flight.attitude.roll).toBeCloseTo(baseline.flight.attitude.roll, 9);
    expect(run.flight.attitude.yaw).toBeCloseTo(baseline.flight.attitude.yaw, 9);
    expect(run.rules).toEqual(baseline.rules);
  }
};

describe('frame-rate independent rules', () => {
  it('matches flight and grace expiry at 30, 60 and 144 FPS', () => {
    const runs = [30, 60, 144].map((fps) => simulate(fps, 5.2, () => 60));
    for (const run of runs) {
      expect(run.rules.status).toBe('failed');
      expect(run.rules.failureReason).toBe('grace-expired');
      expect(run.rules.elapsed).toBeCloseTo(5, 9);
    }
    expectEquivalent(runs);
  });

  it('matches surface lock and impact outcomes across display cadences', () => {
    const lockedRuns = [30, 60, 144].map((fps) => simulate(fps, 4, () => 20));
    for (const run of lockedRuns) {
      expect(run.rules.status).toBe('running');
      expect(run.rules.locked).toBe(true);
      expect(run.rules.grace).toBe(5);
    }
    expectEquivalent(lockedRuns);

    const impactRuns = [30, 60, 144].map((fps) => simulate(fps, 0.1, () => 3.1));
    for (const run of impactRuns) {
      expect(run.rules.status).toBe('failed');
      expect(run.rules.failureReason).toBe('impact');
      expect(run.rules.elapsed).toBeCloseTo(FLIGHT.fixedDt, 9);
    }
    expectEquivalent(impactRuns);
  });
});
