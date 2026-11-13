export const EXPERIENCE_CONFIG = {
  proximity: {
    detachedDistance: 32,
    strongDistance: 12,
    extremeDistance: 5,
    anchors: [
      { distance: 32, intensity: 0 },
      { distance: 12, intensity: 0.35 },
      { distance: 5, intensity: 0.78 },
      { distance: 3.2, intensity: 1 },
    ],
    riseLambda: 8.5,
    fallLambda: 4.2,
  },
  camera: {
    transitionLambda: 7.5,
    chase: {
      minFov: 62,
      maxFov: 78,
      speedGain: 10,
      boostGain: 5,
      distance: 12.8,
      distanceSpeedGain: 2.8,
      height: 3.7,
    },
    cockpit: {
      minFov: 70,
      maxFov: 88,
      speedGain: 12,
      boostGain: 5,
      forwardOffset: 2.35,
      upOffset: 0.72,
    },
    comfortFovScale: 0.68,
    standardShake: 1,
    reducedShake: 0,
  },
  visuals: {
    standardScale: 1,
    reducedScale: 0.3,
  },
} as const;

export type VisualStimulation = 'standard' | 'reduced';
export type CameraMode = 'chase' | 'cockpit';

