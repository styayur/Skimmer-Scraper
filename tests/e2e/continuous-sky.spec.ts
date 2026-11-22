import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('five crossings carry both camera modes and keep the changing mirror skyline out of the collision world', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?autostart=1&seed=334458&gen=3');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  const approach = [
    { pitch: 0.75, roll: 1.56, yaw: 0 },
    { pitch: 1.16, roll: 3.08, yaw: 0.42 },
    { pitch: 1.31, roll: -1.57, yaw: -0.37 },
    { pitch: 1.63, roll: -2.83, yaw: 1.62 },
    { pitch: 1.03, roll: 0.73, yaw: -2.23 },
  ];
  const evidence = 'evidence/v0.5/pr4-sky';
  mkdirSync(evidence, { recursive: true });
  const initial = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
  expect(initial.render.mirrorSky.ground?.triangles).toBe(64);
  const trace = [];
  for (const [offset, attitude] of approach.entries()) {
    if (offset > 0) await page.keyboard.press('c');
    const index = offset + 1;
    await page.evaluate(async ({ attitude, index }) => {
      const game = window.__SKIMMER_SCRAPER__!;
      game.pause();
      if (index === 1) {
        await game.setPose({ x: 0, y: 436, z: 120 }, { pitch: 0.52, roll: 0, yaw: 0 });
        return;
      }
      await game.setPose({ x: 0, y: 487, z: 120 }, attitude);
    }, { attitude, index });
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    if (index === 1 || index === 4) await page.screenshot({ path: `${evidence}/sky-${index}.png` });
    const result = await page.evaluate(async ({ attitude, index }) => {
      const game = window.__SKIMMER_SCRAPER__!;
      const before = game.snapshot();
      const mirrorSurface = game.surface({ x: before.position.x, y: before.position.y + 330, z: before.position.z - 500 }, 50);
      await game.setPose({ x: 0, y: 519, z: 120 }, attitude);
      game.resume();
      const frames = [];
      const deadline = performance.now() + 45_000;
      for (;;) {
        await new Promise(requestAnimationFrame);
        const state = game.snapshot();
        const { attitude, velocity, speed, cameraOrientation, cameraPosition, renderOrigin, position, surfaceDistance } = state;
        frames.push({ phase: state.journey.phase, attitude, velocity, speed, cameraOrientation,
          cameraOffset: [cameraPosition.x + renderOrigin.x - position.x,
            cameraPosition.y + renderOrigin.y - position.y, cameraPosition.z + renderOrigin.z - position.z], surfaceDistance });
        if (state.journey.crossings >= index || state.mode !== 'running' || performance.now() > deadline) {
          if (state.journey.crossings >= index) {
            // Let ordinary low-altitude flight rearm the next crossing before staging the approach.
            for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
          }
          game.pause();
          return { before, frames, after: state, mirrorSurface };
        }
      }
    }, { attitude, index });
    const { before, frames, after } = result;
    expect(after.journey.crossings, `crossing ${index}, observed ${[...new Set(frames.map(frame => frame.phase))].join(', ')}`).toBe(index);
    const lastInversion = frames.filter(frame => frame.phase === 'INVERSION').at(-1)!;
    const firstDive = frames.find(frame => frame.phase === 'DIVE')!;
    const lastDive = frames.filter(frame => frame.phase === 'DIVE').at(-1)!;
    expect(lastInversion).toBeDefined();
    expect(firstDive).toBeDefined();
    expect(lastDive).toBeDefined();
    expect(firstDive.speed).toBeCloseTo(lastInversion.speed, 8);
    expect(Math.abs(firstDive.attitude.roll - lastInversion.attitude.roll)).toBeLessThan(0.18);
    expect(Math.abs(lastDive.attitude.roll - lastInversion.attitude.roll)).toBeLessThan(0.22);
    const orientationDot = Math.abs(lastInversion.cameraOrientation.reduce(
      (dot, component, axis) => dot + component * firstDive.cameraOrientation[axis]!, 0,
    ));
    expect(orientationDot).toBeGreaterThan(0.9);
    const seamMotion = Math.hypot(...firstDive.cameraOffset.map((axis, i) => axis - lastInversion.cameraOffset[i]!));
    expect(seamMotion).toBeLessThan(12);
    expect(frames.filter(frame => frame.phase === 'DIVE' || frame.phase === 'RECOVERY')
      .every(frame => frame.surfaceDistance === null || frame.surfaceDistance >= 6.5)).toBe(true);
    expect(after.mode).toBe('running');
    expect(after.cameraMode).toBe(offset % 2 === 0 ? 'chase' : 'cockpit');
    expect(after.companions).toHaveLength(3);
    expect(after.companions.every(agent => agent.deployed && !agent.uncovered)).toBe(true);
    expect(after.worldReleases.every(world => world.bvhAfter === 0 && world.rootChildrenAfter === 0)).toBe(true);
    expect(after.streaming!.bvhCount).toBeLessThanOrEqual(41);
    expect(after.render.mirrorSky.triangles).toBe(initial.render.mirrorSky.triangles);
    expect(after.render.mirrorSky.ground).toEqual(initial.render.mirrorSky.ground);
    expect(after.render.mirrorSky.seed).toBe(after.seed);
    expect(after.render.mirrorSky.seed).not.toBe(before.render.mirrorSky.seed);
    expect(before.render.mirrorSky.cameraOffset).toBe(0);
    expect(after.render.mirrorSky.cameraOffset).toBe(0);
    expect(result.mirrorSurface).toBeNull();
    trace.push({ ...result, orientationDot, seamMotion });
    await page.evaluate(() => window.__SKIMMER_SCRAPER__!.resume());
  }
  expect(errors).toEqual([]);
  writeFileSync(`${evidence}/five-crossings.json`, JSON.stringify({ approach, initial, trace, errors }, null, 2));
});
