import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONTROLS } from '../../src/flight/controlSettings';
import { createFlightState, FLIGHT, NEUTRAL_INPUT, stepFlight, type FlightInput, type FlightState } from '../../src/flight/flightModel';
import { freeGlide, glideRange, stepGlide, toggleGlide } from '../../src/flight/surfaceGlide';
import { COLLISION_RADIUS } from '../../src/game/runRules';
import { flightWouldCollide, resolveShield } from '../../src/game/shield';
import { ChunkedWorldAdapter } from '../../src/world/chunkedWorldAdapter';
import { UnifiedSurfaceQuery } from '../../src/world/unifiedSurfaceQuery';
import { createGlideCourse } from '../fixtures/glideCourses';
import type { SurfaceProvider } from '../../src/world/worldTypes';
import type { Vec3 } from '../../src/core/math';

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const dt = FLIGHT.fixedDt;

class CourseWorld extends UnifiedSurfaceQuery {
  readonly keys = new Map<string, string>();
  covered = true;
  covers = (_center: Vec3, _radius: number) => true;
  advance = (_time: number) => {};
  constructor(readonly chunks = new ChunkedWorldAdapter()) { super(chunks); }
  add(id: string, geometry: BufferGeometry) {
    geometry.computeBoundingBox();
    this.chunks.addChunk({ id, geometry, bounds: geometry.boundingBox!, origin: v(), chunkX: 0, chunkZ: 0,
      logicalSurfaceAt: this.keys.has(id) ? () => this.keys.get(id) : undefined });
  }
  isGlideVolumeCovered(center: Vec3, radius: number) { return this.covered && this.covers(center, radius); }
}

function fly(world: CourseWorld, start: FlightState, seconds: number,
  input: (t: number) => FlightInput = () => NEUTRAL_INPUT, profile: 'classic' | 'precision' = 'precision') {
  let flight = start, state = toggleGlide(freeGlide());
  let minSwept = 20, minSpeed = start.speed, peakAcceleration = 0, shieldImpacts = 0, collisions = 0;
  let glideDistance = 0, glideSeconds = 0, longest = 0, continuous = 0, uncoveredTicks = 0, contactLosses = 0;
  const phases: { phase: string; time: number }[] = [], surfaces: string[] = [];
  const ctx = { world, worldUp: v(0, 1), bodyRadius: COLLISION_RADIUS };
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) {
    const control = input(tick * dt);
    const free = stepFlight(flight, control, dt, { ...DEFAULT_CONTROLS, profile });
    const { flight: next, state: nextState } = stepGlide(state, flight, free,
      world.queryGlide(flight.position, glideRange), dt, { ...ctx, input: control });
    const length = v().copy(next.position).distanceTo(flight.position);
    const midpoint = v().copy(flight.position).lerp(next.position, 0.5);
    if (world.isGlideVolumeCovered(midpoint, COLLISION_RADIUS + length / 2)) {
      // The largest ball known clear along this entire chord is a lower
      // bound on centre clearance. Query before moving the world, like glide.
      let lo = 0, hi = minSwept + 0.04;
      if (!world.glideChordClear(flight.position, next.position, minSwept, 0, dt)) {
        for (let j = 0; j < 10; j++) {
          const r = (lo + hi) / 2;
          if (world.glideChordClear(flight.position, next.position, r, 0, dt)) lo = r;
          else hi = r;
        }
        minSwept = Math.min(minSwept, lo);
      }
    } else uncoveredTicks++;
    world.advance((tick + 1) * dt);
    if (flightWouldCollide(flight, next, world)) collisions++;
    if (resolveShield(flight, next, world).impact) shieldImpacts++;
    peakAcceleration = Math.max(peakAcceleration, v().copy(next.velocity).distanceTo(flight.velocity) / dt);
    minSpeed = Math.min(minSpeed, next.speed);
    if (nextState.phase === 'GLIDING') {
      glideDistance += length;
      glideSeconds += dt;
    }
    continuous = nextState.phase === 'GLIDING' || nextState.phase === 'TRANSFER' ? continuous + length : 0;
    longest = Math.max(longest, continuous);
    if (nextState.phase !== phases.at(-1)?.phase) {
      phases.push({ phase: nextState.phase, time: next.elapsed });
      if (nextState.phase === 'REACQUIRE') contactLosses++;
    }
    if (nextState.surfaceId && nextState.surfaceId !== surfaces.at(-1)) surfaces.push(nextState.surfaceId);
    flight = next;
    state = nextState;
    if (collisions || shieldImpacts) break;
  }
  return { phases, surfaces, lastPhase: state.phase, end: flight.position, gain: flight.position.y - start.position.y,
    seconds: flight.elapsed, entrySpeed: start.speed, endSpeed: flight.speed, minSpeed, peakAcceleration,
    minSwept, glideDistance, glideSeconds, longest, uncoveredTicks, contactLosses, collisions, shieldImpacts };
}

