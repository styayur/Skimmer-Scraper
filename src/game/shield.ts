import { distance, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { SurfaceProvider, SurfaceQuery } from '../world/worldTypes';
import { COLLISION_RADIUS } from './runRules';

export interface ShieldResult { flight: FlightState; impact: boolean; samples: number }
interface Contact {
  hit: SurfaceQuery;
  position: Vec3;
  safe: Vec3;
  objectVelocity: Vec3;
}

const still: Vec3 = { x: 0, y: 0, z: 0 };

const sweepFlight = (from: Vec3, to: Vec3, world: SurfaceProvider, radius: number): { contact: Contact | null; samples: number } => {
  const steps = Math.max(1, Math.ceil(distance(from, to) / (COLLISION_RADIUS * 0.35)));
  const moving = world.sweepDynamic?.(from, to, radius);
  const pointAt = (fraction: number): Vec3 => ({
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    z: from.z + (to.z - from.z) * fraction,
  });
  let safe = { ...from };
  let samples = 0;
  for (let index = 0; index <= steps; index++) {
    const fraction = index / steps;
    if (moving && moving.fraction < fraction) break;
    const position = pointAt(fraction);
    const hit = world.queryStatic ? world.queryStatic(position, radius + 1) : world.queryNearest(position, radius + 1);
    samples++;
    if (hit && hit.distance <= radius) return { contact: { hit, position, safe, objectVelocity: still }, samples };
    safe = position;
  }
  if (!moving) return { contact: null, samples };
  return { contact: { hit: moving.hit, position: pointAt(moving.fraction), safe, objectVelocity: moving.velocity }, samples };
};

export const flightWouldCollide = (previous: FlightState, next: FlightState, world: SurfaceProvider): boolean =>
  !!sweepFlight(previous.position, next.position, world, COLLISION_RADIUS).contact;

/** Sweep the same aircraft envelope for moving and stationary surfaces. */
export const resolveShield = (previous: FlightState, next: FlightState, world: SurfaceProvider): ShieldResult => {
  const { contact, samples } = sweepFlight(previous.position, next.position, world, COLLISION_RADIUS + 0.06);
  if (!contact) return { flight: next, impact: false, samples };
  const { hit, safe, position, objectVelocity } = contact;
  const exterior = objectVelocity === still ? safe : position;
  let normal = { x: exterior.x - hit.point.x, y: exterior.y - hit.point.y, z: exterior.z - hit.point.z };
  const n = Math.hypot(normal.x, normal.y, normal.z);
  normal = n > 1e-6 ? { x: normal.x / n, y: normal.y / n, z: normal.z / n } : { x: 0, y: 1, z: 0 };
  const dot = (next.velocity.x - objectVelocity.x) * normal.x + (next.velocity.y - objectVelocity.y) * normal.y
    + (next.velocity.z - objectVelocity.z) * normal.z;
  const impulse = Math.min(0, dot) * 1.65;
  const bounced = { x: next.velocity.x - impulse * normal.x, y: next.velocity.y - impulse * normal.y, z: next.velocity.z - impulse * normal.z };
  const length = Math.hypot(bounced.x, bounced.y, bounced.z) || 1;
  const speed = Math.max(18, next.speed * 0.58);
  const flight: FlightState = { ...next,
    position: { x: hit.point.x + normal.x * (COLLISION_RADIUS + 0.22),
      y: hit.point.y + normal.y * (COLLISION_RADIUS + 0.22), z: hit.point.z + normal.z * (COLLISION_RADIUS + 0.22) },
    velocity: { x: bounced.x / length * speed, y: bounced.y / length * speed, z: bounced.z / length * speed },
    speed, boosting: false, control: { pitch: 0, roll: 0, yaw: 0, boost: false },
    attitude: { pitch: Math.asin(Math.max(-1, Math.min(1, bounced.y / length))),
      yaw: Math.atan2(-bounced.x, -bounced.z), roll: next.attitude.roll * 0.5 } };
  const correction = world.queryNearest(flight.position, COLLISION_RADIUS + 0.1);
  const previousSafe = world.queryNearest(safe, COLLISION_RADIUS + 0.1);
  if (correction && correction.distance <= COLLISION_RADIUS && (!previousSafe || previousSafe.distance > COLLISION_RADIUS)) {
    flight.position = { ...safe };
  }
  return { flight, impact: true, samples };
};
