import { BoxGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, Vector3, BufferGeometry, Float32BufferAttribute } from 'three';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { FixedStepRunner } from '../../src/core/fixedStep';
import { createFlightState, FLIGHT, NEUTRAL_INPUT, stepFlight, type FlightState } from '../../src/flight/flightModel';
import { freeGlide, glideChangedMotion, glideRange, stepGlide, toggleGlide } from '../../src/flight/surfaceGlide';
import { glideTuning, planRedirect, type GlideContext } from '../../src/flight/surfaceTrajectory';
import * as trajectories from '../../src/flight/surfaceTrajectory';
import { streamingForecast } from '../../src/flight/streamingForecast';
import { DEFAULT_CONTROLS } from '../../src/flight/controlSettings';
import { flightWouldCollide, resolveShield } from '../../src/game/shield';
import { COLLISION_RADIUS } from '../../src/game/runRules';
import { ChunkedWorldAdapter } from '../../src/world/chunkedWorldAdapter';
import { UnifiedSurfaceQuery } from '../../src/world/unifiedSurfaceQuery';

const dt = FLIGHT.fixedDt;
const point = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
class Fixture extends UnifiedSurfaceQuery {
  readonly solids: ChunkedWorldAdapter;
  covered = true;
  chords = 0;
  constructor() {
    const adapter = new ChunkedWorldAdapter();
    super(adapter);
    this.solids = adapter;
  }
  add(id: string, geometry: BufferGeometry) {
    geometry.computeBoundingBox();
    this.solids.addChunk({ id, origin: point(), chunkX: 0, chunkZ: 0, geometry, bounds: geometry.boundingBox! });
  }
  box(id: string, size: Vector3, center: Vector3) {
    this.add(id, new BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z));
  }
  isGlideVolumeCovered() { return this.covered; }
  override glideChordClear(...args: Parameters<UnifiedSurfaceQuery['glideChordClear']>) {
    this.chords++;
    return super.glideChordClear(...args);
  }
}
function wallWorld() {
  const world = new Fixture();
  world.box('thin wall', point(650, 650, 0.12), point(0, 0, -0.06));
  return world;
}
const context = (world: Fixture, acceleration: number = glideTuning.acceleration): GlideContext =>
  ({ world, acceleration, worldUp: point(0, 1, 0), bodyRadius: COLLISION_RADIUS });
const rotation = (f: FlightState) => new Quaternion().setFromEuler(new Euler(f.attitude.pitch, f.attitude.yaw, f.attitude.roll, 'YXZ'));
const incoming = (speed = 84, z = 42, yaw = 0) => createFlightState({ position: point(0, 0, z), speed, yaw });

function replay(world: Fixture, initial: FlightState, ctx = context(world), fps = 60, seconds = 2) {
  const runner = new FixedStepRunner(dt);
  let flight = initial, state = toggleGlide(freeGlide()), impacted = false, assisted = false;
  let minDistance = Infinity, maxAcceleration = 0, maxTurnRate = 0, redirectTime = 0, speedRetention = 1;
  let maxSettledError = 0, glideSeconds = 0, glideDistance = 0, minSpeed = initial.speed, maxSpeed = initial.speed;
  const phases: string[] = [];
  for (let frame = 0; frame < Math.round(seconds * fps) && !impacted; frame++) {
    runner.advance(1 / fps, () => {
      if (impacted) return;
      const free = stepFlight(flight, ctx.input ?? NEUTRAL_INPUT, dt);
      const result = stepGlide(state, flight, free, world.queryGlide(flight.position, glideRange), dt, ctx);
      impacted = flightWouldCollide(flight, result.flight, world);
      assisted ||= glideChangedMotion(free, result.flight);
      const near = world.queryNearest(result.flight.position, 100);
      minDistance = Math.min(minDistance, near?.distance ?? Infinity);
      if (result.state.phase === 'REDIRECT' || result.state.phase === 'TRANSFER' || result.state.phase === 'ESCAPE') {
        maxAcceleration = Math.max(maxAcceleration, point().copy(result.flight.velocity).distanceTo(flight.velocity) / dt);
        maxTurnRate = Math.max(maxTurnRate, rotation(result.flight).angleTo(rotation(flight)) / dt);
        speedRetention = Math.min(speedRetention, result.flight.speed / initial.speed);
        redirectTime += dt;
      }
      if (result.state.phase === 'GLIDING') {
        glideSeconds += dt;
        glideDistance += point().copy(result.flight.position).distanceTo(flight.position);
      }
      minSpeed = Math.min(minSpeed, result.flight.speed);
      maxSpeed = Math.max(maxSpeed, result.flight.speed);
      if (result.state.phase === 'GLIDING' && near) maxSettledError = Math.max(maxSettledError, Math.abs(near.distance - 6));
      if (phases.at(-1) !== result.state.phase) phases.push(result.state.phase);
      flight = result.flight;
      state = result.state;
    });
  }
  return { phases, flight, state, impacted, assisted, minDistance, maxAcceleration, speedRetention,
    maxTurnRate, redirectTime, maxSettledError, glideSeconds, glideDistance, minSpeed, maxSpeed, chords: world.chords };
}

