import { Quaternion, Vector3 } from 'three';
import { clamp, type Vec3 } from '../core/math';
import type { SurfaceQuery } from '../world/worldTypes';
import type { FlightState } from './flightModel';
import { clearChord, glideTuning, type GlideContext } from './surfaceTrajectory';

type Contact = SurfaceQuery & { contact: NonNullable<SurfaceQuery['contact']> };
const vec = (p: Vec3) => new Vector3().copy(p);

export function transportTangent(tangent: Vec3, from: Vec3, to: Vector3) {
  return vec(tangent).applyQuaternion(new Quaternion().setFromUnitVectors(vec(from), to))
    .projectOnPlane(to).normalize();
}

interface PreviousPatch {
  normal?: Vec3;
  contactPoint?: Vec3;
  surfaceVelocity?: Vec3;
  geometryId?: string;
  surfaceId?: string;
  logicalSurfaceId?: string;
}

// A probe close to the last supporting plane can see the floor even when the
// nearest face to the aircraft is a ceiling. Restore distance and sidedness
// at the pilot's position; the offset probe itself is never collision evidence.
export function continuationContact(previous: PreviousPatch, position: Vec3, nearest: SurfaceQuery | null,
  dt: number, ctx: GlideContext): SurfaceQuery | null {
  if (!previous.contactPoint || !previous.normal) return nearest;
  const n = vec(previous.normal), center = vec(position);
  const anchor = vec(previous.contactPoint);
  if (previous.surfaceVelocity) anchor.addScaledVector(previous.surfaceVelocity, dt);
  if (nearest?.contact && nearest.surfaceId === previous.surfaceId &&
      nearest.contact.geometryId === previous.geometryId && n.dot(nearest.contact.normal) > 0.84 &&
      Math.abs(vec(nearest.point).sub(anchor).dot(n)) < 0.3) return nearest;
  const probe = center.clone().addScaledVector(n, 0.18 - center.clone().sub(anchor).dot(n));
  const hit = ctx.world.queryGlide?.(probe, 1.25);
  if (!hit?.contact) return nearest;
  const offset = center.sub(hit.point);
  const normal = vec(hit.contact.normal);
  if (normal.dot(offset) < 0) normal.negate();
  const distance = offset.length();
  if (normal.dot(n) < 0.84 || offset.dot(normal) < distance * 0.97 ||
      (previous.logicalSurfaceId && hit.contact.logicalSurfaceId &&
       previous.logicalSurfaceId !== hit.contact.logicalSurfaceId)) return nearest;
  return { ...hit, distance, contact: { ...hit.contact, normal } };
}

interface Patch {
  hit: Contact;
  center: Vector3;
  normal: Vector3;
  heading: Vector3;
  seconds: number;
  parent?: Patch;
  turn: number;
  firstTurn: number;
  distance: number;
  curvature: number;
  cost: number;
}

export interface PatchGuidance {
  speedLimit: number;
  turnRate: number;
  normalLead: number;
  depth: number;
}

// Bounds apply per 15 Hz planning tick. A clear straight continuation needs
// just one branch. At an edge retain alternatives for both steering signs.
const stations = 5, beamWidth = 3;
const following = glideTuning.followingAcceleration, braking = 90;

function sweptEdge(ctx: GlideContext, from: Vector3, to: Vector3, begin: number, end: number) {
  if (clearChord(ctx, from, to, begin, end, following)) return true;
  // The world's enclosing ball is conservative. Subdivide a long chord near
  // parallel walls before ruling out a corridor wide enough for the aircraft.
  const count = Math.min(8, Math.ceil(from.distanceTo(to) / 1.6));
  if (count < 2) return false;
  let a = from, start = begin;
  for (let i = 1; i <= count; i++) {
    const b = from.clone().lerp(to, i / count);
    const finish = begin + (end - begin) * i / count;
    if (!clearChord(ctx, a, b, start, finish, following)) return false;
    a = b;
    start = finish;
  }
  return true;
}

