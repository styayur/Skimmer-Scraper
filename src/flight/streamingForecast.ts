import { forwardFromAttitude, type Vec3 } from '../core/math';
import type { ControlSettings } from './controlSettings';
import { stepFlight, type FlightState } from './flightModel';

const STEP_SECONDS = 0.125;
const STEPS_PER_SAMPLE = 4;
const PREDICTION_STEPS = STEPS_PER_SAMPLE * 9;

/** A coarse lookahead using the current controls. It never advances the active simulation. */
export const streamingForecast = (state: FlightState, settings: ControlSettings) => {
  const heading = forwardFromAttitude(state.attitude);
  const samples: Array<{ seconds: number; position: Vec3 }> = [];
  let sample = state;
  for (let tick = 1; tick <= PREDICTION_STEPS; tick++) {
    const next = stepFlight(sample, state.control, STEP_SECONDS, settings);
    const position = {
      x: sample.position.x + (sample.velocity.x + next.velocity.x) * (STEP_SECONDS / 2),
      y: sample.position.y + (sample.velocity.y + next.velocity.y) * (STEP_SECONDS / 2),
      z: sample.position.z + (sample.velocity.z + next.velocity.z) * (STEP_SECONDS / 2),
    };
    if (tick % STEPS_PER_SAMPLE === 0) samples.push({ seconds: tick * STEP_SECONDS, position });
    sample = { ...next, position };
  }
  return { heading, samples };
};
