import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { DEFAULT_CONTROLS } from '../../src/flight/controlSettings';
import { createFlightState, FLIGHT, NEUTRAL_INPUT, stepFlight } from '../../src/flight/flightModel';
import { freeGlide, glideRange, needsGlideContact, stepGlide, toggleGlide } from '../../src/flight/surfaceGlide';
import { COLLISION_RADIUS } from '../../src/game/runRules';
import { flightWouldCollide, resolveShield } from '../../src/game/shield';
import { WorldImporter } from '../../src/world/imports/worldImporter';
import { defaultWorldImportOptions } from '../../src/world/imports/worldManifest';

const rows = [
  { seed: 8131, profile: 'cruise', releaseFrame: 48, sha256: 'ea7a65d31b4d35dbf200d255181663b16ac1bd33be3d7600fdf93f6a1c8d2f91' },
  { seed: 8132, profile: 'boost', releaseFrame: 48, sha256: 'f569312a5736222e16124c68886d30de7679397b88c705656a1d769fddb9266e' },
  { seed: 95603, profile: 'cruise', releaseFrame: 36, sha256: '78588147dbc5c430676602bd250f07febca5fe9fee563722c521662dfd4276c1' },
];

// The browser polls LB before advancing the next frame. Each recorded input
// interval contains 64 ms of 120 Hz physics, including its fractional carry.
const completedSteps = (frame: number) => Math.floor(frame * 64 * 120 / 1000);

it.each(rows)('holds the imported ribbon $seed at $profile until manual release', async ({ seed, profile, releaseFrame, sha256 }) => {
  const name = `ribbon-bridge-${seed}-${profile}.glb`;
  const bytes = await readFile(new URL(`../fixtures/ribbon-bridge/${name}`, import.meta.url));
  const world = await new WorldImporter().load(Uint8Array.from(bytes).buffer, name,
    defaultWorldImportOptions, () => {}, { fingerprint: sha256, variant: 0, exact: true });
  try {
    const dt = FLIGHT.fixedDt, input = { ...NEUTRAL_INPUT, boost: profile === 'boost' };
    const context = { world, worldUp: world.root.up, bodyRadius: COLLISION_RADIUS, input };
    let flight = createFlightState(world.getDefaultSpawn()), glide = freeGlide();
    let firstSteadyStep = 0;
    const releaseStep = completedSteps(releaseFrame) + 1;
    for (let step = 1; step <= completedSteps(releaseFrame + 16); step++) {
      if (step === releaseStep) expect(glide.phase).toBe('GLIDING');
      if (step === completedSteps(4) + 1 || step === releaseStep) glide = toggleGlide(glide);
      const free = stepFlight(flight, input, dt, DEFAULT_CONTROLS);
      const hit = needsGlideContact(glide) && !glide.trajectory ? world.queryGlide(flight.position, glideRange) : null;
      const next = stepGlide(glide, flight, free, hit, dt, context);
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
});
