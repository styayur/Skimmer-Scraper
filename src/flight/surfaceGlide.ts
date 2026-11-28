import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, type Vec3 } from '../core/math';
import type { SurfaceQuery } from '../world/worldTypes';
import { FLIGHT, stepFlight, type FlightState } from './flightModel';
import { clearCoast, continuationContact, planSurfacePatches, transportTangent } from './surfacePatchGraph';
import { clearChord, glideTuning, planEscape, planMagnetic, planRedirect, planTransfer, sampleTrajectory, supported,
  type GlideContext, type SurfaceTrajectory } from './surfaceTrajectory';

type GlidePhase = 'FLIGHT' | 'ARMED' | 'REDIRECT' | 'ATTACHING' | 'GLIDING' | 'TRANSFER' | 'ESCAPE' | 'REACQUIRE' | 'DETACHING' | 'RECOVERY';
export interface GlideState {
  phase: GlidePhase;
  time: number;
  normal?: Vec3;
  surfaceId?: string;
  geometryId?: string;
  logicalSurfaceId?: string;
  surfaceVelocity?: Vec3;
  tangent?: Vec3;
  contactPoint?: Vec3;
  nextPlan?: number;
  deadline?: number;
  riskChecked?: boolean;
  speedLimit?: number;
  normalLead?: number;
  turnRate?: number;
  departureNormalSpeed?: number;
  awaitingPlan?: boolean;
  coast?: { distance: number; since: number; last: number };
  lostAt?: Vec3;
  trajectory?: SurfaceTrajectory;
}

export const freeGlide = (): GlideState => ({ phase: 'FLIGHT', time: 0 });
export const toggleGlide = (state: GlideState): GlideState => {
  if (state.phase === 'ARMED') return freeGlide();
  if (state.phase === 'DETACHING' || state.phase === 'RECOVERY') return state;
  if (state.phase !== 'FLIGHT') return { phase: 'DETACHING', time: 0,
    normal: state.normal, surfaceVelocity: state.surfaceVelocity };
  return { phase: 'ARMED', time: 0 };
};

export const needsGlideContact = (state: GlideState) =>
  state.phase !== 'FLIGHT' && state.phase !== 'DETACHING' && state.phase !== 'RECOVERY';

const vector = (v: Vec3) => new Vector3(v.x, v.y, v.z);
const clearance = glideTuning.clearance;
export const glideRange = 11;

const releaseAcceleration = 110, handoffSeconds = 0.25;

function advanceRelease(state: GlideState, previous: FlightState, free: FlightState, dt: number,
  ctx?: GlideContext, begin = 0) {
  const time = state.time + dt;
  const last = previous.attitude, next = free.attitude;
  const angles = new Euler(last.pitch, last.yaw, last.roll, 'YXZ');
  const current = new Quaternion().setFromEuler(angles);
  const target = new Quaternion().setFromEuler(new Euler(next.pitch, next.yaw, next.roll, 'YXZ'));
  // Preserve the tangential heading while turning outward. The default
  // reflection also protects vertical exits from free flight's pitch limit.
  if (ctx && state.normal) {
    const normal = vector(state.normal);
    const forward = new Vector3(0, 0, -1).applyQuaternion(target);
    const along = forward.dot(normal);
    const desired = state.departureNormalSpeed === undefined ? -along :
      clamp(state.departureNormalSpeed / free.speed, -1, 1);
    if (along < desired) {
      const outward = forward.clone().reflect(normal);
      if (state.departureNormalSpeed !== undefined && Math.abs(along) < 1 - 1e-10) {
        outward.copy(forward).projectOnPlane(normal).setLength(Math.sqrt(1 - desired * desired)).addScaledVector(normal, desired);
      }
      const adjusted = target.clone().premultiply(new Quaternion().setFromUnitVectors(forward, outward));
      const facing = current.clone().rotateTowards(adjusted, 3.1 * dt);
      const v = vector(previous.velocity);
      const delta = new Vector3(0, 0, -free.speed).applyQuaternion(facing).sub(v);
      const end = vector(previous.position).addScaledVector(v.add(delta.clampLength(0, releaseAcceleration * dt)), dt);
      if (clearChord(ctx, vector(previous.position), end, begin, begin + dt, releaseAcceleration)) target.copy(adjusted);
    }
  }
  current.rotateTowards(target, 3.1 * dt);
  angles.setFromQuaternion(current, 'YXZ');

  // Keep momentum inherited from a moving surface while free flight takes over.
  const velocity = vector(previous.velocity);
  const difference = new Vector3(0, 0, -free.speed).applyQuaternion(current).sub(velocity);
  const aligned = difference.length() <= releaseAcceleration * dt;
  velocity.add(difference.clampLength(0, releaseAcceleration * dt));
  const released = time >= handoffSeconds && aligned && current.angleTo(target) <= 0.01;
  return {
    state: released ? ((state.deadline ?? 0) > free.elapsed ? { phase: 'ARMED' as const, time: 0, deadline: state.deadline } : freeGlide()) : { ...state, time },
    flight: { ...free, velocity, position: vector(previous.position).addScaledVector(velocity, dt),
      attitude: { pitch: angles.x, yaw: angles.y, roll: angles.z } },
  };
}

