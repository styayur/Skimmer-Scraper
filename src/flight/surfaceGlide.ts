import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, type Vec3 } from '../core/math';
import type { SurfaceQuery } from '../world/worldTypes';
import type { FlightState } from './flightModel';

type GlidePhase = 'FLIGHT' | 'ARMED' | 'ATTACHING' | 'GLIDING' | 'DETACHING' | 'RECOVERY';
export interface GlideState {
  phase: GlidePhase;
  time: number;
  normal?: Vec3;
  surfaceId?: string;
  geometryId?: string;
}

export const freeGlide = (): GlideState => ({ phase: 'FLIGHT', time: 0 });
export const toggleGlide = (state: GlideState): GlideState => {
  if (state.phase === 'ARMED') return freeGlide();
  if (state.phase === 'ATTACHING' || state.phase === 'GLIDING') return { phase: 'DETACHING', time: 0 };
  return { phase: 'ARMED', time: 0 };
};

export const needsGlideContact = (state: GlideState) =>
  state.phase === 'ARMED' || state.phase === 'ATTACHING' || state.phase === 'GLIDING';

const vector = (v: Vec3) => new Vector3(v.x, v.y, v.z);
const clearance = 6;
export const glideRange = 11;

/** Resolve motion against a pilot-facing triangle frame in absolute world space. */
export function stepGlide(state: GlideState, previous: FlightState, free: FlightState,
  hit: SurfaceQuery | null, dt: number): { state: GlideState; flight: FlightState } {
  if (!needsGlideContact(state)) {
    if (state.phase === 'FLIGHT') return { state, flight: free };
    const time = state.time + dt;
    return { state: time < 0.25 ? { ...state, time } : freeGlide(), flight: free };
  }
  const waiting = state.phase === 'ARMED';
  const fallback: GlideState = waiting ? state : { phase: 'RECOVERY', time: 0 };
  if (!hit?.contact || hit.distance > glideRange || hit.distance < 3.3) return { state: fallback, flight: free };

  const normal = vector(hit.contact.normal).normalize();
  const offset = vector(previous.position).sub(vector(hit.point));
  const surfaceVelocity = vector(hit.contact.velocity);
  const relative = vector(previous.velocity).sub(surfaceVelocity);
  const tangent = relative.clone().projectOnPlane(normal);
  // Reject open edges and discontinuous normals. Traversable seams keep the same
  // tangent plane even when the adjacent triangle belongs to another chunk.
  if (offset.dot(normal) < 0.88 * hit.distance || tangent.length() < 0.48 * free.speed ||
    (state.normal && vector(state.normal).dot(normal) < 0.84) ||
    (state.surfaceId === hit.surfaceId && state.geometryId !== hit.contact.geometryId)) {
    return { state: fallback, flight: free };
  }

  const turn = clamp(free.control.roll + free.control.yaw, -1, 1) * 1.25 * dt;
  tangent.normalize().applyAxisAngle(normal, turn);
  const desiredDistance = clearance + 1.4 * free.control.pitch;
  const correction = clamp((desiredDistance - offset.dot(normal)) * 3.5, -9, 9);
  const normalSpeed = relative.dot(normal);
  const correctedSpeed = normalSpeed + clamp(correction - normalSpeed, -110 * dt, 110 * dt);
  const velocity = tangent.clone().multiplyScalar(free.speed).addScaledVector(normal, correctedSpeed).add(surfaceVelocity);

  const back = tangent.clone().negate();
  const right = normal.clone().cross(back).normalize();
  const target = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, normal, back));
  const euler = new Euler(previous.attitude.pitch, previous.attitude.yaw, previous.attitude.roll, 'YXZ');
  const orientation = new Quaternion().setFromEuler(euler).rotateTowards(target, 3.1 * dt);
  euler.setFromQuaternion(orientation, 'YXZ');
  const settled = Math.abs(offset.dot(normal) - desiredDistance) < 1 && orientation.angleTo(target) < 0.14;
  const phase = state.phase === 'GLIDING' || settled ? 'GLIDING' : 'ATTACHING';
  return {
    state: { phase, time: state.time + dt, normal, surfaceId: hit.surfaceId, geometryId: hit.contact.geometryId },
    flight: { ...free, position: vector(previous.position).addScaledVector(velocity, dt), velocity,
      attitude: { pitch: euler.x, yaw: euler.y, roll: euler.z } },
  };
}
