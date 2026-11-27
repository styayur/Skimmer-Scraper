import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createWorldFixture } from '../fixtures/worldGlb';

test('Space redirects a head-on approach, climbs the imported tower and launches', async ({ page }, info) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 0 }));
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free', shield: true }));
  });
  await page.goto('/?seed=334458&gen=2');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.keyboard.press('g');
  const library = page.locator('#local-world-library');
  if (!await library.evaluate((el: HTMLDetailsElement) => el.open)) await library.locator(':scope > summary').click();
  await page.locator('#local-world-file').setInputFiles({
    name: 'glide-tower.glb', mimeType: 'model/gltf-binary', buffer: createWorldFixture('glide-tower'),
  });
  await page.locator('#local-world-analyze').click();
  const form = page.locator('#local-world-config');
  await expect(form).toBeVisible();
  const setup = form.locator('details').filter({ has: page.locator('#local-world-manual') });
  if (!await setup.evaluate((el: HTMLDetailsElement) => el.open)) await setup.locator(':scope > summary').click();
  await page.locator('#local-world-manual').check();
  for (const [name, value] of Object.entries({ x: 55, y: 32, z: 70, spawnYaw: 0 })) {
    await form.locator(`[name="${name}"]`).fill(String(value));
  }
  await page.locator('#local-world-save').uncheck();
  await page.locator('#local-world-apply').click();
  await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().localWorld?.manifest.name)).toBe('glide-tower');
  const geometry = await page.evaluate(() => {
    const game = window.__SKIMMER_SCRAPER__!;
    return { world: game.snapshot().localWorld, face: game.glideSurface({ x: 55, y: 32, z: -8 }, 8) };
  });
  expect(geometry.face?.distance).toBeCloseTo(6);
  expect(geometry.face?.contact?.normal.z).toBeCloseTo(1);
  expect(geometry.world?.spawn).toEqual({ x: 55, y: 32, z: 70 });

  // The browser supplies real key events and animation frames. Freeze time
  // before takeoff so screenshot encoding and a slow GPU cannot advance physics.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator('#start-button').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().mode)).toBe('running');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  const sample = () => page.evaluate(() => {
    const s = window.__SKIMMER_SCRAPER__!.snapshot();
    return { time: s.runTime, phase: s.glide.phase, mode: s.mode, position: s.position, velocity: s.velocity,
      attitude: s.attitude, speed: s.speed, clearance: s.surfaceDistance, assisted: s.surfaceGlideAssisted,
      impacts: s.shieldImpacts, shield: s.rules.shield, camera: s.cameraMode };
  });
  const trace = [await sample()];
  const advanceUntil = async (predicate: (s: typeof trace[number]) => boolean, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      await page.clock.runFor(32);
      const s = await sample();
      trace.push(s);
      expect(s.impacts).toBe(0);
      expect(s.mode).toBe('running');
      if (predicate(s)) return s;
    }
    throw new Error('Flight trace did not reach the requested phase. Last sample ' + JSON.stringify(trace.at(-1)));
  };
  try {
    expect(trace[0].shield).toBe(true);
    expect(trace[0].velocity.z).toBeLessThan(-60);
    await page.keyboard.press('Space');
    trace.push(await sample());
    expect(trace.at(-1)).toMatchObject({ phase: 'ARMED', assisted: false });
    const redirect = await advanceUntil(s => s.phase === 'REDIRECT', 100);
    expect(redirect.assisted).toBe(true);
    const climb = await advanceUntil(s => s.phase === 'GLIDING' && s.velocity.y > 40 && s.position.y > redirect.position.y + 12, 90);
    expect(climb.clearance).toBeCloseTo(6, 0);
    const screenshot = info.outputPath('wall-climb.png');
    await page.screenshot({ path: screenshot });
    await info.attach('wall climb', { path: screenshot, contentType: 'image/png' });
    await page.keyboard.press('Space');
    trace.push(await sample());
    expect(trace.at(-1)).toMatchObject({ phase: 'DETACHING', velocity: climb.velocity });
    const launch = await advanceUntil(s => s.phase === 'FLIGHT', 120);
    expect(launch.position.y).toBeGreaterThan(climb.position.y + 5);
    expect(launch.assisted).toBe(true);
    expect(launch.camera).toBe(climb.camera);
    await advanceUntil(s => s.time >= launch.time + 0.25, 20);
    expect(trace.every(s => s.clearance === null || s.clearance > 3.2)).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    const path = info.outputPath('surface-glide-trace.json');
    await writeFile(path, JSON.stringify({ seed: 334458, fixedHz: 120, sampleMs: 32, geometry, pageErrors, trace }, null, 2));
    await info.attach('surface glide state trace', { path, contentType: 'application/json' });
  }
});

