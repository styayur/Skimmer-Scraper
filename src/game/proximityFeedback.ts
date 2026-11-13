import { EXPERIENCE_CONFIG } from '../config/experience';
import { damp } from '../core/math';

export type ProximityZone = 'detached' | 'near' | 'strong' | 'extreme';

export interface ProximityFeedbackState {
  intensity: number;
  visualIntensity: number;
  zone: ProximityZone;
}

export interface ProximityFeedbackSample {
  intensity: number;
  zone: ProximityZone;
}

const smoothstep = (value: number): number => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};

const curveIntensity = (distance: number): number => {
  const anchors = EXPERIENCE_CONFIG.proximity.anchors;
  if (!(distance > 0)) return 1;
  if (distance >= anchors[0]!.distance) return 0;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const upper = anchors[index]!;
    const lower = anchors[index + 1]!;
    if (distance <= upper.distance && distance >= lower.distance) {
      const t = (upper.distance - distance) / (upper.distance - lower.distance);
      return upper.intensity + (lower.intensity - upper.intensity) * smoothstep(t);
    }
  }
  return 1;
};

const zoneForDistance = (distance: number | null): ProximityZone => {
  if (distance === null || distance > EXPERIENCE_CONFIG.proximity.detachedDistance) return 'detached';
  if (distance <= EXPERIENCE_CONFIG.proximity.extremeDistance) return 'extreme';
  if (distance <= EXPERIENCE_CONFIG.proximity.strongDistance) return 'strong';
  return 'near';
};

export const sampleProximityFeedback = (distance: number | null): ProximityFeedbackSample => {
  if (distance === null || !Number.isFinite(distance)) return { intensity: 0, zone: 'detached' };
  return {
    intensity: curveIntensity(Math.max(0, distance)),
    zone: zoneForDistance(distance),
  };
};

export const createProximityFeedback = (): ProximityFeedbackState => ({
  intensity: 0,
  visualIntensity: 0,
  zone: 'detached',
});

export const updateProximityFeedback = (
  state: ProximityFeedbackState,
  distance: number | null,
  dt: number,
  visualScale = 1,
): ProximityFeedbackState => {
  const sample = sampleProximityFeedback(distance);
  const lambda = sample.intensity > state.intensity
    ? EXPERIENCE_CONFIG.proximity.riseLambda
    : EXPERIENCE_CONFIG.proximity.fallLambda;
  const intensity = damp(state.intensity, sample.intensity, lambda, Math.max(0, dt));
  return {
    intensity,
    visualIntensity: intensity * Math.max(0, Math.min(1, visualScale)),
    zone: sample.zone,
  };
};
