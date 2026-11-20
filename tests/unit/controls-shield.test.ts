import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTROLS, normalizeControls, shapeAxis } from '../../src/flight/controlSettings';
import { GamepadInputSource } from '../../src/flight/gamepad';
import { createFlightState, stepFlight } from '../../src/flight/flightModel';
import { resolveShield } from '../../src/game/shield';
import type { SurfaceProvider } from '../../src/world/worldTypes';

const wall: SurfaceProvider = { queryNearest: (p, radius) => Math.abs(p.x) <= radius
  ? { distance: Math.abs(p.x), point: { x: 0, y: p.y, z: p.z }, chunkId: 'wall', surfaceId: 'thin' } : null };

describe('flight controls and shield', () => {
  it('removes stick drift, clamps values and supports precision curves', () => {
    expect(shapeAxis(0.1, 0.14, 1.4, 1)).toBe(0);
    expect(shapeAxis(0.4, 0.14, 2, 1)).toBeLessThan(0.2);
    expect(shapeAxis(NaN, 0.1, 1, 1)).toBe(0);
    expect(normalizeControls({ deadZone: 20, pitchAxis: -4 }).deadZone).toBe(0.4);
    expect(normalizeControls({ pitchAxis: -4 }).pitchAxis).toBe(0);
  });
  it('handles pad hotplug, button edges, disconnect and reconnect without stuck axes', () => {
    let pad: Gamepad | null = null;
    const source = new GamepadInputSource(() => [pad]);
    const actions: string[] = [];
    const poll = (): void => source.poll({ ...DEFAULT_CONTROLS }, action => actions.push(action));
    pad = { connected: true, index: 0, id: 'XInput', mapping: 'standard', axes: [0.7, -0.8, 0.1],
      buttons: Array.from({ length: 10 }, (_, i) => ({ pressed: i === 3, value: i === 7 ? 1 : 0 })) } as unknown as Gamepad;
    poll(); poll();
    expect(actions).toEqual(['camera']);
    expect(source.sample({ ...DEFAULT_CONTROLS }).pitch).toBeLessThan(0);
    expect(source.sample({ ...DEFAULT_CONTROLS }).boost).toBe(true);
    source.impact(); // no actuator
    const connected = pad;
    pad = null; poll(); expect(source.sample({ ...DEFAULT_CONTROLS }).roll).toBe(0);
    expect(source.device).toBe('Keyboard');
    pad = connected; poll();
    expect(source.device).toContain('Gamepad');
    expect(actions).toEqual(['camera','camera']);
  });
  it('preserves classic limits while allowing a controlled full roll', () => {
    let classic = createFlightState({ position: { x: 0, y: 100, z: 0 }, yaw: 0 });
    let precision = classic;
    for (let i = 0; i < 240; i++) {
      const input = { pitch: 0, roll: 1, yaw: 0, boost: true };
      classic = stepFlight(classic, input, 1 / 120);
      precision = stepFlight(precision, input, 1 / 120, normalizeControls({ levelAssist: 0 }));
    }
    expect(classic.attitude.roll).toBe(1.36);
    expect(precision.attitude.roll).toBeLessThan(0);
    expect(Object.values(precision.position).every(Number.isFinite)).toBe(true);
  });
  it('sweeps across a zero-thickness wall at extreme speed and reflects outside', () => {
    const previous = createFlightState({ position: { x: -20, y: 40, z: 0 }, yaw: -Math.PI / 2, speed: 116 });
    const next = { ...previous, position: { x: 20, y: 40, z: 0 } };
    const hit = resolveShield(previous, next, wall);
    expect(hit.impact).toBe(true);
    expect(hit.flight.position.x).toBeLessThan(-3.2);
    expect(hit.flight.velocity.x).toBeLessThan(0);
    expect(hit.flight.speed).toBeLessThan(previous.speed);
    let state = hit.flight;
    for (let i = 0; i < 120; i++) state = resolveShield(state, stepFlight(state, { pitch: 0, roll: 0, yaw: 0, boost: false }, 1 / 120), wall).flight;
    expect(state.position.x).toBeLessThan(-3.2);
  });
  it('ejects initial shallow penetration and is inert away from solids', () => {
    const previous = createFlightState({ position: { x: -0.5, y: 40, z: 0 }, yaw: 0 });
    const contact = resolveShield(previous, previous, wall);
    expect(contact.flight.position.x).toBeLessThan(-3.2);
    const safe = createFlightState({ position: { x: -20, y: 40, z: 0 }, yaw: 0 });
    expect(resolveShield(safe, safe, wall).flight).toBe(safe);
  });
  it('does not push a glancing impact into the opposite corridor wall', () => {
    const corridor: SurfaceProvider = { queryNearest: (p, radius) => {
      const x = p.x < 0 ? -3.4 : 3.4;
      const gap = Math.abs(x - p.x);
      return gap <= radius ? { distance: gap, point: { x, y: p.y, z: p.z }, chunkId: 'corridor', surfaceId: String(x) } : null;
    } };
    const previous = createFlightState({ position: { x: 0, y: 40, z: 0 }, yaw: -0.3 });
    const next = { ...previous, position: { x: 0.7, y: 40, z: -4 } };
    const result = resolveShield(previous, next, corridor);
    expect(corridor.queryNearest(result.flight.position, 5)!.distance).toBeGreaterThan(3.2);
  });
});
