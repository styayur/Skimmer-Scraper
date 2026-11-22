import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, firefox } from '@playwright/test';
import { createWorldFixture } from '../tests/fixtures/worldGlb.ts';

const base = new URL(process.env.SKIMMER_URL ?? 'https://styayur.github.io/Skimmer-Scraper/');
const expectedVersion = process.env.SKIMMER_EXPECTED_VERSION ?? '0.5.0';
const expectedCommit = process.env.SKIMMER_EXPECTED_COMMIT ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = process.env.SKIMMER_EVIDENCE_DIR ?? 'evidence/v0.5/pr9-release';
const family = process.env.SKIMMER_BROWSER ?? 'chrome';
const cycles = Number(process.env.SKIMMER_JOURNEY_SETS ?? '0');
assert(['chrome', 'msedge', 'firefox'].includes(family));
assert(Number.isInteger(cycles) && cycles >= 0 && cycles <= 3);
assert(base.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(base.hostname));
assert.equal(base.pathname, '/Skimmer-Scraper/');
const prefix = base.protocol === 'https:' ? `live-${family}` : `candidate-${family}`;
const proxyUrl = base.protocol === 'https:' && process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const proxy = proxyUrl ? { proxy: { server: proxyUrl.origin, bypass: 'localhost,127.0.0.1',
  ...(proxyUrl.username ? { username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password) } : {}) } } : {};
const firefoxPath = process.env.SKIMMER_FIREFOX_PATH;
const browser = family === 'firefox'
  ? await firefox.launch({ headless: false, executablePath: firefoxPath && existsSync(firefoxPath) ? firefoxPath : undefined, ...proxy })
  : await chromium.launch({ channel: family, headless: false, args: ['--use-angle=d3d11', '--disable-software-rasterizer'], ...proxy });
const evidence = { url: base.href, scope: prefix, browser: browser.version(), journeys: [], worldImports: [], pageErrors: [], httpErrors: [], assets: [] };
mkdirSync(output, { recursive: true });
const attitudes = [
  { pitch: 0.75, roll: 1.56, yaw: 0 }, { pitch: 1.16, roll: 3.08, yaw: 0.42 },
  { pitch: 1.31, roll: -1.57, yaw: -0.37 }, { pitch: 1.63, roll: -2.83, yaw: 1.62 },
  { pitch: 1.03, roll: 0.73, yaw: -2.23 },
];
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const snapshot = () => page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot());
const running = () => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running', null, { timeout: 60_000 });
const image = (name) => page.screenshot({ path: join(output, `${prefix}-${name}.png`), animations: 'disabled' });
let stage = 'startup';

page.on('pageerror', error => evidence.pageErrors.push(error.message));
page.on('response', response => {
  const url = new URL(response.url());
  if (url.origin !== base.origin) return;
  if (response.status() >= 400) evidence.httpErrors.push({ url: url.pathname, status: response.status() });
  if (url.pathname.includes('/assets/')) evidence.assets.push({ path: url.pathname, status: response.status() });
});

