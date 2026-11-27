import { forwardFromAttitude, type Vec3 } from '../core/math';
import type { ControlSettings } from './controlSettings';
import { stepFlight, type FlightState } from './flightModel';
import { sampleTrajectory, type SurfaceTrajectory } from './surfaceTrajectory';

const STEP_SECONDS = 0.125;
const STEPS_PER_SAMPLE = 4;
const PREDICTION_STEPS = STEPS_PER_SAMPLE * 9;

/** A coarse lookahead using the current controls. It never advances the active simulation. */
export const streamingForecast = (state: FlightState, settings: ControlSettings,
  glide?: { trajectory?: SurfaceTrajectory; time: number }) => {
  const heading = forwardFromAttitude(state.attitude);
  const samples: Array<{ seconds: number; position: Vec3 }> = [];
  if (glide?.trajectory) {
    const plan = glide.trajectory;
    for (let i = STEPS_PER_SAMPLE; i <= PREDICTION_STEPS; i += STEPS_PER_SAMPLE) {
      const seconds = i * STEP_SECONDS, time = glide.time + seconds;
      const { position, velocity } = sampleTrajectory(plan, time);
      position.addScaledVector(velocity, Math.max(0, time - plan.duration));
      samples.push({ seconds, position });
    }
    return { heading, samples };
  }
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
