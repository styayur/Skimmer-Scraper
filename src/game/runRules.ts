export const SURFACE_RANGE = 32;
export const GRACE_SECONDS = 5;
// One gameplay envelope for every aircraft keeps imported models comparable.
export const COLLISION_RADIUS = 3.2;

export type RunStatus = 'running' | 'failed';
export type FailureReason = 'impact' | 'grace-expired' | null;

export interface RunRulesState {
  elapsed: number;
  grace: number;
  locked: boolean;
  status: RunStatus;
  failureReason: FailureReason;
  distance: number | null;
}

export interface SurfaceSample {
  /** Exact distance to the nearest solid surface, or null when nothing is within query range. */
  distance: number | null;
}

export const createRunRules = (): RunRulesState => ({
  elapsed: 0,
  grace: GRACE_SECONDS,
  locked: true,
  status: 'running',
  failureReason: null,
  distance: null,
});

export const updateRunRules = (
  state: RunRulesState,
  surface: SurfaceSample,
  dt: number,
): RunRulesState => {
  if (state.status === 'failed' || !(dt > 0)) return state;

  const distance = surface.distance !== null && Number.isFinite(surface.distance)
    ? Math.max(0, surface.distance)
    : null;

  if (distance !== null && distance <= COLLISION_RADIUS) {
    return {
      elapsed: state.elapsed + dt,
      grace: 0,
      locked: true,
      status: 'failed',
      failureReason: 'impact',
      distance,
    };
  }

  const locked = distance !== null && distance <= SURFACE_RANGE;
  const grace = locked ? GRACE_SECONDS : Math.max(0, state.grace - dt);
  if (!locked && grace <= 0) {
    return {
      elapsed: state.elapsed + dt,
      grace: 0,
      locked: false,
      status: 'failed',
      failureReason: 'grace-expired',
      distance,
    };
  }

  return {
    elapsed: state.elapsed + dt,
    grace,
    locked,
    status: 'running',
    failureReason: null,
    distance,
  };
};
