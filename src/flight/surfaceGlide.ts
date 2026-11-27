import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, type Vec3 } from '../core/math';
import type { SurfaceQuery } from '../world/worldTypes';
import type { FlightState } from './flightModel';
import { clearChord, glideTuning, planRedirect, planTransfer, sampleTrajectory, supported,
  type GlideContext, type SurfaceTrajectory } from './surfaceTrajectory';

type GlidePhase = 'FLIGHT' | 'ARMED' | 'REDIRECT' | 'ATTACHING' | 'GLIDING' | 'TRANSFER' | 'DETACHING' | 'RECOVERY';
export interface GlideState {
  phase: GlidePhase;
  time: number;
  normal?: Vec3;
  surfaceId?: string;
  geometryId?: string;
  contactPoint?: Vec3;
  nextPlan?: number;
  trajectory?: SurfaceTrajectory;
}

export const freeGlide = (): GlideState => ({ phase: 'FLIGHT', time: 0 });
export const toggleGlide = (state: GlideState): GlideState => {
  if (state.phase === 'ARMED') return freeGlide();
  if (state.phase === 'DETACHING' || state.phase === 'RECOVERY') return state;
  if (state.phase !== 'FLIGHT') return { phase: 'DETACHING', time: 0, normal: state.normal };
  return { phase: 'ARMED', time: 0 };
};

export const needsGlideContact = (state: GlideState) =>
  state.phase !== 'FLIGHT' && state.phase !== 'DETACHING' && state.phase !== 'RECOVERY';

const vector = (v: Vec3) => new Vector3(v.x, v.y, v.z);
const clearance = glideTuning.clearance;
export const glideRange = 11;

function releaseSurface(state: GlideState, previous: FlightState, free: FlightState, dt: number, ctx?: GlideContext) {
  const time = state.time + dt;
  const last = previous.attitude, next = free.attitude;
  const angles = new Euler(last.pitch, last.yaw, last.roll, 'YXZ');
  const current = new Quaternion().setFromEuler(angles);
  const target = new Quaternion().setFromEuler(new Euler(next.pitch, next.yaw, next.roll, 'YXZ'));
  // At vertical, free flight's pitch limit can tip the nose into the wall.
  // Select the outward solution of the same pitch change if its step is clear.
  if (ctx && state.phase === 'DETACHING' && state.normal) {
    const normal = vector(state.normal);
    const forward = new Vector3(0, 0, -1).applyQuaternion(target);
    if (forward.dot(normal) < 0) {
      const outward = forward.clone().reflect(normal);
      const adjusted = target.clone().premultiply(new Quaternion().setFromUnitVectors(forward, outward));
      const facing = current.clone().rotateTowards(adjusted, 3.1 * dt);
      const v = vector(previous.velocity);
      const delta = new Vector3(0, 0, -free.speed).applyQuaternion(facing).sub(v);
      const end = vector(previous.position).addScaledVector(v.add(delta.clampLength(0, 110 * dt)), dt);
      if (clearChord(ctx, vector(previous.position), end, 0, dt, 110)) target.copy(adjusted);
    }
  }
  current.rotateTowards(target, 3.1 * dt);
  angles.setFromQuaternion(current, 'YXZ');

  // Keep momentum inherited from a moving surface while free flight takes over.
  const velocity = vector(previous.velocity);
  const difference = new Vector3(0, 0, -free.speed).applyQuaternion(current).sub(velocity);
  const aligned = difference.length() <= 110 * dt;
  velocity.add(difference.clampLength(0, 110 * dt));
  const released = time >= 0.25 && aligned && current.angleTo(target) <= 0.01;
  return {
    state: released ? freeGlide() : { ...state, time },
    flight: { ...free, velocity, position: vector(previous.position).addScaledVector(velocity, dt),
      attitude: { pitch: angles.x, yaw: angles.y, roll: angles.z } },
  };
}

