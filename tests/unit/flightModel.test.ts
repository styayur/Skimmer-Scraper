import { describe, expect, it } from 'vitest';
import {
  FLIGHT,
  NEUTRAL_INPUT,
  createFlightState,
  stepFlight,
  type FlightInput,
  type FlightState,
} from '../../src/flight/flightModel';

const spawn = {
  position: { x: 0, y: 24, z: 280 },
  yaw: 0,
  pitch: 0,
  speed: 66,
};

const run = (inputs: FlightInput[], dt = FLIGHT.fixedDt): FlightState => {
  let state = createFlightState(spawn);
  for (const input of inputs) state = stepFlight(state, input, dt);
  return state;
};

describe('flight model', () => {
  it('is deterministic for an identical fixed-step input stream', () => {
    const sequence = Array.from({ length: 720 }, (_, index) => ({
      pitch: index > 100 && index < 200 ? 0.4 : 0,
      roll: index > 260 && index < 410 ? -0.7 : 0,
      yaw: index > 460 && index < 520 ? 0.3 : 0,
      boost: index > 560,
    }));

    expect(run(sequence)).toEqual(run(sequence));
  });

  it('pitches nose up with S and down with W', () => {
    const up = run(Array.from({ length: 120 }, () => ({ ...NEUTRAL_INPUT, pitch: 1 })));
    const down = run(Array.from({ length: 120 }, () => ({ ...NEUTRAL_INPUT, pitch: -1 })));

    expect(up.velocity.y).toBeGreaterThan(0);
    expect(down.velocity.y).toBeLessThan(0);
  });

  it('turns from bank and re-levels when roll input is released', () => {
    const banked = run(
      Array.from({ length: 300 }, () => ({ ...NEUTRAL_INPUT, roll: 1 })),
    );
    let released = banked;
    for (let i = 0; i < 360; i += 1) released = stepFlight(released, NEUTRAL_INPUT, FLIGHT.fixedDt);

    expect(banked.attitude.yaw).toBeGreaterThan(0.05);
    expect(Math.abs(released.attitude.roll)).toBeLessThan(Math.abs(banked.attitude.roll));
  });

  it('accelerates under boost without exceeding the safety cap', () => {
    const start = createFlightState(spawn);
    let boosted = start;
    for (let i = 0; i < 900; i += 1) {
      boosted = stepFlight(boosted, { ...NEUTRAL_INPUT, boost: true }, FLIGHT.fixedDt);
    }

    expect(boosted.speed).toBeGreaterThan(start.speed + 15);
    expect(boosted.speed).toBeLessThanOrEqual(FLIGHT.maxSpeed);
  });

  it('does not mutate the input state', () => {
    const start = createFlightState(spawn);
    const input = { pitch: 1, roll: 1, yaw: 1, boost: true };
    const before = structuredClone(input);
    stepFlight(start, input, FLIGHT.fixedDt);
    expect(input).toEqual(before);
  });
});