export function clearCoast(flight: FlightState, ctx: GlideContext) {
  const seconds = 2 / glideTuning.planningHz, from = vec(flight.position);
  return sweptEdge(ctx, from, from.clone().addScaledVector(flight.velocity, seconds), 0, seconds);
}

export function planSurfacePatches(flight: FlightState, rootHit: Contact, tangent: Vector3,
  ctx: GlideContext, dt: number): PatchGuidance | null {
  const speed = tangent.length();
  if (!(speed > 1)) return null;
  const spacing = clamp(speed / glideTuning.planningHz, 2.8, 7), interval = spacing / speed;
  const steering = Math.min(0.30, following * 0.72 * interval / speed);
  const clearance = glideTuning.clearance + 1.4 * flight.control.pitch;
  const root: Patch = { hit: rootHit, center: vec(flight.position), normal: vec(rootHit.contact.normal).normalize(),
    heading: tangent.clone().normalize(), seconds: 0, cost: 0, distance: 0, curvature: 0, turn: 0, firstTurn: 0 };
  const query = (p: Vector3, range: number, time: number) => ctx.world.queryGlideAhead
    ? ctx.world.queryGlideAhead(p, range, time) : ctx.world.queryGlide?.(p, range);

  let lateralEdge = false;
  function extend(parent: Patch, turn: number, span = spacing): Patch | undefined {
    const stepTime = span / speed;
    const heading = parent.heading.clone().applyAxisAngle(parent.normal, turn);
    const chordHeading = parent.heading.clone().applyAxisAngle(parent.normal, turn / 2);
    const velocity = parent.hit.contact.velocity;
    if (!ctx.world.queryGlideAhead && vec(velocity).lengthSq() > 1e-8) return;
    const seconds = parent.seconds + stepTime;
    // queryGlideAhead accepts a future world-space probe, but returns a point
    // in the current pose. Store nodes in world space at their arrival time.
    const foot = vec(parent.hit.point).addScaledVector(velocity, seconds).addScaledVector(chordHeading, span);
    const height = clearance + (rootHit.distance - clearance) * Math.exp(-3.5 * seconds);
    const probe = foot.clone().addScaledVector(parent.normal, height);
    let hit = query(probe, 11, seconds);
    if (!hit?.contact || vec(hit.contact.normal).dot(parent.normal) < 0.70 ||
        Math.abs(hit.distance - height) > 1.2 || hit.surfaceId !== parent.hit.surfaceId) {
      probe.copy(foot).addScaledVector(parent.normal, 0.35);
      hit = query(probe, Math.max(3.2, spacing * 0.65), seconds);
    }
    if (!hit?.contact || !Number.isFinite(hit.distance) ||
        !(vec(velocity).distanceTo(hit.contact.velocity) <= 0.5) ||
        (hit.surfaceId === parent.hit.surfaceId && hit.contact.geometryId !== parent.hit.contact.geometryId)) return;
    const point = vec(hit.point).addScaledVector(hit.contact.velocity, seconds);
    const normal = vec(hit.contact.normal);
    if (!(Math.abs(normal.lengthSq() - 1) <= 0.01)) return;
    if (normal.dot(parent.normal) < 0) normal.negate();
    // The probe must land on the finite face. A closest vertex dangling
    // beside a gap can have the right normal and an unusable contact point.
    const residual = probe.clone().sub(point).projectOnPlane(normal);
    const overhang = residual.length();
    const alignment = normal.dot(parent.normal);
    const sideways = Math.abs(residual.dot(heading.clone().cross(normal)));
    if (sideways > 0.10 && sideways > Math.abs(residual.dot(heading)) && alignment > 0.999999) {
      lateralEdge = true;
      return;
    }
    if (alignment < 0.70 || overhang > 0.55) return;
    const center = point.clone().addScaledVector(normal, height);
    const relativeChord = center.clone().sub(parent.center).addScaledVector(velocity, -stepTime);
    const distance = relativeChord.length();
    if (!(relativeChord.dot(heading) >= span * 0.42 && distance <= span * 1.75) ||
        !sweptEdge(ctx, parent.center, center, parent.seconds, seconds)) return;
    const forward = transportTangent(heading, parent.normal, normal);
    const curvature = forward.distanceTo(parent.heading) / distance;
    const same = parent.hit.contact.logicalSurfaceId
      ? hit.contact.logicalSurfaceId === parent.hit.contact.logicalSurfaceId
      : hit.surfaceId === parent.hit.surfaceId;
    return { hit: { ...hit, contact: hit.contact }, center, normal, heading: forward, seconds, parent,
      turn, firstTurn: parent === root ? turn : parent.firstTurn, distance, curvature,
      // With equal turn costs a receding horizon can keep deferring a needed
      // turn by one station until the aircraft runs off a narrowing ribbon.
      cost: parent.cost + Math.abs(turn) * (1 + parent.seconds / (stations * interval))
        + 0.15 * sideways + (same ? 0 : 0.03) };
  }

  let best = root, depth = 0;
  for (; depth < stations; depth++) {
    let next = extend(best, 0);
    if (!next && !lateralEdge) {
      // An offset path can change faces twice within one coarse chord on a
      // rough or concave mesh. Resolve its two swept half-edges before coasting.
      const mid = extend(best, 0, spacing / 2);
      if (mid) next = extend(mid, 0, spacing / 2);
    }
    if (!next) break;
    best = next;
  }
  if (depth < stations && lateralEdge) {
    let frontier = [root];
    for (let level = 1; level <= stations; level++) {
      const candidates: Patch[] = [];
      for (const parent of frontier) for (const turn of [0, steering, -steering]) {
        const child = extend(parent, turn);
        if (child) candidates.push(child);
      }
      if (!candidates.length) break;
      candidates.sort((a, b) => a.cost - b.cost);
      frontier = [];
      for (const child of candidates) {
        if (!frontier.some(p => p.firstTurn === child.firstTurn)) frontier.push(child);
      }
      for (const child of candidates) {
        if (frontier.length >= beamWidth) break;
        if (!frontier.includes(child)) frontier.push(child);
      }
      // A bend needs a full verified run-out. Steering sideways merely to
      // postpone the end of a deck can point recovery into a canyon wall.
      if (level === stations && level > depth) {
        const winner = frontier[0];
        const ambiguous = winner.firstTurn !== 0 && frontier.some(p =>
          p.firstTurn === -winner.firstTurn && Math.abs(p.cost - winner.cost) < 1e-5);
        if (!ambiguous) { best = winner; depth = level; }
      }
    }
  }
  if (best === root) return null;
  // Propagate feasible corner speeds back to the first edge. Clamp the actual
  // velocity separately every physics tick so a new route cannot snap speed.
  let speedLimit = Infinity, first = best;
  for (let node = best; node.parent; node = node.parent) {
    // A regular faceted arc can alternate between one and two face changes
    // per chord. Integrate curvature over two chords, retaining a local cap
    // for isolated sharp folds.
    const mean = (node.curvature * node.distance + first.curvature * first.distance) / (node.distance + first.distance);
    const curvature = Math.max(node.curvature * 0.85, mean);
    speedLimit = Math.min(Math.sqrt(speedLimit ** 2 + 2 * braking * node.distance),
      curvature > 0 ? Math.sqrt(following * 0.65 / curvature) : Infinity);
    first = node;
  }
  const offsetChord = vec(first.hit.point).sub(root.hit.point)
    .addScaledVector(first.normal, clearance).addScaledVector(root.normal, -clearance);
  return { speedLimit, turnRate: first.turn / first.seconds, depth,
    normalLead: clamp(offsetChord.dot(root.normal) * dt / first.seconds ** 2, -8, 8) };
}