function orient(previous: FlightState, forward: Vector3, up: Vector3, dt: number) {
  const euler = new Euler(previous.attitude.pitch, previous.attitude.yaw, previous.attitude.roll, 'YXZ');
  const orientation = new Quaternion().setFromEuler(euler);
  const back = forward.clone().normalize().negate();
  up.projectOnPlane(back);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0).applyQuaternion(orientation).projectOnPlane(back);
  if (up.lengthSq() < 1e-8) up.set(1, 0, 0).applyQuaternion(orientation).projectOnPlane(back);
  up.normalize();
  const right = up.clone().cross(back).normalize();
  const target = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, back));
  orientation.rotateTowards(target, glideTuning.attitudeRate * dt);
  // Preserve small rotations as the nose crosses vertical. The default Euler
  // conversion snaps roll to zero throughout a wider near-pole band.
  const nose = new Vector3(0, 0, -1).applyQuaternion(orientation);
  const horizontal = Math.hypot(nose.x, nose.z);
  if (horizontal > 1e-9) {
    euler.set(Math.atan2(nose.y, horizontal), Math.atan2(-nose.x, -nose.z),
      Math.atan2(new Vector3(1, 0, 0).applyQuaternion(orientation).y,
        new Vector3(0, 1, 0).applyQuaternion(orientation).y), 'YXZ');
  } else euler.setFromQuaternion(orientation, 'YXZ');
  return { attitude: { pitch: euler.x, yaw: euler.y, roll: euler.z }, error: orientation.angleTo(target) };
}

function followPlan(state: GlideState, previous: FlightState, free: FlightState, dt: number, ctx: GlideContext) {
  const plan = state.trajectory!;
  const time = state.time + dt;
  const sample = sampleTrajectory(plan, time);
  if (time > plan.duration) sample.position.addScaledVector(sample.velocity, time - plan.duration);
  const expected = sampleTrajectory(plan, state.time);
  if (expected.position.distanceToSquared(previous.position) > 1e-6 ||
      expected.velocity.distanceToSquared(previous.velocity) > 1e-6 || !supported(plan, state.time, ctx) ||
      !clearChord(ctx, vector(previous.position), sample.position, 0, dt, plan.acceleration)) {
    return releaseSurface({ phase: 'RECOVERY', time: 0 }, previous, free, dt);
  }
  const tangent = sample.velocity.clone().sub(plan.surfaceVelocity);
  const { attitude } = orient(previous, tangent, vector(plan.normal), dt);
  const next: GlideState = time < plan.duration ? { ...state, time } :
    { phase: state.phase === 'TRANSFER' ? 'GLIDING' : 'ATTACHING', time: 0,
      normal: plan.normal, surfaceId: plan.surfaceId, geometryId: plan.geometryId };
  return { state: next, flight: { ...free, ...sample, speed: tangent.length(), attitude } };
}

/** Compare applied motion before shield resolution, including a turn cancelled on its first tick. */
export function glideChangedMotion(free: FlightState, candidate: FlightState) {
  if (candidate === free) return false;
  return vector(candidate.velocity).distanceToSquared(free.velocity) > 1e-14 ||
    vector(candidate.position).distanceToSquared(free.position) > 1e-14 ||
    Math.abs(candidate.attitude.pitch - free.attitude.pitch) + Math.abs(candidate.attitude.yaw - free.attitude.yaw)
      + Math.abs(candidate.attitude.roll - free.attitude.roll) > 1e-7;
}

