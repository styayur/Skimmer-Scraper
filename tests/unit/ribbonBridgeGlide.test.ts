import { readFile } from 'node:fs/promises';
import { Euler, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { DEFAULT_CONTROLS } from '../../src/flight/controlSettings';
import { createFlightState, FLIGHT, NEUTRAL_INPUT, stepFlight } from '../../src/flight/flightModel';
import { freeGlide, glideRange, needsGlideContact, stepGlide, toggleGlide } from '../../src/flight/surfaceGlide';
import { COLLISION_RADIUS } from '../../src/game/runRules';
import { flightWouldCollide, resolveShield } from '../../src/game/shield';
import { WorldImporter } from '../../src/world/imports/worldImporter';
import { defaultWorldImportOptions } from '../../src/world/imports/worldManifest';

const ribbons = {
  8131: { profile: 'cruise', sha256: 'ea7a65d31b4d35dbf200d255181663b16ac1bd33be3d7600fdf93f6a1c8d2f91' },
  8132: { profile: 'boost', sha256: 'f569312a5736222e16124c68886d30de7679397b88c705656a1d769fddb9266e' },
  95603: { profile: 'cruise', sha256: '78588147dbc5c430676602bd250f07febca5fe9fee563722c521662dfd4276c1' },
  104729: { profile: 'boost', sha256: '269abb1b4ee7832b0af77d491f3837d55738880831d5628b7e992a11b1472997' },
};

// The browser polls LB before advancing the next frame. Each recorded input
// interval contains 64 ms of 120 Hz physics, including its fractional carry.
const completedSteps = (frame: number) => Math.floor(frame * 64 * 120 / 1000);

async function replay(seed: keyof typeof ribbons, boost: boolean, releaseFrame: number) {
  const { profile, sha256 } = ribbons[seed];
  const name = `ribbon-bridge-${seed}-${profile}.glb`;
  const bytes = await readFile(new URL(`../fixtures/ribbon-bridge/${name}`, import.meta.url));
  const world = await new WorldImporter().load(Uint8Array.from(bytes).buffer, name,
    defaultWorldImportOptions, () => {}, { fingerprint: sha256, variant: 0, exact: true });
  try {
    const dt = FLIGHT.fixedDt, input = { ...NEUTRAL_INPUT, boost };
    const context = { world, worldUp: world.root.up, bodyRadius: COLLISION_RADIUS, input, settings: DEFAULT_CONTROLS };
    let flight = createFlightState(world.getDefaultSpawn()), glide = freeGlide();
    let firstSteadyStep = 0;
    const releaseStep = completedSteps(releaseFrame) + 1;
    for (let step = 1; step <= completedSteps(releaseFrame + 16); step++) {
      if (step === releaseStep) expect(glide.phase).toBe('GLIDING');
      if (step === completedSteps(4) + 1 || step === releaseStep) glide = toggleGlide(glide);
      const free = stepFlight(flight, input, dt, DEFAULT_CONTROLS);
      const hit = needsGlideContact(glide) && !glide.trajectory ? world.queryGlide(flight.position, glideRange) : null;
      const next = stepGlide(glide, flight, free, hit, dt, context);
      if (glide.phase === 'DETACHING') {
        const rotation = (a: typeof flight.attitude) => new Quaternion().setFromEuler(new Euler(a.pitch, a.yaw, a.roll, 'YXZ'));
        expect(rotation(flight.attitude).angleTo(rotation(next.flight.attitude))).toBeLessThanOrEqual(3.1 * dt + 1e-6);
        expect(new Vector3().copy(flight.velocity).distanceTo(next.flight.velocity)).toBeLessThanOrEqual(110 * dt + 1e-7);
      }
      world.stepMotion(dt);
      expect(flightWouldCollide(flight, next.flight, world), `Challenge collision at step ${step}`).toBe(false);
      const shield = resolveShield(flight, next.flight, world);
      expect(shield.impact, `Shield impact at step ${step}`).toBe(false);
      flight = shield.flight;
      glide = next.state;
      if (glide.phase === 'GLIDING' && !firstSteadyStep) firstSteadyStep = step;
      if (firstSteadyStep && step < releaseStep) expect(glide.phase, `Contact lost at step ${step}`).toBe('GLIDING');
      if (step === releaseStep) expect(glide.phase).toBe('DETACHING');
    }
    expect(firstSteadyStep).toBeGreaterThan(completedSteps(4));
    expect(firstSteadyStep - completedSteps(4)).toBeLessThanOrEqual(2 / dt);
    expect(glide.phase).toBe('FLIGHT');
  } finally {
    world.dispose();
  }
}

it.each([[8131, false, 48], [8132, true, 48], [95603, false, 36]] as const)(
  'holds the public ribbon %i through manual release', replay);

it.each([8131, 8132, 95603] as const)('clears boost departures from five public release positions on %i', async seed => {
  for (const frame of [24, 32, 40, 48, 56]) await replay(seed, true, frame);
});

it('replays the previously held-out 104729 boost impact through the original post-LB window',
  () => replay(104729, true, 48));
