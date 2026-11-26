import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { createFlightState, FLIGHT, NEUTRAL_INPUT, stepFlight } from '../../src/flight/flightModel';
import { freeGlide, stepGlide, toggleGlide } from '../../src/flight/surfaceGlide';
import { defaultScoreContext, bestStorageKey } from '../../src/game/storage';
import { BufferingEvents } from '../../src/core/bufferingEvents';

describe('surface glide', () => {
  it.each([[0,1,0],[1,0,0],[0,-1,0],[0.6,0.8,0]])('aligns with a plane whose normal is %j,%j,%j', (x,y,z) => {
    const normal = new Vector3(x,y,z);
    let flight = createFlightState({position: normal.clone().multiplyScalar(10), yaw: 0});
    let state = toggleGlide(freeGlide());
    for (let i = 0; i < 360; i++) {
      const pos = new Vector3().copy(flight.position);
      const point = pos.clone().projectOnPlane(normal);
      const hit = {point, distance: pos.distanceTo(point), surfaceId: i < 180 ? 'a' : 'b', chunkId:'plane',
        contact: {normal, velocity: new Vector3(), localPoint:point, triangle:i%2, geometryId:'mesh'}};
      const free = stepFlight(flight, NEUTRAL_INPUT, FLIGHT.fixedDt);
      const result = stepGlide(state, flight, free, hit, FLIGHT.fixedDt);
      expect(pos.distanceTo(result.flight.position)).toBeLessThan(1);
      expect(new Vector3().copy(result.flight.position).dot(normal)).toBeGreaterThan(5);
      flight = result.flight;
      state = result.state;
    }
    expect(state.phase).toBe('GLIDING');
    const up = new Vector3(0,1,0).applyEuler(new Euler(flight.attitude.pitch,flight.attitude.yaw,flight.attitude.roll,'YXZ'));
    expect(up.dot(normal)).toBeCloseTo(1);
    expect(toggleGlide(state).phase).toBe('DETACHING');
    expect(stepGlide(state, flight, flight, null, FLIGHT.fixedDt).state.phase).toBe('RECOVERY');
  });

  it('preserves inverted attitude and moving-surface momentum on the first tick after contact loss', () => {
    const flight = createFlightState({ position: { x: 0, y: 80, z: 0 }, yaw: 0 });
    flight.attitude.roll = Math.PI;
    flight.velocity.x = 18;
    const dt = FLIGHT.fixedDt;
    const free = stepFlight(flight, NEUTRAL_INPUT, dt);
    const result = stepGlide({ phase: 'GLIDING', time: 1 }, flight, free, null, dt);
    const orientation = (attitude: typeof flight.attitude) => new Quaternion().setFromEuler(
      new Euler(attitude.pitch, attitude.yaw, attitude.roll, 'YXZ'));
    expect(result.state.phase).toBe('RECOVERY');
    expect(orientation(result.flight.attitude).angleTo(orientation(flight.attitude))).toBeLessThanOrEqual(3.1 * dt + 1e-8);
    expect(new Vector3().copy(result.flight.velocity).distanceTo(flight.velocity)).toBeLessThanOrEqual(110 * dt + 1e-8);
  });

  it('preserves flight outside capture range and separates assisted scores', () => {
    const flight = createFlightState({position:{x:0,y:200,z:0},yaw:0});
    const free = stepFlight(flight, NEUTRAL_INPUT, FLIGHT.fixedDt);
    const result = stepGlide(toggleGlide(freeGlide()), flight, free, null, FLIGHT.fixedDt);
    expect(result.state.phase).toBe('ARMED');
    expect(result.flight).toBe(free);
    expect(bestStorageKey({...defaultScoreContext,surfaceGlide:true})).not.toBe(bestStorageKey(defaultScoreContext));
  });
});

it('captures streaming waits shorter than one frame and measures open intervals', () => {
  const events = new BufferingEvents();
  events.set(true, 5);
  events.set(true, 6);
  events.set(false, 8);
  events.set(true, 9);
  expect(events.snapshot(10)).toMatchObject({entries:2, completedMs:3, currentMs:1, totalMs:4});
  expect(events.snapshot(10).recent.map(event => event.atMs)).toEqual([5,8,9]);
});