function clearDeparture(phase: GlideState, sample: FlightState, free: FlightState, dt: number,
  ctx: GlideContext, horizon: number) {
  const input = ctx.input ?? free.control;
  for (let seconds = 0; seconds < horizon;) {
    const interval = seconds === 0 ? dt : FLIGHT.fixedDt;
    const pilot = seconds === 0 ? free : stepFlight(sample, input, interval, ctx.settings);
    const next = phase.phase === 'DETACHING' ? advanceRelease(phase, sample, pilot, interval, ctx, seconds) :
      { flight: pilot, state: phase };
    if (!clearChord(ctx, vector(sample.position), vector(next.flight.position),
      seconds, seconds + interval, releaseAcceleration)) return false;
    sample = next.flight;
    phase = next.state;
    seconds += interval;
  }
  return true;
}

function releaseSurface(state: GlideState, previous: FlightState, free: FlightState, dt: number, ctx?: GlideContext) {
  if (state.phase === 'DETACHING' && state.time === 0 && state.normal && ctx && dt > 0) {
    // At lower speed the same LB edge can occur on the descending side of a
    // fold. Check the handoff and one velocity-change time of pilot flight.
    const horizon = Math.min(1.25, handoffSeconds + previous.speed / releaseAcceleration);
    if (!clearDeparture(state, previous, free, dt, ctx, horizon)) {
      const normal = vector(state.normal);
      const entry = Math.max(normal.dot(previous.velocity), normal.dot(free.velocity),
        state.surfaceVelocity ? normal.dot(state.surfaceVelocity) : 0);
      for (const rise of [ctx.bodyRadius, clearance, 2 * clearance]) {
        const option = { ...state, departureNormalSpeed: entry + rise / horizon };
        if (clearDeparture(option, previous, free, dt, ctx, horizon)) { state = option; break; }
      }
    }
  }
  return advanceRelease(state, previous, free, dt, ctx);
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
      expected.velocity.distanceToSquared(previous.velocity) > 1e-6 || (!plan.escape && !supported(plan, state.time, ctx)) ||
      !clearChord(ctx, vector(previous.position), sample.position, 0, dt, plan.acceleration)) {
    return releaseSurface({ phase: 'RECOVERY', time: 0, normal: state.normal }, previous, free, dt, ctx);
  }
  const tangent = sample.velocity.clone();
  if (!plan.escape) tangent.sub(plan.surfaceVelocity);
  const { attitude } = orient(previous, tangent, vector(plan.normal), dt);
  const next: GlideState = time < plan.duration ? { ...state, time } :
    plan.escape ? { phase: 'RECOVERY', time: 0, deadline: state.deadline, normal: plan.normal } :
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
  const deadline = state.deadline ?? previous.elapsed + glideTuning.captureSeconds;
  if (state.phase === 'ARMED' && previous.elapsed + 1e-8 >= deadline) return { state: freeGlide(), flight: free };
  let mayPlan = !!ctx && previous.elapsed + 1e-8 >= (state.nextPlan ?? 0);
  let riskChecked = state.riskChecked;
  if (ctx && state.phase === 'ARMED' && !mayPlan) {
    const horizon = 1 / glideTuning.planningHz;
    const start = vector(previous.position);
    const end = start.clone().addScaledVector(previous.velocity, horizon);
    const imminent = !clearChord(ctx, start, end, 0, horizon, 0);
    if (!imminent) riskChecked = false;
    if (imminent && !riskChecked) {
      mayPlan = true;
      riskChecked = true;
    }
  }
  const nextPlan = mayPlan ? previous.elapsed + 1 / glideTuning.planningHz : state.nextPlan;
  if (state.phase === 'ARMED' && mayPlan && ctx) {
    const trajectory = planRedirect(previous, ctx) ?? planEscape(previous, ctx);
    if (trajectory) return followPlan({ phase: trajectory.escape ? 'ESCAPE' : 'REDIRECT', time: 0,
      deadline, trajectory }, previous, free, dt, ctx);
  }
  const loseContact = (awaitingPlan = false) => {
    if (state.phase === 'ARMED') {
      const trajectory = mayPlan && ctx && planMagnetic(previous, ctx);
      if (trajectory && ctx) return followPlan({ phase: 'REDIRECT', time: 0,
        deadline, trajectory }, previous, free, dt, ctx);
      return { state: free.elapsed + 1e-8 >= deadline ? freeGlide() :
        { ...state, deadline, riskChecked, nextPlan, time: state.time + dt }, flight: free };
    }
    if (ctx && state.normal && state.contactPoint && (state.phase === 'GLIDING' || state.phase === 'REACQUIRE')) {
      const time = state.phase === 'REACQUIRE' ? state.time + dt : dt;
      const start = vector(previous.position), end = start.clone().addScaledVector(previous.velocity, dt);
      const lostAt = state.lostAt ?? start;
      const coast = { distance: (state.coast?.distance ?? 0) + end.distanceTo(start),
        since: state.coast?.since ?? previous.elapsed, last: free.elapsed };
      if (coast.last - coast.since < glideTuning.reacquireSeconds && coast.distance < glideTuning.clearance &&
          clearChord(ctx, start, end, 0, dt, 0)) {
        return { state: { ...state, phase: 'REACQUIRE' as const, lostAt, time, awaitingPlan, nextPlan, coast },
          flight: { ...previous, elapsed: free.elapsed, position: end } };
      }
    }
    return releaseSurface({ phase: 'RECOVERY', time: 0, normal: state.normal }, previous, free, dt, ctx);
  };
  if (state.awaitingPlan && !mayPlan) return loseContact(true);
  if (ctx) hit = continuationContact(state, previous.position, hit, dt, ctx);
  if (!hit?.contact || hit.distance > glideRange || hit.distance < 3.3) return loseContact();

  const normal = vector(hit.contact.normal).normalize();
  const offset = vector(previous.position).sub(vector(hit.point));
  const surfaceVelocity = vector(hit.contact.velocity);
  const relative = vector(previous.velocity).sub(surfaceVelocity);
  const tangent = relative.clone().projectOnPlane(normal);
  const tangentSpeed = tangent.length();
  const normalSpeed = relative.dot(normal);
  const stoppingDistance = Math.min(0, normalSpeed) ** 2 / (2 * 110);
  const seamAllowance = state.phase === 'REACQUIRE' && state.lostAt
    ? vector(state.lostAt).distanceTo(previous.position) : 0;
  // At an inside fold the closest point switches between two faces before
  // reaching the edge. Their offset flight paths meet even when the face points differ.
  const foldOffset = state.normal && (state.surfaceId === hit.surfaceId && state.geometryId === hit.contact.geometryId ||
    state.logicalSurfaceId && state.logicalSurfaceId === hit.contact.logicalSurfaceId)
    ? Math.min(clearance, hit.distance) * normal.distanceTo(state.normal) : 0;
  const brokenSeam = state.contactPoint && vector(hit.point).distanceTo(
    vector(state.contactPoint).addScaledVector(surfaceVelocity, dt)) > tangentSpeed * dt + 1.1 + seamAllowance + foldOffset;
  // Reject open edges and discontinuous normals. Traversable seams keep the same
  // tangent plane even when the adjacent triangle belongs to another chunk.
  if (!(normal.lengthSq() > 0.99) || !Number.isFinite(tangentSpeed + normalSpeed + hit.distance) ||
    offset.dot(normal) < 0.88 * hit.distance || tangentSpeed < 0.48 * free.speed ||
    stoppingDistance > hit.distance - 3.3 || brokenSeam ||
    (state.surfaceVelocity && surfaceVelocity.distanceTo(state.surfaceVelocity) > 0.5) ||
    (state.normal && vector(state.normal).dot(normal) < 0.84) ||
    (state.surfaceId === hit.surfaceId && state.geometryId !== hit.contact.geometryId)) {
    return loseContact();
  }

  let speedLimit = state.speedLimit ?? Infinity, normalLead = state.normalLead ?? 0, turnRate = state.turnRate ?? 0;
  if (mayPlan && ctx) {
    const trajectory = state.phase === 'GLIDING' && planTransfer(previous, hit, ctx);
    if (trajectory) return followPlan({ phase: 'TRANSFER', time: 0, trajectory }, previous, free, dt, ctx);
    const guidance = planSurfacePatches(previous, { ...hit, contact: hit.contact }, tangent, ctx, dt);
    if (state.phase !== 'ARMED' && (guidance?.depth ?? 0) < 2 && !clearCoast(previous, ctx)) {
      return releaseSurface({ phase: 'RECOVERY', time: 0, normal }, previous, free, dt, ctx);
    }
    if (!guidance) return loseContact(true);
    ({ speedLimit, normalLead, turnRate } = guidance);
  }

  const steering = clamp(free.control.roll + free.control.yaw, -1, 1);
  if (state.tangent && state.normal) tangent.copy(transportTangent(state.tangent, state.normal, normal));
  tangent.normalize().applyAxisAngle(normal, (steering * 1.25 + (1 - Math.abs(steering)) * turnRate) * dt);
  const desiredDistance = clearance + 1.4 * free.control.pitch;
  const correction = clamp((desiredDistance - offset.dot(normal)) * 3.5 + normalLead, -9, 9);
  const maxVelocityChange = glideTuning.followingAcceleration * dt;
  const correctedSpeed = normalSpeed + clamp(correction - normalSpeed, -maxVelocityChange, maxVelocityChange);
  const speed = tangentSpeed + clamp(Math.min(free.speed, speedLimit) - tangentSpeed, -90 * dt, 55 * dt);
  const velocity = tangent.clone().multiplyScalar(speed).addScaledVector(normal, correctedSpeed).add(surfaceVelocity);
  velocity.sub(previous.velocity).clampLength(0, maxVelocityChange).add(previous.velocity);

  const position = vector(previous.position).addScaledVector(velocity, dt);
  if (ctx && !clearChord(ctx, vector(previous.position), position, 0, dt, glideTuning.followingAcceleration)) return loseContact();
  const { attitude, error } = orient(previous, tangent, normal.clone(), dt);
  const settled = Math.abs(offset.dot(normal) - desiredDistance) < 1 && error < 0.14;
  const phase = state.phase === 'GLIDING' || settled ? 'GLIDING' : 'ATTACHING';
  return {
    state: { phase, time: state.time + dt, nextPlan, normal, surfaceId: hit.surfaceId, geometryId: hit.contact.geometryId,
      contactPoint: hit.point, surfaceVelocity, logicalSurfaceId: hit.contact.logicalSurfaceId,
      tangent, speedLimit, normalLead, turnRate,
      coast: state.coast && free.elapsed - state.coast.last < 2 / glideTuning.planningHz ? state.coast : undefined },
    flight: { ...free, position, velocity, speed: velocity.clone().sub(surfaceVelocity).length(), attitude },
  };
}
