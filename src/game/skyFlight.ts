import { Euler, Quaternion, Vector3 } from 'three';
import { clamp, distance, forwardFromAttitude, type Attitude, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { SpawnState } from '../world/renderWorld';
import type { SurfaceProvider } from '../world/worldTypes';
import { SKY_DIVE_SECONDS } from './skyJourney';

type SkyWorld = SurfaceProvider & { isCompanionCovered?(position: Vec3): boolean };
const clearance = 6.5;

const clearAt = (world: SkyWorld, position: Vec3): boolean =>
  world.isCompanionCovered?.(position) !== false && !world.queryNearest(position, clearance);

/** Candidates are ordered by the pilot's approach direction and then the city grid. */
function* skyArrivals(spawn: SpawnState, world: SkyWorld, preferredYaw: number): Generator<SpawnState> {
  const headings = [preferredYaw, spawn.yaw, spawn.yaw + Math.PI, spawn.yaw + Math.PI / 2, spawn.yaw - Math.PI / 2];
  for (const height of [0, -8, 4]) {
    for (const [dx, dz] of [[0, 0], [0, 40], [0, -40], [40, 0], [-40, 0]]) {
      const position = { x: spawn.position.x + dx, y: spawn.position.y + height, z: spawn.position.z + dz };
      const nearest = world.queryNearest(position, 33);
      if (!nearest || nearest.distance < 10 || nearest.distance > 32) continue;
      for (const yaw of headings) {
        const pitch = -0.015;
        const forward = forwardFromAttitude({ yaw, pitch, roll: 0 });
        let safe = true;
        for (let along = 0; along <= 180; along += 2) {
          if (!clearAt(world, {
            x: position.x + forward.x * along,
            y: position.y + forward.y * along,
            z: position.z + forward.z * along,
          })) {
            safe = false;
            break;
          }
        }
        if (safe) yield { ...spawn, position, yaw, pitch };
      }
    }
  }
}

const orientation = (attitude: Attitude): Quaternion =>
  new Quaternion().setFromEuler(new Euler(attitude.pitch, attitude.yaw, attitude.roll, 'YXZ'));

const attitudeOf = (rotation: Quaternion): Attitude => {
  const angles = new Euler().setFromQuaternion(rotation, 'YXZ');
  return { pitch: angles.x, yaw: angles.y, roll: angles.z };
};

const vector = (value: Vec3): Vector3 => new Vector3(value.x, value.y, value.z);
const angleBetween = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface SkyPassage {
  entry: FlightState;
  start: Vec3;
  end: Vec3;
  exitVelocity: Vec3;
  exitAttitude: Attitude;
  adjustedHeading: boolean;
}

const pathValue = (a: number, b: number, va: number, vb: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * va * SKY_DIVE_SECONDS
    + (-2 * t3 + 3 * t2) * b + (t3 - t2) * vb * SKY_DIVE_SECONDS;
};

const pathRate = (a: number, b: number, va: number, vb: number, t: number): number => {
  const t2 = t * t;
  return (6 * t2 - 6 * t) * (a - b) / SKY_DIVE_SECONDS + (3 * t2 - 4 * t + 1) * va + (3 * t2 - 2 * t) * vb;
};

const pathPoint = ({ entry, start, end, exitVelocity }: SkyPassage, t: number): Vec3 => ({
  x: pathValue(start.x, end.x, entry.velocity.x, exitVelocity.x, t),
  y: pathValue(start.y, end.y, entry.velocity.y, exitVelocity.y, t),
  z: pathValue(start.z, end.z, entry.velocity.z, exitVelocity.z, t),
});

export const planSkyPassage = (entry: FlightState, spawn: SpawnState, world: SkyWorld): SkyPassage | null => {
  const entranceFrame = orientation({ ...entry.attitude, roll: 0 });
  for (const arrival of skyArrivals(spawn, world, entry.attitude.yaw)) {
    const destination = { yaw: arrival.yaw, pitch: arrival.pitch ?? 0, roll: 0 };
    const worldRotation = orientation(destination).multiply(entranceFrame.clone().invert());
    const exitAttitude = attitudeOf(worldRotation.multiply(orientation(entry.attitude)));
    const [x, y, z] = vector(forwardFromAttitude(exitAttitude)).multiplyScalar(entry.speed).toArray();
    const adjustedHeading = Math.abs(angleBetween(entry.attitude.yaw, arrival.yaw)) > 0.1;
    for (const height of [48, 30, 14]) {
      for (const retreat of [0.24, 0.12, 0]) {
        const end = arrival.position;
        const start = { x: end.x - x * retreat, y: end.y + height, z: end.z - z * retreat };
        const passage: SkyPassage = {
          entry, start, end, exitVelocity: { x, y, z }, exitAttitude, adjustedHeading,
        };
        const samples = Math.ceil(distance(start, end) * 2 + entry.speed * SKY_DIVE_SECONDS * 2);
        let safe = true;
        for (let step = 0; step <= samples; step++) {
          if (!clearAt(world, pathPoint(passage, step / samples))) {
            safe = false;
            break;
          }
        }
        if (safe) return passage;
      }
    }
  }
  return null;
};

export const stepSkyDive = (flight: FlightState, passage: SkyPassage, progress: number, dt: number): FlightState => {
  if (!Number.isFinite(progress) || !(dt > 0) || !Number.isFinite(dt)) return flight;
  const t = clamp(progress, 0, 1);
  const { entry, start, end, exitVelocity, exitAttitude } = passage;
  const turn = t * t * (3 - 2 * t);
  // Turn the unbanked flight frame. Applying bank last keeps it continuous through vertical.
  const attitude = {
    pitch: entry.attitude.pitch + angleBetween(entry.attitude.pitch, exitAttitude.pitch) * turn,
    yaw: entry.attitude.yaw + angleBetween(entry.attitude.yaw, exitAttitude.yaw) * turn,
    roll: entry.attitude.roll,
  };
  return {
    ...flight,
    position: pathPoint(passage, t),
    velocity: {
      x: pathRate(start.x, end.x, entry.velocity.x, exitVelocity.x, t),
      y: pathRate(start.y, end.y, entry.velocity.y, exitVelocity.y, t),
      z: pathRate(start.z, end.z, entry.velocity.z, exitVelocity.z, t),
    },
    attitude,
    elapsed: flight.elapsed + dt,
  };
};

/** Wing offsets stay in the same local frame as the player when the path opens. */
export const translateWingForSky = (wing: FlightState, passage: SkyPassage): FlightState => {
  const [x, y, z] = vector(wing.position).sub(vector(passage.entry.position)).add(vector(passage.start)).toArray();
  return {
    ...wing,
    position: { x, y, z },
    attitude: { ...wing.attitude },
    velocity: { ...wing.velocity },
  };
};