try {
  const response = await page.goto(base.href, { timeout: 60_000 });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 60_000 });
  const metadata = await page.request.get(new URL('build-info.json', base).href);
  assert(metadata.ok());
  evidence.build = await metadata.json();
  assert.equal(evidence.build.version, expectedVersion);
  assert.equal(evidence.build.sourceCommit, expectedCommit);
  assert.equal(evidence.build.dirty, false);
  const bundle = await page.locator('script[type="module"][src]').getAttribute('src');
  const bundleUrl = new URL(bundle, base);
  assert(bundleUrl.origin === base.origin && bundleUrl.pathname.startsWith(`${base.pathname}assets/`));
  const bundleResponse = await page.request.get(bundleUrl.href);
  assert(bundleResponse.ok());
  evidence.bundle = { path: bundleUrl.pathname, sha256: createHash('sha256').update(await bundleResponse.body()).digest('hex') };
  evidence.webgl = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && { version: gl.getParameter(gl.VERSION), renderer: extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) };
  });
  assert(evidence.webgl?.version.includes('WebGL 2'));
  assert(await page.locator('#title-screen h1').isVisible());
  assert(await page.locator('#start-button').isVisible());
  assert(await page.locator('#title-screen').getByRole('link', { name: '操作指南' }).isVisible());
  if (family === 'chrome') await image('title');
  await page.locator('#title-screen').getByRole('link', { name: '操作指南' }).click();
  assert.equal(await page.getByRole('link', { name: '源码 · AGPL-3.0' }).getAttribute('href'), evidence.build.sourceUrl);
  const license = await page.request.get(new URL('LICENSE', base).href);
  assert(license.ok() && (await license.text()).includes('GNU AFFERO GENERAL PUBLIC LICENSE'));
  await page.keyboard.press('Escape');
  await page.locator('#start-button').click();
  await running();

  stage = 'default flight and voice settings';
  const initial = await snapshot();
  assert.equal(initial.rules.mode, 'free');
  assert(initial.rules.shield);
  assert.equal(initial.cameraMode, 'chase');
  assert(initial.companions.length === 3 && initial.companions.every(agent => agent.deployed));
  assert(initial.dynamicStructures.length > 0 && initial.streaming.dynamicBvhCount > 0);
  assert.equal(initial.voice.input, 'off');
  assert.equal(initial.cooperation.model.requests, 0);
  const moving = await page.evaluate(() => window.__SKIMMER_SCRAPER__.advance(1.5));
  assert(Math.hypot(moving.position.x - initial.position.x, moving.position.y - initial.position.y, moving.position.z - initial.position.z) > 40);
  assert(moving.dynamicStructures.some(structure => {
    const before = initial.dynamicStructures.find(item => item.id === structure.id);
    return before && JSON.stringify(before) !== JSON.stringify(structure);
  }));
  evidence.defaults = { mode: initial.rules.mode, shield: initial.rules.shield, companions: initial.companions.length,
    camera: initial.cameraMode, movingStructures: initial.dynamicStructures.length, dynamicBvhs: initial.streaming.dynamicBvhCount };
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().cameraMode === 'cockpit');
  if (family === 'chrome') await image('cockpit');
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().cameraMode === 'chase');
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.voice-settings > summary').click();
  assert.equal(await page.locator('#voice-input').inputValue(), 'off');
  assert.equal(await page.locator('#voice-output').inputValue(), 'off');
  assert(await page.locator('#voice-language').isVisible());
  evidence.voiceSettings = ['voice-input', 'voice-output', 'voice-language'];
  if (family === 'chrome') {
    await page.locator('#voice-output').scrollIntoViewIfNeeded();
    await image('voice-settings');
  }
  await page.locator('#rules-close').click();

  stage = 'local text command';
  await page.keyboard.press('t');
  await page.locator('#radio-input').fill('全体集合');
  await page.locator('#radio-input').press('Enter');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().cooperation.lastPlan?.orders[0]?.action === 'REGROUP');
  const commanded = await snapshot();
  evidence.radio = commanded.cooperation.radio.history.find(line => line.source === 'local' && line.priority === 'reply');
  assert(evidence.radio && commanded.cooperation.model.requests === 0);

  if (family === 'chrome') {
    stage = 'sky inversion';
    for (let cycle = 0; cycle < Math.max(1, cycles); cycle++) {
      const traces = [];
      for (let index = 0; index < (cycles ? 5 : 1); index++) {
        if (index) await page.keyboard.press('c');
        const trace = await page.evaluate(async ({ attitude, crossing }) => {
          const game = window.__SKIMMER_SCRAPER__;
          game.pause();
          await game.setPose({ x: 0, y: 519, z: 120 }, attitude);
          const camera = game.snapshot().cameraMode;
          const start = performance.now();
          let departure;
          let arrival;
          let minimum = Infinity;
          const phases = new Set();
          game.resume();
          for (;;) {
            await new Promise(requestAnimationFrame);
            const state = game.snapshot();
            const { phase, crossings } = state.journey;
            const packet = { at: performance.now() - start, roll: state.attitude.roll, speed: state.speed };
            phases.add(phase);
            if (phase === 'INVERSION') departure = packet;
            if (phase === 'DIVE') arrival ??= packet;
            if (['DIVE','RECOVERY'].includes(phase) && state.surfaceDistance !== null) minimum = Math.min(minimum, state.surfaceDistance);
            if (crossings >= crossing || state.mode !== 'running' || packet.at > 45_000) {
              for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
              const after = game.snapshot();
              return { expected: crossing, crossings: after.journey.crossings, phases: [...phases], camera, resultingCamera: after.cameraMode,
                departure, arrival, clearance: Number.isFinite(minimum) ? minimum : null, mode: after.mode,
                companionCoverage: after.companions.every(agent => agent.deployed && !agent.uncovered),
                shieldImpacts: after.shieldImpacts, signature: after.journey.easterEggUnlocked, release: after.worldReleases.at(-1) };
            }
          }
        }, { attitude: attitudes[index], crossing: index + 1 });
        traces.push(trace);
        assert.equal(trace.crossings, index + 1);
        assert.equal(trace.mode, 'running');
        assert.equal(trace.camera, trace.resultingCamera);
        assert(trace.companionCoverage && trace.departure && trace.arrival);
        assert(Math.abs(trace.departure.roll - trace.arrival.roll) < 0.18);
        assert(Math.abs(trace.departure.speed - trace.arrival.speed) < 1e-7);
        assert(trace.clearance === null || trace.clearance >= 6.5);
        assert(trace.release?.bvhAfter === 0 && trace.release.rootChildrenAfter === 0);
        if (index === 4) assert(trace.signature);
      }
      evidence.journeys.push(traces);
      await page.evaluate(() => window.__SKIMMER_SCRAPER__.retry());
      await running();
      assert.equal((await snapshot()).journey.crossings, 0);
    }
  }

  stage = 'local GLB import and resource release';
  const variants = family === 'chrome' && cycles ? ['arches', 'animated', 'detailed'] : ['animated'];
  for (const variant of variants) {
    const localLibrary = page.locator('#local-world-library');
    const openLibrary = async () => {
      await page.keyboard.press('g');
      await localLibrary.waitFor();
      if (!await localLibrary.evaluate(element => element.open)) await localLibrary.locator(':scope > summary').click();
    };
    await openLibrary();
    await page.locator('#local-world-file').setInputFiles({ name: `${variant}.glb`, mimeType: 'model/gltf-binary', buffer: createWorldFixture(variant) });
    await page.locator('#local-world-analyze').click();
    await page.locator('#local-world-apply').click();
    await page.waitForFunction(name => window.__SKIMMER_SCRAPER__.snapshot().localWorld?.manifest.name === name, variant);
    await page.locator('#start-button').click();
    await running();
    const after = await page.evaluate(() => window.__SKIMMER_SCRAPER__.advance(1));
    assert(after.localWorld?.manifest.name === variant && after.adapter.bvhCount > 0);
    if (variant === 'animated') assert(after.dynamicStructures.length > 0);
    if (family === 'chrome' && variant === 'animated') await image('glb-flight');
    await openLibrary();
    await page.locator('#local-world-builtin').click();
    await page.waitForFunction(() => !window.__SKIMMER_SCRAPER__.snapshot().localWorld);
    const restored = await snapshot();
    const release = restored.worldReleases.findLast(world => world.bvhBefore === after.adapter.bvhCount);
    assert(release && release.bvhAfter === 0 && release.dynamicBvhAfter === 0 && release.disposedGeometryCount > 0);
    if (variant === 'animated') assert(release.dynamicBvhBefore > 0);
    evidence.worldImports.push({ variant, bvh: after.adapter.bvhCount, dynamicBvh: release.dynamicBvhBefore, release });
    if (variant !== variants.at(-1)) {
      await page.locator('#start-button').click();
      await running();
    }
  }
  assert(evidence.assets.length > 0 && evidence.assets.every(asset => asset.path.startsWith(`${base.pathname}assets/`)));
  assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.httpErrors, []);
  evidence.status = 'passed';
  console.log(JSON.stringify({ status: evidence.status, scope: prefix, sha: expectedCommit, journeys: evidence.journeys.map(set => set.length),
    worlds: evidence.worldImports.map(world => world.variant), assets: evidence.assets.length }));
} catch (error) {
  evidence.status = 'incomplete';
  evidence.failedStage = stage;
  evidence.failure = { type: error.name, message: error.message };
  console.error(JSON.stringify({ status: evidence.status, family, stage, failure: evidence.failure }));
  await image('incomplete').catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, `${prefix}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
  await browser.close();
}
