import { Euler, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../core/math';
import type { SurfaceProvider, SurfaceQuery } from '../world/worldTypes';
import type { FlightInput, FlightState } from './flightModel';

export const glideTuning = Object.freeze({
  acceleration: 260, emergencyAcceleration: 560, planningHz: 15, clearance: 6, attitudeRate: 4.2,
  captureSeconds: 2, reacquireSeconds: 0.36, followingAcceleration: 230,
});
export interface GlideContext {
  world: SurfaceProvider;
  worldUp: Vec3;
  bodyRadius: number;
  input?: FlightInput;
  acceleration?: number;
}
type Contact = SurfaceQuery & { contact: NonNullable<SurfaceQuery['contact']> };
const hasFrame = (hit: SurfaceQuery | null | undefined): hit is Contact =>
  !!hit?.contact && Math.abs(new Vector3().copy(hit.contact.normal).lengthSq() - 1) < 0.01;
const vec = (v: Vec3) => new Vector3().copy(v);

// Each leg interpolates velocity with smoothstep. Its analytic integral gives
// continuous position, velocity and acceleration, including at joins.
interface Leg { start: Vector3; from: Vector3; to: Vector3; duration: number }
export interface SurfaceTrajectory {
  escape?: boolean;
  legs: Leg[];
  duration: number;
  normal: Vec3;
  surfaceId: string;
  geometryId: string;
  surfaceVelocity: Vec3;
  acceleration: number;
}
function sampleLeg(leg: Leg, seconds: number) {
  const u = Math.min(1, Math.max(0, seconds / leg.duration));
  const delta = leg.to.clone().sub(leg.from);
  const position = leg.start.clone().addScaledVector(leg.from, u * leg.duration)
    .addScaledVector(delta, leg.duration * u ** 3 * (1 - u / 2));
  return { position, velocity: leg.from.clone().addScaledVector(delta, u * u * (3 - 2 * u)) };
}
export function sampleTrajectory(plan: SurfaceTrajectory, time: number) {
  for (const leg of plan.legs) {
    if (time <= leg.duration) return sampleLeg(leg, time);
    time -= leg.duration;
  }
  const last = plan.legs[plan.legs.length - 1];
  return sampleLeg(last, last.duration);
}
function trajectory(flight: FlightState, target: Contact, acceleration: number,
  steps: Array<[Vector3, number]>): SurfaceTrajectory | null {
  const legs: Leg[] = [];
  let start = vec(flight.position), from = vec(flight.velocity), duration = 0;
  for (const [to, seconds] of steps) {
    if (!(seconds > 0 && seconds <= 1.6) || 1.5 * from.distanceTo(to) > acceleration * seconds) return null;
    const leg = { start, from, to, duration: seconds };
    legs.push(leg);
    start = sampleLeg(leg, seconds).position;
    from = to;
    duration += seconds;
  }
  return { legs, duration, acceleration, normal: target.contact.normal, surfaceId: target.surfaceId,
    geometryId: target.contact.geometryId, surfaceVelocity: target.contact.velocity };
}

export function clearChord(ctx: GlideContext, a: Vector3, b: Vector3, start: number, end: number, acceleration: number) {
  const radius = ctx.bodyRadius + 0.12 + acceleration * (end - start) ** 2 / 8;
  const center = a.clone().lerp(b, 0.5);
  return !!ctx.world.isGlideVolumeCovered?.(center, radius + a.distanceTo(b) / 2) &&
    !!ctx.world.glideChordClear?.(a, b, radius, start, end);
}
export function supported(plan: SurfaceTrajectory, elapsed: number, ctx: GlideContext) {
  const finish = sampleTrajectory(plan, plan.duration).position
    .addScaledVector(plan.surfaceVelocity, elapsed - plan.duration);
  const hit = ctx.world.queryGlide?.(finish, glideTuning.clearance + 1);
  return hasFrame(hit) && hit.surfaceId === plan.surfaceId && hit.contact.geometryId === plan.geometryId &&
    vec(hit.contact.normal).dot(plan.normal) > 0.94 && Math.abs(hit.distance - glideTuning.clearance) < 0.85 &&
    vec(finish).sub(hit.point).dot(plan.normal) > 0.97 * hit.distance;
}
function valid(plan: SurfaceTrajectory | null, ctx: GlideContext) {
  if (!plan || (!plan.escape && !supported(plan, 0, ctx))) return false;
  let time = 0;
  for (const leg of plan.legs) {
    const count = Math.max(1, Math.ceil(leg.duration * Math.max(leg.from.length(), leg.to.length()) / 3.2));
    let a = leg.start;
    for (let i = 1; i <= count; i++) {
      const b = sampleLeg(leg, leg.duration * i / count).position;
      const end = time + leg.duration / count;
      if (!clearChord(ctx, a, b, time, end, plan.acceleration)) return false;
      time = end;
      a = b;
    }
  }
  return true;
}

function directions(flight: FlightState, frame: Contact, ctx: GlideContext) {
  const normal = vec(frame.contact.normal);
  const attitude = flight.attitude;
  const rotation = new Euler(attitude.pitch, attitude.yaw, attitude.roll, 'YXZ');
  const right = new Vector3(1, 0, 0).applyEuler(rotation);
  const localUp = new Vector3(0, 1, 0).applyEuler(rotation);
  const input = ctx.input ?? flight.control;
  const intent = localUp.multiplyScalar(input.pitch).addScaledVector(right, -Math.max(-1, Math.min(1, input.yaw + input.roll)))
    .projectOnPlane(normal);
  const momentum = vec(flight.velocity).sub(frame.contact.velocity).projectOnPlane(normal);
  const up = vec(ctx.worldUp).projectOnPlane(normal);
  const side = up.lengthSq() > 0.01 ? up.clone().cross(normal) : right.projectOnPlane(normal);
  const options = [intent.clone(), momentum.clone(), up.clone(), side.clone(), side.clone().negate(),
    new Vector3(0, 0, -1).applyEuler(rotation).projectOnPlane(normal), up.clone().negate()];
  const ranked: { direction: Vector3; score: number }[] = [];
  momentum.normalize();
  for (const direction of options) {
    if (direction.lengthSq() < 1e-5) continue;
    direction.normalize();
    if (ranked.some(option => direction.dot(option.direction) > 0.99)) continue;
    ranked.push({ direction, score: 15 * direction.dot(intent) + 3 * direction.dot(up) + 2 * direction.dot(momentum) });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

export function planRedirect(flight: FlightState, ctx: GlideContext): SurfaceTrajectory | null {
  const velocity = vec(flight.velocity), speed = velocity.length();
  if (!(speed > 1)) return null;
  const acceleration = ctx.acceleration ?? glideTuning.acceleration;
  const heading = velocity.clone().normalize();
  const radius = speed * speed / acceleration;
  const stop = speed * speed / (2 * acceleration);
  const reach = Math.min(speed * 1.4, Math.max(speed * 0.65, radius + stop + speed / glideTuning.planningHz + glideTuning.clearance + ctx.bodyRadius));
  // Short overlapping probes select finite faces ahead even beside a closer floor.
  const span = Math.max(5, reach / 7);
  for (let along = 0; along < reach; along += span) {
    const probe = vec(flight.position).addScaledVector(heading, along);
    const hit = ctx.world.queryGlideAhead ? ctx.world.queryGlideAhead(probe, span + ctx.bodyRadius, along / speed) :
      ctx.world.queryGlide?.(probe, span + ctx.bodyRadius);
    if (!hasFrame(hit)) continue;
    const normal = vec(hit.contact.normal);
    const relative = velocity.clone().sub(hit.contact.velocity);
    const inward = -relative.dot(normal);
    if (inward < 0.25 * speed) continue;
    const gap = vec(flight.position).sub(hit.point).dot(normal) - glideTuning.clearance;
    const emergency = gap / inward <= 0.55;
    const limit = emergency ? ctx.acceleration ?? glideTuning.emergencyAcceleration : acceleration;
    if (gap < inward * inward / (2 * limit)) return null;
    const duration = 2 * gap / inward;
    for (const { direction } of directions(flight, hit, ctx)) {
      for (const retention of emergency ? [1, 0.72, 0.48] : [1]) {
        const endVelocity = direction.clone().multiplyScalar(relative.length() * retention).add(hit.contact.velocity);
        const plan = trajectory(flight, hit, limit, [[endVelocity, duration]]);
        if (plan && valid(plan, ctx)) return plan;
      }
    }
    return null;
  }
  return null;
}

/** Sample a bounded fan around the flight path. Two legs carry a parallel approach
 * inward, then remove its normal velocity at the stand-off distance. */
export function planMagnetic(flight: FlightState, ctx: GlideContext) {
  const position = vec(flight.position), velocity = vec(flight.velocity);
  const speed = velocity.length(), limit = ctx.acceleration ?? glideTuning.acceleration;
  if (speed < 1) return null;
  const heading = velocity.clone().normalize(), up = vec(ctx.worldUp);
  const side = new Vector3(1, 0, 0).applyEuler(new Euler(flight.attitude.pitch, flight.attitude.yaw, flight.attitude.roll, 'YXZ'));
  const reach = Math.min(38, glideTuning.clearance + speed * 0.16 + speed * speed / (4 * limit));
  const input = ctx.input ?? flight.control;
  if (input.yaw + input.roll > 0) side.negate();
  for (const axis of [side, side.clone().negate(), up, up.clone().negate()]) {
    const probe = position.clone().addScaledVector(heading, speed * 0.10).addScaledVector(axis, reach * 0.65);
    const hit = ctx.world.queryGlide?.(probe, reach);
    if (!hasFrame(hit)) continue;
    // A probe may be inside a thin wall. Resolve its frame on the pilot side.
    const face = ctx.world.queryGlide?.(vec(hit.point).lerp(position, 0.06), reach * 0.12);
    if (!hasFrame(face) || face.surfaceId !== hit.surfaceId) continue;
    const n = vec(face.contact.normal), relative = velocity.clone().sub(face.contact.velocity);
    const gap = position.clone().sub(face.point).dot(n) - glideTuning.clearance;
    if (gap < 1 || gap > reach || Math.abs(relative.dot(n)) > 0.35 * speed) continue;
    const tangent = relative.clone().projectOnPlane(n).normalize();
    const duration = Math.max(0.22, Math.sqrt(2.5 * gap / limit));
    const inward = -gap / duration - relative.dot(n) / 2;
    const along = Math.sqrt(Math.max(0, relative.lengthSq() - inward * inward));
    const mid = tangent.clone().multiplyScalar(along).addScaledVector(n, inward).add(face.contact.velocity);
    const end = tangent.multiplyScalar(relative.length()).add(face.contact.velocity);
    const plan = trajectory(flight, face, limit, [[mid, duration], [end, duration]]);
    if (plan && valid(plan, ctx)) return plan;
  }
  return null;
}

/** Escape needs a clear run-out after the turn even when the target face ends. */
export function planEscape(flight: FlightState, ctx: GlideContext) {
  const velocity = vec(flight.velocity), speed = velocity.length();
  if (speed < 1) return null;
  const position = vec(flight.position), heading = velocity.clone().normalize();
  const limit = ctx.acceleration ?? glideTuning.emergencyAcceleration;
  for (const look of [0.10, 0.20, 0.32]) {
    const probe = position.clone().addScaledVector(velocity, look);
    const hit = ctx.world.queryGlideAhead?.(probe, speed * 0.16 + ctx.bodyRadius, look, true);
    if (!hasFrame(hit)) continue;
    const n = vec(hit.contact.normal);
    if (heading.dot(n) > -0.24 || position.clone().sub(hit.point).dot(n) <= ctx.bodyRadius) continue;
    for (const { direction } of directions(flight, hit, ctx)) {
      const to = direction.addScaledVector(n, 0.38).normalize().multiplyScalar(speed * 0.70);
      const turn = Math.max(0.12, 1.51 * velocity.distanceTo(to) / limit);
      const plan = trajectory(flight, hit, limit, [[to, turn], [to, 0.28]]);
      if (!plan) continue;
      plan.escape = true;
      const end = sampleTrajectory(plan, plan.duration).position;
      if (!ctx.world.queryNearest(end, glideTuning.clearance + ctx.bodyRadius) && valid(plan, ctx)) return plan;
    }
  }
  return null;
}

/** Brake before a convex edge, round it at a speed compatible with clearance,
 * then travel far enough onto the second face to verify genuine roof support. */
export function planTransfer(flight: FlightState, wall: SurfaceQuery, ctx: GlideContext): SurfaceTrajectory | null {
  if (!hasFrame(wall)) return null;
  const normal = vec(wall.contact.normal), surfaceVelocity = vec(wall.contact.velocity);
  const relative = vec(flight.velocity).sub(surfaceVelocity);
  const heading = relative.clone().projectOnPlane(normal).normalize();
  const speed = relative.dot(heading), acceleration = ctx.acceleration ?? glideTuning.acceleration;
  if (speed < 12) return null;
  const clearance = glideTuning.clearance;
  // Look over and slightly behind the front face. Reject gaps by checking both
  // incident faces at the computed edge, independently of their triangle IDs.
  for (const look of [0.85, 0.55, 0.30, 0.15]) {
    const probe = vec(wall.point).addScaledVector(heading, speed * look + clearance).addScaledVector(normal, -clearance);
    const roof = ctx.world.queryGlide?.(probe, speed * 0.26 + clearance);
    if (!hasFrame(roof)) continue;
    const roofNormal = vec(roof.contact.normal);
    const cosine = normal.dot(roofNormal);
    const acrossDirection = heading.clone().applyQuaternion(new Quaternion().setFromUnitVectors(normal, roofNormal));
    const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
    // The along-edge component of momentum stays continuous through an
    // oblique crossing. Only the perpendicular component rounds the corner.
    if (cosine > 0.84 || sine < 0.35 || roofNormal.dot(heading) < 0.60 * sine ||
        vec(roof.contact.velocity).distanceTo(surfaceVelocity) > 0.25) continue;
    const along = vec(roof.point).sub(wall.point).dot(roofNormal) / heading.dot(roofNormal);
    if (along <= 0.2) continue;
    const edge = vec(wall.point).addScaledVector(heading, along);
    const before = ctx.world.queryGlide?.(edge.clone().addScaledVector(heading, -0.25).addScaledVector(normal, 0.15), 0.22);
    const after = ctx.world.queryGlide?.(edge.clone().addScaledVector(acrossDirection, 0.25).addScaledVector(roofNormal, 0.15), 0.22);
    if (!hasFrame(before) || !hasFrame(after) || vec(before.contact.normal).dot(normal) < 0.96 ||
        vec(after.contact.normal).dot(roofNormal) < 0.96 || after.surfaceId !== roof.surfaceId) continue;

    // Smoothstep peaks at 1.5 times the mean velocity change. For a
    // shallow fold this can exceed the limit even at the right-angle speed.
    const perpendicular = heading.dot(roofNormal) / sine;
    const peakFactor = 1.5 * perpendicular ** 2 * Math.sqrt((1 + cosine) / 2);
    const cornerSpeed = Math.min(speed, Math.sqrt(acceleration * clearance * Math.min(0.85, 0.98 / peakFactor)));
    const entry = heading.clone().multiplyScalar(cornerSpeed).add(surfaceVelocity);
    const across = acrossDirection.multiplyScalar(cornerSpeed).add(surfaceVelocity);
    const approach = 2 * along / (speed + cornerSpeed);
    const turn = 2 * clearance * (1 - cosine) / (cornerSpeed * heading.dot(roofNormal));
    const plan = trajectory(flight, roof, acceleration, [[entry, approach], [across, turn], [across, 12 / cornerSpeed]]);
    if (plan && valid(plan, ctx)) return plan;
  }
  return null;
}

