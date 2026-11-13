import {
  approach,
  clamp,
  cloneVec3,
  forwardFromAttitude,
  type Attitude,
  type Vec3,
} from '../core/math';

export interface FlightInput {
  /** -1 nose down, +1 nose up. */
  pitch: number;
  /** -1 roll right, +1 roll left. */
  roll: number;
  /** -1 yaw right, +1 yaw left. */
  yaw: number;
  boost: boolean;
}

export interface FlightState {
  position: Vec3;
  velocity: Vec3;
  speed: number;
  attitude: Attitude;
  control: FlightInput;
  throttle: number;
  boosting: boolean;
  elapsed: number;
}

export interface SpawnState {
  position: Vec3;
  yaw: number;
  pitch?: number;
  speed?: number;
}

export const FLIGHT = Object.freeze({
  fixedDt: 1 / 120,
  cruiseSpeed: 66,
  boostSpeed: 102,
  minSpeed: 34,
  maxSpeed: 116,
  pitchRate: 1.18,
  rollRate: 2.55,
  yawRate: 0.56,
  bankTurnRate: 1.02,
  pitchLimit: 1.18,
  rollLimit: 1.36,
  controlAttack: 7.5,
  controlRelease: 5.2,
  autoLevel: 1.55,
  speedResponse: 1.35,
  gravityAlongNose: 6.8,
});

export const NEUTRAL_INPUT: FlightInput = Object.freeze({
  pitch: 0,
  roll: 0,
  yaw: 0,
  boost: false,
});

const sanitizeAxis = (value: number): number => clamp(value, -1, 1);

const normalizeInput = (input: FlightInput): FlightInput => ({
  pitch: sanitizeAxis(input.pitch),
  roll: sanitizeAxis(input.roll),
  yaw: sanitizeAxis(input.yaw),
  boost: input.boost,
});

export const createFlightState = (spawn: SpawnState): FlightState => {
  const attitude: Attitude = {
    pitch: spawn.pitch ?? 0,
    roll: 0,
    yaw: spawn.yaw,
  };
  const speed = spawn.speed ?? FLIGHT.cruiseSpeed;
  const forward = forwardFromAttitude(attitude);

  return {
    position: cloneVec3(spawn.position),
    velocity: {
      x: forward.x * speed,
      y: forward.y * speed,
      z: forward.z * speed,
    },
    speed,
    attitude,
    control: { ...NEUTRAL_INPUT },
    throttle: 0.68,
    boosting: false,
    elapsed: 0,
  };
};

/**
 * Pure, fixed-step arcade flight integration. Velocity is aligned to the nose; banking
 * creates the turn, while gravity along the nose bleeds/returns speed in climbs and dives.
 */
export const stepFlight = (
  state: FlightState,
  rawInput: FlightInput,
  dt: number,
): FlightState => {
  if (!(dt > 0)) return state;

  const input = normalizeInput(rawInput);
  const controlRate = (current: number, target: number): number =>
    approach(current, target, (target === 0 ? FLIGHT.controlRelease : FLIGHT.controlAttack) * dt);

  const control: FlightInput = {
    pitch: controlRate(state.control.pitch, input.pitch),
    roll: controlRate(state.control.roll, input.roll),
    yaw: controlRate(state.control.yaw, input.yaw),
    boost: input.boost,
  };

  let roll = state.attitude.roll + control.roll * FLIGHT.rollRate * dt;
  if (Math.abs(input.roll) < 0.01) {
    roll = approach(roll, 0, FLIGHT.autoLevel * dt * (0.65 + Math.abs(roll)));
  }
  roll = clamp(roll, -FLIGHT.rollLimit, FLIGHT.rollLimit);

  let pitch = state.attitude.pitch + control.pitch * FLIGHT.pitchRate * dt;
  pitch = clamp(pitch, -FLIGHT.pitchLimit, FLIGHT.pitchLimit);

  const speedRatio = state.speed / FLIGHT.cruiseSpeed;
  const bankTurn = Math.sin(roll) * FLIGHT.bankTurnRate * clamp(speedRatio, 0.45, 1.35);
  const yaw = state.attitude.yaw + (control.yaw * FLIGHT.yawRate + bankTurn) * dt;
  const attitude: Attitude = { pitch, roll, yaw };
  const forward = forwardFromAttitude(attitude);

  const targetSpeed = (input.boost ? FLIGHT.boostSpeed : FLIGHT.cruiseSpeed) -
    forward.y * FLIGHT.gravityAlongNose;
  const speed = clamp(
    state.speed + (targetSpeed - state.speed) * (1 - Math.exp(-FLIGHT.speedResponse * dt)),
    FLIGHT.minSpeed,
    FLIGHT.maxSpeed,
  );

  const throttleTarget = input.boost ? 1 : 0.68;
  const throttle = approach(state.throttle, throttleTarget, 1.5 * dt);

  return {
    position: {
      x: state.position.x + forward.x * speed * dt,
      y: state.position.y + forward.y * speed * dt,
      z: state.position.z + forward.z * speed * dt,
    },
    velocity: {
      x: forward.x * speed,
      y: forward.y * speed,
      z: forward.z * speed,
    },
    speed,
    attitude,
    control,
    throttle,
    boosting: input.boost,
    elapsed: state.elapsed + dt,
  };
};
