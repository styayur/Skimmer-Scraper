import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createGlideCourse } from '../fixtures/glideCourses';
import { createWorldFixture } from '../fixtures/worldGlb';

const reference = process.env.SKIMMER_GLIDE_REFERENCE_URL;
const scenarios = [
  { course: 'glide-helix', preset: 'kite-w', frames: 150 },
  { course: 'glide-gallery', preset: 'kite-s', frames: 86 },
  { course: 'glide-gallery', preset: 'procedural', frames: 86 },
  { course: 'glide-gap', preset: 'procedural', frames: 62 },
] as const;

for (const { course, preset, frames } of scenarios) test(`Space flight on the imported ${course} with ${preset}`,
  async ({ page, browser }, info) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 800, height: 480 });
    await page.clock.install();
    await page.addInitScript(id => {
      localStorage.setItem('skimmer-scraper.selected-model.v1', id);
      localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 0 }));
      localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free', shield: true }));
    }, preset);
    await page.goto((reference ?? '') + '/?seed=334458&gen=2');
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
    const build = await page.evaluate(async () => (await fetch('./build-info.json')).json());
    if (reference) expect(build).toMatchObject({ sourceCommit: '991138b8c67c188bd47731d6c193142750225818', dirty: false });
    await page.keyboard.press('g');
    const library = page.locator('#local-world-library');
    if (!await library.evaluate((el: HTMLDetailsElement) => el.open)) await library.locator(':scope > summary').click();
    const buffer = createWorldFixture(course);
    await writeFile(info.outputPath(course + '.glb'), buffer);
    await page.locator('#local-world-file').setInputFiles({ name: course + '.glb', mimeType: 'model/gltf-binary', buffer });
    await page.locator('#local-world-analyze').click();
    const form = page.locator('#local-world-config');
    await expect(form).toBeVisible();
    const setup = form.locator('details').filter({ has: page.locator('#local-world-manual') });
    if (!await setup.evaluate((el: HTMLDetailsElement) => el.open)) await setup.locator(':scope > summary').click();
    await page.locator('#local-world-manual').check();
    const { spawn, geometry } = createGlideCourse(course);
    geometry.dispose();
    for (const [name, value] of Object.entries({ x: spawn.x, y: spawn.y, z: spawn.z, spawnYaw: 0 })) {
      await form.locator(`[name="${name}"]`).fill(String(value));
    }
    await page.locator('#local-world-save').uncheck();
    await page.locator('#local-world-apply').click();
    await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().localWorld?.manifest.name)).toBe(course);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    // Start exactly on a mocked animation-frame boundary on both builds.
    // A fractional first frame otherwise moves key-up by one physics tick.
    await page.evaluate(() => { requestAnimationFrame(t => { document.documentElement.dataset.frameTime = String(t); }); });
    await page.clock.runFor(16);
    const offset = await page.evaluate(() => performance.now() - Number(document.documentElement.dataset.frameTime));
    if (offset > 0) await page.clock.runFor(16 - offset);
    await page.locator('#start-button').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().mode === 'running');
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    const sample = () => page.evaluate(() => {
      const s = window.__SKIMMER_SCRAPER__!.snapshot();
      return { time: s.runTime, phase: s.glide.phase, p: s.position, v: s.velocity, speed: s.speed,
        centerClearance: s.surfaceDistance, impacts: s.shieldImpacts, assisted: s.surfaceGlideAssisted,
        aircraft: s.selectedAircraft, mode: s.mode, camera: s.cameraMode, shield: s.rules.shield };
    });
    const trace = [await sample()];
    const inputs: { time: number; key: string }[] = [];
    const key = async (name: 'Space' | 'q-down' | 'q-up') => {
      inputs.push({ time: trace.at(-1)!.time, key: name });
      if (name === 'Space') await page.keyboard.press(name);
      else if (name === 'q-down') await page.keyboard.down('q');
      else await page.keyboard.up('q');
    };
    await key('Space');
    expect(await sample()).toMatchObject({ phase: 'ARMED', assisted: false, aircraft: preset, shield: true });
    for (let frame = 0; frame < frames + 28; frame++) {
      if (course === 'glide-helix' && frame === 0) await key('q-down');
      if (course === 'glide-helix' && frame === 6) await key('q-up');
      if (frame === frames && course !== 'glide-gap') await key('Space');
      await page.clock.runFor(32);
      trace.push(await sample());
      expect(Math.round(trace.at(-1)!.time * 120)).toBe(Math.floor((frame + 1) * 32 * 120 / 1000));
      if (frame === Math.floor(frames / 2)) {
        const path = info.outputPath(course + '.png');
        await page.screenshot({ path });
        await info.attach(course, { path, contentType: 'image/png' });
      }
    }
    const captured = trace.slice(0, frames + 1);
    const distance = (a: typeof trace[number]['p'], b: typeof a) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    let continuous = 0, longest = 0, climbAngle = 0, sampledAcceleration = 0, contactLosses = 0;
    for (let i = 1; i < captured.length; i++) {
      const a = captured[i - 1], b = captured[i];
      continuous = a.phase === 'GLIDING' && b.phase === 'GLIDING' ? continuous + distance(a.p, b.p) : 0;
      longest = Math.max(longest, continuous);
      const turn = Math.atan2(-b.p.z, b.p.x) - Math.atan2(-a.p.z, a.p.x);
      climbAngle += Math.atan2(Math.sin(turn), Math.cos(turn));
      if (b.time > a.time) sampledAcceleration = Math.max(sampledAcceleration, distance(a.v, b.v) / (b.time - a.time));
      if (b.phase === 'REACQUIRE' && a.phase !== b.phase) contactLosses++;
    }
    const last = captured.at(-1)!;
    const phases = trace.filter((s, i) => s.phase !== trace[i - 1]?.phase).map(s => ({ phase: s.phase, time: s.time }));
    const metrics = { longestGlideM: longest, gainM: last.p.y - trace[0].p.y,
      helixRadians: course === 'glide-helix' ? climbAngle : null, contactLosses,
      minSampledCenterClearanceM: Math.min(...trace.map(s => s.centerClearance ?? Infinity)),
      peakSampledAccelerationMps2: sampledAcceleration, entrySpeed: trace[0].speed, lastSpeed: last.speed,
      shieldImpacts: trace.at(-1)!.impacts, beforeRelease: last.phase, end: trace.at(-1)!.phase, phases };
    const report = { course, preset, seed: 334458, fixedHz: 120, sampleMs: 32, build, chromium: browser.version(),
      glbSha256: createHash('sha256').update(buffer).digest('hex'), spawn, inputs, metrics, errors, trace };
    const path = info.outputPath(course + '.json');
    await writeFile(path, JSON.stringify(report) + '\n');
    await info.attach('controlled flight trace', { path, contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(trace.every(s => s.mode === 'running' && s.aircraft === preset && s.camera === trace[0].camera)).toBe(true);
    if (reference) return;
    expect(metrics.shieldImpacts).toBe(0);
    expect(metrics.minSampledCenterClearanceM).toBeGreaterThan(3.2);
    expect(metrics.end).toBe('FLIGHT');
    if (course === 'glide-gap') {
      expect(phases.map(s => s.phase)).toContain('RECOVERY');
      expect(last.phase).toBe('FLIGHT');
    } else {
      expect(last.phase).toBe('GLIDING');
      expect(metrics.contactLosses).toBe(0);
      expect(metrics.longestGlideM).toBeGreaterThan(course === 'glide-helix' ? 225 : 140);
      expect(phases.map(s => s.phase)).toContain('DETACHING');
      if (course === 'glide-helix') {
        expect(climbAngle).toBeGreaterThan(2 * Math.PI);
        expect(metrics.gainM).toBeGreaterThan(40);
      }
    }
  });
