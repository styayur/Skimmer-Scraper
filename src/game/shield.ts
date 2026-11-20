import { distance, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { SurfaceProvider } from '../world/worldTypes';
import { COLLISION_RADIUS } from './runRules';

export interface ShieldResult { flight: FlightState; impact: boolean; samples: number }
/** Sweep a sphere along the travelled segment, retaining the last exterior pose. */
export const resolveShield = (previous: FlightState, next: FlightState, world: SurfaceProvider): ShieldResult => {
  const steps = Math.max(1, Math.ceil(distance(previous.position, next.position) / (COLLISION_RADIUS * 0.35)));
  let safe = { ...previous.position };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const position: Vec3 = { x: previous.position.x + (next.position.x - previous.position.x) * t,
      y: previous.position.y + (next.position.y - previous.position.y) * t,
      z: previous.position.z + (next.position.z - previous.position.z) * t };
    const hit = world.queryNearest(position, COLLISION_RADIUS + 1);
    if (!hit || hit.distance > COLLISION_RADIUS + 0.06) { safe = position; continue; }
    let normal = { x: safe.x - hit.point.x, y: safe.y - hit.point.y, z: safe.z - hit.point.z };
    const n = Math.hypot(normal.x, normal.y, normal.z);
    normal = n > 1e-6 ? { x: normal.x / n, y: normal.y / n, z: normal.z / n } : { x: 0, y: 1, z: 0 };
    const dot = next.velocity.x * normal.x + next.velocity.y * normal.y + next.velocity.z * normal.z;
    const bounced = { x: next.velocity.x - Math.min(0, dot) * 1.65 * normal.x,
      y: next.velocity.y - Math.min(0, dot) * 1.65 * normal.y,
      z: next.velocity.z - Math.min(0, dot) * 1.65 * normal.z };
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
    return { flight, impact: true, samples: i + 1 };
  }
  return { flight: next, impact: false, samples: steps + 1 };
};
