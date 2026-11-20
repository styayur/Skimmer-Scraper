import { normalizeRules, type RuleConfig } from './ruleConfig';
export const SURFACE_RANGE = 32;
export const GRACE_SECONDS = 5;
// One gameplay envelope for every aircraft keeps imported models comparable.
export const COLLISION_RADIUS = 3.2;

export type RunStatus = 'running' | 'failed';
export type FailureReason = 'impact' | 'grace-expired' | null;

export interface RunRulesState {
  config: RuleConfig;
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

export const createRunRules = (config: Partial<RuleConfig> = {}): RunRulesState => ({
  config: normalizeRules(config),
  elapsed: 0,
  grace: normalizeRules(config).graceSeconds,
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
  if (state.status === 'failed' || !(dt > 0) || !Number.isFinite(dt)) return state;

  const distance = surface.distance !== null && Number.isFinite(surface.distance)
    ? Math.max(0, surface.distance)
    : null;

  if (distance !== null && distance <= COLLISION_RADIUS && !state.config.shield) {
    return {
      ...state,
      elapsed: state.elapsed + dt,
      grace: 0,
      locked: true,
      status: 'failed',
      failureReason: 'impact',
      distance,
    };
  }

  const locked = distance !== null && distance <= SURFACE_RANGE;
  const remaining = state.grace - dt;
  const grace = locked || state.config.mode === 'free' ? state.config.graceSeconds : Math.max(0, remaining < 1e-9 ? 0 : remaining);
  if (!locked && grace <= 0) {
    return {
      ...state,
      elapsed: state.elapsed + dt,
      grace: 0,
      locked: false,
      status: 'failed',
      failureReason: 'grace-expired',
      distance,
    };
  }

  return {
    ...state,
    elapsed: state.elapsed + dt,
    grace,
    locked,
    status: 'running',
    failureReason: null,
    distance,
  };
};