const rows: { fixture: string; profile: string; run: ReturnType<typeof fly> }[] = [];
afterAll(() => {
  if (process.env.SKIMMER_PATCH_REPORT) writeFileSync(process.env.SKIMMER_PATCH_REPORT,
    JSON.stringify({ fixedHz: 120, bodyRadiusM: COLLISION_RADIUS, rows }, null, 2) + '\n');
});

describe('rolling finite patch guidance', () => {
  for (const course of ['glide-helix', 'glide-gallery'] as const)
    for (const speed of [48, 76, 102]) for (const profile of ['precision', 'classic'] as const) {
      it(`${course} at ${speed} m/s in ${profile}`, () => {
        const world = new CourseWorld();
        const { geometry, spawn } = createGlideCourse(course);
        world.add(course, geometry);
        const helix = course === 'glide-helix';
        const run = fly(world, createFlightState({ position: spawn, yaw: 0, speed }),
          helix ? 4.4 : Math.min(2.9, 200 / speed), t => ({
            ...NEUTRAL_INPUT, boost: speed === 102, yaw: helix && t < 0.192 ? 1 : 0,
          }), profile);
        rows.push({ fixture: course, profile, run });
        expect(run.collisions + run.shieldImpacts).toBe(0);
        expect(run.minSwept).toBeGreaterThan(COLLISION_RADIUS);
        expect(run.peakAcceleration).toBeLessThanOrEqual(230.001);
        if (helix && speed === 102) {
          expect(['GLIDING', 'FLIGHT']).toContain(run.lastPhase);
        } else {
          expect(run.lastPhase).toBe('GLIDING');
          expect(run.longest).toBeGreaterThan(helix ? 215 : 140);
          expect(run.contactLosses).toBe(0);
          if (helix) expect(run.gain).toBeGreaterThan(40);
        }
      });
    }

  function foldedDeck(from: number, to: number) {
    const vertices: number[] = [];
    const point = (s: number, x: number) => [x, Math.max(0, s - 42) * 0.45 - Math.max(0, s - 98) * 0.72,
      -s + 0.42 * x];
    for (let s = from; s < to; s += 2) {
      const a = point(s, -32), b = point(s, 32), c = point(s + 2, 32), d = point(s + 2, -32);
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
  }

  it.each([48, 76, 102])('releases above the three-sheet lip and open gap at %i m/s', speed => {
    const world = new CourseWorld(), { geometry, spawn } = createGlideCourse('glide-gap');
    world.add('irregular junction', geometry);
    const run = fly(world, createFlightState({ position: spawn, yaw: 0, speed }), 2,
      () => ({ ...NEUTRAL_INPUT, boost: speed === 102 }));
    rows.push({ fixture: 'three-sheet junction', profile: 'precision', run });
    expect(run.lastPhase).toBe('FLIGHT');
    expect(run.phases.map(p => p.phase)).toContain('RECOVERY');
    expect(run.phases.every(p => p.phase !== 'TRANSFER')).toBe(true);
    expect(run.collisions + run.shieldImpacts).toBe(0);
  });

  it('accepts an untagged static provider with only present-pose contact queries', () => {
    const world = new CourseWorld();
    world.add('plane', foldedDeck(-80, 32));
    const legacy: SurfaceProvider = { queryNearest: world.queryNearest.bind(world), queryGlide: world.queryGlide.bind(world),
      glideChordClear: world.glideChordClear.bind(world), isGlideVolumeCovered: () => true };
    const flight = createFlightState({ position: v(0, 6, 20), yaw: 0 });
    const free = stepFlight(flight, NEUTRAL_INPUT, dt);
    const result = stepGlide(toggleGlide(freeGlide()), flight, free, legacy.queryGlide!(flight.position, 11), dt,
      { world: legacy, bodyRadius: COLLISION_RADIUS, worldUp: v(0, 1) });
    expect(result.state.phase).toBe('GLIDING');
  });

  it('crosses two oblique folds and a streamed seam in either visit order, including untagged chunks', () => {
    const replay = (tagged: boolean, reversed: boolean) => {
      const world = new CourseWorld(), left = foldedDeck(-40, 52), right = foldedDeck(52, 240);
      if (tagged) for (const id of ['a', 'b']) world.keys.set(id, 'course/atlas/deck');
      const entries: [string, BufferGeometry][] = [['a', left], ['b', right]];
      for (const [id, geometry] of reversed ? entries.reverse() : entries) world.add(id, geometry);
      world.advance = time => {
        if (Math.round(time / dt) === 32) world.chunks.removeChunk('b');
        if (Math.round(time / dt) === 40) world.add('b', foldedDeck(52, 240));
      };
      return fly(world, createFlightState({ position: v(0, 6, 0), yaw: 0, speed: 68 }), 2.95);
    };
    const tagged = replay(true, false);
    rows.push({ fixture: 'oblique streamed folds', profile: 'precision', run: tagged });
    expect(replay(true, true)).toEqual(tagged);
    expect(replay(false, true)).toEqual(tagged);
    expect(tagged.surfaces).toEqual(['a', 'b']);
    expect(tagged.lastPhase).toBe('GLIDING');
    expect(tagged.longest).toBeGreaterThan(110);
    expect(tagged.minSwept).toBeGreaterThan(COLLISION_RADIUS);
  });

  it.each([-1, 1])('takes the supported branch of a narrow ribbon bending toward x = %i', sign => {
    const world = new CourseWorld(), vertices: number[] = [];
    const corner = (s: number, side: number) => [sign * Math.max(0, s - 8) * 0.34 + side * 2.3, 0, -s];
    for (let s = -20; s < 140; s += 2) {
      const a = corner(s, -1), b = corner(s, 1), c = corner(s + 2, 1), d = corner(s + 2, -1);
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    world.add('ribbon', new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3)));
    const run = fly(world, createFlightState({ position: v(0, 6, 0), yaw: 0, speed: 56 }), 1.35);
    rows.push({ fixture: 'ribbon ' + sign, profile: 'precision', run });
    expect(run.lastPhase).toBe('GLIDING');
    expect(run.end.x * sign).toBeGreaterThan(17);
    expect(run.longest).toBeGreaterThan(70);
    expect(run.minSwept).toBeGreaterThan(5.4);
  });

  it.each(['missing coverage', 'new mesh epoch'])('releases for %s even with a matching logical key', reason => {
    const world = new CourseWorld();
    world.keys.set('a', 'course/atlas/deck');
    world.add('a', foldedDeck(-80, 32));
    world.advance = time => {
      if (Math.round(time / dt) !== 28) return;
      if (reason === 'missing coverage') world.covered = false;
      else world.add('a', foldedDeck(-80, 32));
    };
    const run = fly(world, createFlightState({ position: v(0, 6, 30), yaw: 0 }), 1.15);
    rows.push({ fixture: reason, profile: 'precision', run });
    expect(run.phases.some(p => p.phase === 'RECOVERY' && p.time < 0.51)).toBe(true);
    expect(run.lastPhase).toBe('FLIGHT');
    expect(run.collisions + run.shieldImpacts).toBe(0);
  });

  it('resolves an optional surface key on the live BVH in chunk-local coordinates', () => {
    const chunks = new ChunkedWorldAdapter(), geometry = foldedDeck(-40, 32);
    geometry.computeBoundingBox();
    chunks.addChunk({ id: 'lease', chunkX: 100, chunkZ: -150, origin: v(22000, 0, -33000),
      geometry, bounds: geometry.boundingBox!, logicalSurfaceAt: (p, face) => p.x > 0 && face >= 0 ? 'upper/deck' : undefined });
    expect(chunks.queryGlide(v(22003, 6, -33000), 9)?.contact?.logicalSurfaceId).toBe('upper/deck');
    expect(chunks.queryGlide(v(21997, 6, -33000), 9)?.contact?.logicalSurfaceId).toBeUndefined();
  });

  it.each([48, 76, 102])('checks swept clearance as the next collision lease reloads at %i m/s', speed => {
    const world = new CourseWorld();
    const right = () => new BoxGeometry(80, 1, 220).translate(0, -0.5, -110);
    world.add('a', new BoxGeometry(80, 1, 160).translate(0, -0.5, 80));
    world.add('b', right());
    world.covers = (center, radius) => center.z - radius > 0 || world.chunks.hasChunk('b');
    world.advance = time => {
      if (Math.round(time / dt) === 12) world.chunks.removeChunk('b');
      if (Math.round(time / dt) === 31) world.add('b', right());
    };
    const run = fly(world, createFlightState({ position: v(0, 6, 48), yaw: 0, speed }), 1.6,
      () => ({ ...NEUTRAL_INPUT, boost: speed === 102 }));
    rows.push({ fixture: 'reloaded seam', profile: 'precision', run });
    expect(run.surfaces).toEqual(['a', 'b']);
    expect(run.lastPhase).toBe('GLIDING');
    expect(run.contactLosses + run.uncoveredTicks + run.collisions + run.shieldImpacts).toBe(0);
    expect(run.minSwept).toBeGreaterThan(5.4);
  });

  it.each(['carrier', 'early crossing', 'occupied crossing'])('flies two translating meshes with %s', scenario => {
    const world = new CourseWorld();
    const matrix = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
    const crossing = scenario !== 'carrier', gateX = scenario === 'early crossing' ? 0 : -18;
    world.dynamic.add('carrier', 'lease', new BoxGeometry(26, 1, 200), matrix(-8 * dt, -0.5, -40), true);
    if (crossing) world.dynamic.add('crossing', 'lease', new BoxGeometry(10, 22, 12),
      matrix(gateX - 32 * dt, 6, -52), true);
    world.advance = time => {
      world.dynamic.setTransform('carrier', matrix(8 * time, -0.5, -40), dt);
      if (crossing) world.dynamic.setTransform('crossing', matrix(gateX + 32 * time, 6, -52), dt);
    };
    world.advance(0);
    const start = createFlightState({ position: v(0, 6, 0), yaw: 0, speed: 68 });
    start.velocity.x = 8;
    const run = fly(world, start, 1.6);
    rows.push({ fixture: scenario, profile: 'precision', run });
    expect(run.surfaces).toEqual(['carrier']);
    if (scenario === 'occupied crossing') {
      const released = run.phases.find(p => p.phase === 'RECOVERY');
      expect(released?.time).toBeLessThan(run.seconds);
      // Neutral free flight continues into this deliberately occupied exit.
      expect(run.collisions).toBe(1);
      expect(run.shieldImpacts).toBe(1);
    } else {
      expect(run.lastPhase).toBe('GLIDING');
      expect(run.end.x).toBeCloseTo(8 * run.seconds, 4);
      expect(run.minSwept).toBeGreaterThan(5.5);
    }
    world.dynamic.dispose();
  });
});
