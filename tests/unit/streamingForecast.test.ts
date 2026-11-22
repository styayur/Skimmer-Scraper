import { expect, it } from 'vitest';
import { DEFAULT_CONTROLS } from '../../src/flight/controlSettings';
import { createFlightState, stepFlight } from '../../src/flight/flightModel';
import { streamingForecast } from '../../src/flight/streamingForecast';

it('projects acceleration, an accelerating bank and descent without mutating flight state', () => {
  const start = createFlightState({ position: { x: 20, y: 350, z: 500 }, yaw: 0 });
  const controls = { ...DEFAULT_CONTROLS };
  const powered = stepFlight(start, { pitch: 0, roll: 0, yaw: 0, boost: true }, 1 / 120, controls);
  const straight = streamingForecast(powered, controls);
  expect(straight.samples.at(-1)!.position.z).toBeLessThan(start.position.z - 420);
  expect(straight.samples.at(-1)!.position.x).toBe(start.position.x);

  const banking = { ...powered, attitude: { yaw: 0, pitch: -0.28, roll: 0.72 } };
  const before = structuredClone(banking);
  const curved = streamingForecast(banking, controls);
  expect(curved.heading.y).toBeLessThan(0);
  expect(curved.samples[1]!.position.x).toBeLessThan(start.position.x);
  expect(curved.samples[1]!.position.y).toBeLessThan(start.position.y);
  expect(curved.samples.at(-1)!.position.z).toBeGreaterThan(straight.samples.at(-1)!.position.z);
  expect(banking).toEqual(before);
});