describe('finite-mesh surface manoeuvres', () => {
  it('sweeps speed, approach angle, trigger distance and acceleration at fixed 120 Hz', () => {
    const started = performance.now();
    const actualPlanRedirect = trajectories.planRedirect;
    const durationsMs: number[] = [];
    let accepted = 0;
    const spy = vi.spyOn(trajectories, 'planRedirect').mockImplementation((flight, ctx) => {
      const start = performance.now();
      const plan = actualPlanRedirect(flight, ctx);
      const elapsed = performance.now() - start;
      durationsMs.push(elapsed);
      if (plan) accepted++;
      return plan;
    });
    onTestFinished(() => { spy.mockRestore(); });
    const rows = [];
    const planner = [];
    for (const acceleration of [180, 260, 320, 440, 560, 680]) {
      durationsMs.length = 0;
      accepted = 0;
      let captured = 0, escaped = 0, rejected = 0, clearance = Infinity, maxAcceleration = 0, peakTurn = 0;
      let longest = 0, retention = 1, error = 0, chords = 0;
      for (const speed of [48, 76, 102]) for (const yaw of [0, 0.35]) for (const z of [14, 40, 76]) {
        const world = wallWorld();
        const r = replay(world, incoming(speed, z, yaw), context(world, acceleration), 60, 3);
        if (r.impacted) {
          expect(r.assisted, JSON.stringify({ speed, z, yaw, acceleration, phases: r.phases, pos: r.flight.position })).toBe(false);
          rejected++;
        } else {
          expect(r.phases.some(phase => phase === 'REDIRECT' || phase === 'ESCAPE')).toBe(true);
          if (!r.phases.includes('ESCAPE')) expect(r.state.phase).toBe('GLIDING');
          expect(r.assisted).toBe(true);
          expect(r.minDistance).toBeGreaterThan(COLLISION_RADIUS);
          expect(r.maxAcceleration).toBeLessThanOrEqual(acceleration + 1e-5);
          expect(r.maxTurnRate).toBeLessThanOrEqual(glideTuning.attitudeRate + 0.001);
          expect(r.maxSettledError).toBeLessThan(1);
          clearance = Math.min(clearance, r.minDistance);
          maxAcceleration = Math.max(maxAcceleration, r.maxAcceleration);
          peakTurn = Math.max(peakTurn, r.maxTurnRate);
          longest = Math.max(longest, r.redirectTime);
          retention = Math.min(retention, r.speedRetention);
          error = Math.max(error, r.maxSettledError);
          chords += r.chords;
          if (r.phases.includes('ESCAPE')) escaped++;
          else captured++;
        }
      }
      expect(captured).toBeGreaterThan(6);
      expect(rejected).toBeGreaterThan(0);
      expect(accepted).toBeLessThanOrEqual(captured + escaped);
      rows.push({ acceleration, captured, escaped, rejected, clearance, maxAcceleration, peakTurn, longest, retention, error, chords });
      durationsMs.sort((a, b) => a - b);
      const calls = durationsMs.length;
      const total = durationsMs.reduce((sum, ms) => sum + ms, 0);
      const us = (ms: number) => Number((ms * 1000).toFixed(2));
      planner.push({ acceleration, calls, accepted, declined: calls - accepted, totalMs: Number(total.toFixed(3)),
        meanUs: us(total / calls), p95Us: us(durationsMs[Math.ceil(calls * 0.95) - 1]), maxUs: us(durationsMs[calls - 1]) });
    }
    console.table(rows);
    console.table(planner);
    const harnessMs = Math.round(performance.now() - started);
    console.info('108 fixture replays including collision oracle and assertions (ms)', harnessMs);
    expect(rows.every(r => r.captured + r.escaped + r.rejected === 18)).toBe(true);
    expect(rows.find(r => r.acceleration === 560)!.captured).toBeGreaterThan(12);
    const output = process.env.SKIMMER_GLIDE_SWEEP_REPORT;
    if (output) {
      writeFileSync(output, JSON.stringify({
        suite: 'tests/unit/surfaceTrajectory.test.ts', fixedHz: 120, planningHz: glideTuning.planningHz,
        chosenAccelerationMps2: glideTuning.acceleration,
        fixture: { wallThicknessM: 0.12, bodyRadiusM: COLLISION_RADIUS, startSpeedMps: [48, 76, 102],
          yawRad: [0, 0.35], armDistanceM: [14, 40, 76], seconds: 3 },
        results: rows, planner, harnessMs,
        timing: { method: 'performance.now around each real planRedirect call, in process, including BVH queries',
          node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model },
      }, null, 2) + '\n');
    }
  });

  it('replays identically at 20, 60 and 144 render frames/s', () => {
    const run = (fps: number) => { const world = wallWorld(); return replay(world, incoming(), context(world), fps); };
    const baseline = run(60);
    for (const fps of [20, 144]) {
      const result = run(fps);
      expect(result.flight).toEqual(baseline.flight);
      expect(result.phases).toEqual(baseline.phases);
    }
    expect(baseline.flight.velocity.y).toBeGreaterThan(45);
  });

  it('uses the world up direction and gives explicit pilot steering priority', () => {
    const world = wallWorld();
    const ctx = context(world);
    ctx.worldUp = point(0, -1);
    const inverted = replay(world, incoming(), ctx);
    expect(inverted.flight.velocity.y).toBeLessThan(-40);
    ctx.input = { ...NEUTRAL_INPUT, yaw: 1 };
    const turn = planRedirect(incoming(), ctx)!;
    expect(turn.legs.at(-1)!.to.x).toBeLessThan(-60);
  });

  it('climbs a wall, rounds its convex roof edge and launches with bounded momentum change', () => {
    const world = new Fixture();
    world.box('tower', point(240, 260, 420), point(0, -25, -210));
    const run = replay(world, incoming(), context(world), 30, 4.5);
    expect(run.phases).toEqual(['REDIRECT', 'ATTACHING', 'GLIDING', 'TRANSFER', 'GLIDING']);
    expect(run.impacted).toBe(false);
    expect(run.flight.position.y).toBeCloseTo(111, 1);
    expect(run.flight.velocity.z).toBeLessThan(-30);
    const state = toggleGlide(run.state);
    const released = stepGlide(state, run.flight, stepFlight(run.flight, NEUTRAL_INPUT, dt), null, dt);
    expect(released.state.phase).toBe('DETACHING');
    expect(point().copy(released.flight.velocity).distanceTo(run.flight.velocity)).toBeLessThanOrEqual(110 * dt + 1e-6);
    expect(toggleGlide(released.state)).toBe(released.state);
  });

  it('rejects unsupported endpoints, blocked escape routes and uncovered space', () => {
    const post = new Fixture();
    post.box('post', point(2, 2, 0.1), point());
    expect(planRedirect(incoming(), context(post))).toBeNull();
    const world = wallWorld();
    world.covered = false;
    expect(planRedirect(incoming(), context(world))).toBeNull();
    world.covered = true;
    for (const side of [-1, 1]) {
      world.box('side' + side, point(0.1, 250, 220), point(4 * side, 0, 0));
      world.box('lid' + side, point(250, 0.1, 220), point(0, 4 * side, 0));
    }
    expect(planRedirect(incoming(), context(world))).toBeNull();
    expect(flightWouldCollide(incoming(116, 9), incoming(116, -9), world)).toBe(true);
  });

  it('locks assistance on the first redirect and recovers when its support unloads', () => {
    const world = wallWorld(), flight = incoming();
    const armed = toggleGlide(freeGlide());
    const free = stepFlight(flight, NEUTRAL_INPUT, dt);
    const first = stepGlide(armed, flight, free, null, dt, context(world));
    expect(first.state.phase).toBe('REDIRECT');
    expect(glideChangedMotion(free, first.flight)).toBe(true);
    const forecast = streamingForecast(first.flight, DEFAULT_CONTROLS, first.state);
    expect(forecast.samples[0].position.y).toBeGreaterThan(1);
    expect(forecast.samples.at(-1)!.position.z).toBeCloseTo(6);
    expect(toggleGlide(first.state).phase).toBe('DETACHING');
    world.solids.removeChunk('thin wall');
    const next = stepGlide(first.state, first.flight, stepFlight(first.flight, NEUTRAL_INPUT, dt), null, dt, context(world));
    expect(next.state.phase).toBe('RECOVERY');
    const empty = stepGlide(armed, flight, free, null, dt, context(world));
    expect(glideChangedMotion(free, empty.flight)).toBe(false);
  });

  it('evaluates a translating obstacle at its crossing time and supports a moving target', () => {
    const world = new Fixture();
    const transform = (x: number) => new Matrix4().makeTranslation(x, 0, 0);
    world.dynamic.add('gate', 'moving', new BoxGeometry(0.1, 30, 30), transform(-21), false);
    world.dynamic.setTransform('gate', transform(-20), 0.05);
    expect(world.glideChordClear(point(), point(), 3.2, 0, 0.1)).toBe(true);
    expect(world.glideChordClear(point(), point(), 3.2, 0.9, 1.1)).toBe(false);
    world.dynamic.remove('gate');
    world.dynamic.add('carrier', 'moving', new BoxGeometry(300, 300, 0.1), transform(-0.1), true);
    world.dynamic.setTransform('carrier', transform(0), dt);
    const plan = planRedirect(incoming(), context(world))!;
    expect(plan.surfaceVelocity.x).toBeCloseTo(12);
    expect(plan.legs.at(-1)!.to.x).toBeCloseTo(12);
    world.dynamic.dispose();
  });

  it('retains a continuous chunk seam and recovers at a gap or concave obstruction', () => {
    const lane = (gap: number, obstacle: boolean) => {
      const world = new Fixture();
      world.box('first chunk', point(120, 1, 100), point(0, -0.5, 50));
      world.box('next chunk', point(120, 1, 180), point(0, -0.5, -90 - gap));
      if (obstacle) world.box('end wall', point(120, 40, 2), point(0, 20, -25));
      const start = createFlightState({ position: point(0, 6, 30), yaw: 0, speed: 66 });
      return replay(world, start, context(world), 20, 1.4);
    };
    expect(lane(0, false).phases).toEqual(['GLIDING']);
    expect(lane(12, false).phases).toContain('RECOVERY');
    const blocked = lane(0, true);
    expect(blocked.phases).toContain('RECOVERY');
    expect(blocked.phases).not.toContain('TRANSFER');
    expect(blocked.impacted).toBe(true);
  });

  it('chooses an open side when an obstacle blocks the default climb', () => {
    const world = wallWorld();
    // Obstacle-only geometry participates in the volume sweep.
    world.dynamic.add('overhang', 'fixtures', new BoxGeometry(180, 1, 70), new Matrix4().makeTranslation(0, 17, 0), false);
    const plan = planRedirect(incoming(), context(world))!;
    expect(Math.abs(plan.legs.at(-1)!.to.x)).toBeGreaterThan(60);
    world.dynamic.dispose();
  });

  it('leaves a late impact to the shield and Challenge collision paths', () => {
    const world = wallWorld(), ctx = context(world);
    const start = incoming(116, 3.8);
    const free = stepFlight(start, { ...NEUTRAL_INPUT, boost: true }, dt);
    const r = stepGlide(toggleGlide(freeGlide()), start, free, world.queryGlide(start.position, 11), dt, ctx);
    expect(r.flight).toBe(free);
    expect(r.state.phase).toBe('ARMED');
    expect(flightWouldCollide(start, r.flight, world)).toBe(true);
    expect(resolveShield(start, r.flight, world).impact).toBe(true);
  });

  it('hands vertical wall momentum back to neutral free flight clear of the tower', () => {
    const world = new Fixture(), ctx = context(world);
    world.box('tower', point(28, 240, 36), point(55, 120, -32));
    const run = replay(world, createFlightState({ position: point(55, 32, 70), yaw: 0 }), ctx, 60, 1.9);
    expect(run.state.phase).toBe('GLIDING');
    let flight = run.flight, state = toggleGlide(run.state);
    for (let i = 0; i < 120; i++) {
      const result = stepGlide(state, flight, stepFlight(flight, NEUTRAL_INPUT, dt), null, dt, ctx);
      expect(flightWouldCollide(flight, result.flight, world)).toBe(false);
      state = result.state;
      flight = result.flight;
    }
    expect(state.phase).toBe('FLIGHT');
    expect(flight.position.y).toBeGreaterThan(run.flight.position.y + 35);
  });

  it('escapes an obstacle-only dynamic mesh without attaching to it', () => {
    const world = new Fixture();
    world.dynamic.add('obstacle', 'gate', new BoxGeometry(8, 8, 1), new Matrix4(), false);
    const ctx = context(world);
    delete ctx.acceleration;
    const run = replay(world, incoming(76, 27), ctx, 60, 1.8);
    expect(run.phases).toContain('ESCAPE');
    expect(run.phases).not.toContain('GLIDING');
    expect(run.impacted).toBe(false);
    world.dynamic.dispose();
  });

  it('searches a side wall beyond glideRange and cancels or expires an unused window', () => {
    const wall = new Fixture();
    wall.box('side wall', point(1, 200, 400), point(0, 0, 0));
    const f = createFlightState({ position: point(18, 0, 55), speed: 66, yaw: 0 });
    const run = replay(wall, f);
    expect(run.impacted).toBe(false);
    expect(run.state.phase).toBe('GLIDING');
    const empty = new Fixture();
    expect(replay(empty, f, context(empty), 120, 239 / 120).state.phase).toBe('ARMED');
    const expired = replay(empty, f, context(empty), 120, 2);
    expect(expired.state.phase).toBe('FLIGHT');
    expect(expired.assisted).toBe(false);
    expect(toggleGlide(toggleGlide(freeGlide())).phase).toBe('FLIGHT');
  });

  it('replays finite meshes against the collision oracle and records continuous following', () => {
    const rows = [];
    const profiles: [string, (s: number) => number, number][] = [
      ['plane', () => 0, 2], ['slope', s => .15 * s, 2],
      ['S curve', s => 4 * Math.sin(s / 20), 2],
      ['concave bend', s => 0.003 * s * s, 2],
      ['convex bend', s => -0.003 * s * s, 2],
      ['folded faces', s => Math.abs((s + 50) % 28 - 14) * .17, 7],
      ['non-right convex corner', s => -Math.max(0, s - 35) * .45, 5],
      ['concave corner', s => Math.max(0, s - 35) * .42, 5],
      ['rough rock', s => .3 * Math.sin(s * .8) + 1.4 * Math.sin(s / 6), 1],
    ];
    for (const [name, height, spacing] of profiles) {
      const world = new Fixture(), vertices: number[] = [];
      for (let s = -40; s < 180; s += spacing) {
        const a = height(s), b = height(s + spacing), z = -s, end = -s - spacing;
        vertices.push(-36,a,z, 36,a,z, 36,b,end, -36,a,z, 36,b,end, -36,b,end);
      }
      const mesh = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
      world.add(name, mesh);
      const start = createFlightState({ position: point(0, height(0) + 6, 0), yaw: 0, speed: 56 });
      const run = replay(world, start, context(world), 60, 1.8);
      expect(run.impacted, name).toBe(false);
      expect(run.minDistance, name).toBeGreaterThan(COLLISION_RADIUS);
      expect(run.glideSeconds, name).toBeGreaterThan(1);
      rows.push({ name, seconds: run.glideSeconds, distance: run.glideDistance, clearance: run.minDistance,
        minSpeed: run.minSpeed, maxSpeed: run.maxSpeed, losses: run.phases.filter(p => p === 'REACQUIRE').length, phases: run.phases });
    }
    const output = process.env.SKIMMER_GEOMETRY_REPORT;
    if (output) writeFileSync(output, JSON.stringify(rows, null, 2) + '\n');
  });

  it('compares the shipping two-level controller with a fixed 260 cap at late trigger distances', () => {
    const rows = [];
    for (const mode of ['fixed-260', 'shipping']) {
      for (const speed of [48, 76, 102]) for (const z of [4, 10, 14, 22, 35]) {
        const world = wallWorld(), ctx = context(world);
        if (mode === 'shipping') delete ctx.acceleration;
        const run = replay(world, incoming(speed, z), ctx, 60, 2.5);
        if (run.impacted) expect(run.assisted).toBe(false);
        else expect(run.minDistance).toBeGreaterThan(COLLISION_RADIUS);
        rows.push({mode, speed, z, phases:run.phases, impacted:run.impacted, assisted:run.assisted,
          clearance:run.minDistance, peakAcceleration:run.maxAcceleration, speedRetention:run.speedRetention});
      }
    }
    const successes = rows.filter(row => !row.impacted);
    expect(successes.filter(row => row.mode === 'shipping').length)
      .toBeGreaterThan(successes.filter(row => row.mode === 'fixed-260').length);
    const output = process.env.SKIMMER_LATE_REPORT;
    if (output) writeFileSync(output, JSON.stringify(rows, null, 2) + '\n');
  });

  it('crosses a short seam and releases before free space can be treated as a continuous wall', () => {
    const makeLane = (gap: number) => {
      const world = new Fixture();
      world.box('first slab', point(70, 1, 50), point(0, -0.5, 25));
      world.box('second slab', point(70, 1, 160), point(0, -0.5, -80 - gap));
      for (const x of [-12, 12]) world.box('canyon side ' + x, point(1, 55, 220), point(x, 24, -30));
      return world;
    };
    const flight = createFlightState({position:point(0,6,24),yaw:0,speed:60});
    for (const gap of [1, 18]) {
      const world = makeLane(gap);
      const run = replay(world, flight, context(world), 60, 1.6);
      expect(run.impacted).toBe(false);
      expect(run.phases.includes('RECOVERY')).toBe(gap === 18);
      expect(run.state.phase).toBe(gap === 1 ? 'GLIDING' : 'FLIGHT');
    }
  });

  it.each([48, 76, 102])('follows or safely leaves a tight convex cylinder at %i m/s', speed => {
    const world = new Fixture();
    world.add('tower', new CylinderGeometry(18, 18, 400, 96).rotateZ(Math.PI / 2).translate(0, -18, 0));
    const start = createFlightState({ position: point(0, 6, 0), yaw: 0, speed });
    const run = replay(world, start, context(world), 60, 3);
    expect(run.impacted).toBe(false);
    expect(run.minDistance).toBeGreaterThan(5.8);
    if (speed === 102) {
      expect(run.phases).toContain('RECOVERY');
      expect(run.state.phase).toBe('FLIGHT');
    } else {
      expect(run.glideDistance).toBeGreaterThan(165);
      expect(run.glideSeconds).toBeGreaterThan(2.95);
      expect(run.phases).not.toContain('REACQUIRE');
    }
  });

  it('keeps contact over gently changing finite triangle normals', () => {
    const world = new Fixture();
    world.add('curve', new CylinderGeometry(100, 100, 450, 128).rotateZ(Math.PI / 2).translate(0, -100, 0));
    const f = createFlightState({ position: point(0, 6, 0), yaw: 0, speed: 48 });
    const run = replay(world, f, context(world), 30, 0.8);
    expect(run.state.phase).toBe('GLIDING');
    expect(run.minDistance).toBeGreaterThan(COLLISION_RADIUS);
  });
});