/** Resolve motion against a pilot-facing triangle frame in absolute world space. */
export function stepGlide(state: GlideState, previous: FlightState, free: FlightState,
  hit: SurfaceQuery | null, dt: number, ctx?: GlideContext): { state: GlideState; flight: FlightState } {
  if (state.phase === 'FLIGHT') return { state, flight: free };
  if (!needsGlideContact(state)) return releaseSurface(state, previous, free, dt, ctx);
  if (state.trajectory && ctx) return followPlan(state, previous, free, dt, ctx);
  const mayPlan = ctx && previous.elapsed + 1e-8 >= (state.nextPlan ?? 0);
  const nextPlan = mayPlan ? previous.elapsed + 1 / glideTuning.planningHz : state.nextPlan;
  const loseContact = () => {
    if (state.phase !== 'ARMED') return releaseSurface({ phase: 'RECOVERY', time: 0 }, previous, free, dt);
    const trajectory = mayPlan && planRedirect(previous, ctx);
    if (trajectory) return followPlan({ phase: 'REDIRECT', time: 0, trajectory }, previous, free, dt, ctx);
    return { state: { ...state, nextPlan, time: state.time + dt }, flight: free };
  };
  if (!hit?.contact || hit.distance > glideRange || hit.distance < 3.3) return loseContact();

  const normal = vector(hit.contact.normal).normalize();
  const offset = vector(previous.position).sub(vector(hit.point));
  const surfaceVelocity = vector(hit.contact.velocity);
  const relative = vector(previous.velocity).sub(surfaceVelocity);
  const tangent = relative.clone().projectOnPlane(normal);
  const tangentSpeed = tangent.length();
  const normalSpeed = relative.dot(normal);
  const stoppingDistance = Math.min(0, normalSpeed) ** 2 / (2 * 110);
  const brokenSeam = state.contactPoint && vector(hit.point).distanceTo(
    vector(state.contactPoint).addScaledVector(surfaceVelocity, dt)) > tangentSpeed * dt + 1.1;
  // Reject open edges and discontinuous normals. Traversable seams keep the same
  // tangent plane even when the adjacent triangle belongs to another chunk.
  if (!(normal.lengthSq() > 0.99) || !Number.isFinite(tangentSpeed + normalSpeed + hit.distance) ||
    offset.dot(normal) < 0.88 * hit.distance || tangentSpeed < 0.48 * free.speed ||
    stoppingDistance > hit.distance - 3.3 || brokenSeam ||
    (state.normal && vector(state.normal).dot(normal) < 0.84) ||
    (state.surfaceId === hit.surfaceId && state.geometryId !== hit.contact.geometryId)) {
    return loseContact();
  }

  if (mayPlan && state.phase === 'GLIDING') {
    const trajectory = planTransfer(previous, hit, ctx);
    if (trajectory) return followPlan({ phase: 'TRANSFER', time: 0, trajectory }, previous, free, dt, ctx);
  }

  const turn = clamp(free.control.roll + free.control.yaw, -1, 1) * 1.25 * dt;
  tangent.normalize().applyAxisAngle(normal, turn);
  const desiredDistance = clearance + 1.4 * free.control.pitch;
  const correction = clamp((desiredDistance - offset.dot(normal)) * 3.5, -9, 9);
  const correctedSpeed = normalSpeed + clamp(correction - normalSpeed, -110 * dt, 110 * dt);
  const speed = tangentSpeed + clamp(free.speed - tangentSpeed, -55 * dt, 55 * dt);
  const velocity = tangent.clone().multiplyScalar(speed).addScaledVector(normal, correctedSpeed).add(surfaceVelocity);
  velocity.sub(previous.velocity).clampLength(0, 230 * dt).add(previous.velocity);

  const position = vector(previous.position).addScaledVector(velocity, dt);
  if (ctx && !clearChord(ctx, vector(previous.position), position, 0, dt, 230)) return loseContact();
  const { attitude, error } = orient(previous, tangent, normal.clone(), dt);
  const settled = Math.abs(offset.dot(normal) - desiredDistance) < 1 && error < 0.14;
  const phase = state.phase === 'GLIDING' || settled ? 'GLIDING' : 'ATTACHING';
  return {
    state: { phase, time: state.time + dt, nextPlan, normal, surfaceId: hit.surfaceId, geometryId: hit.contact.geometryId,
      contactPoint: hit.point },
    flight: { ...free, position, velocity, attitude },
  };
}
