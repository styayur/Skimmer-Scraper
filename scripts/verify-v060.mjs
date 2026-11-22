import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createWorldFixture } from '../tests/fixtures/worldGlb.ts';

const { SKIMMER_URL, SKIMMER_EXPECTED_COMMIT, SKIMMER_EXPECTED_VERSION, SKIMMER_EVIDENCE_DIR, SKIMMER_DEPLOY_ARTIFACT_DIR } = process.env;
assert(SKIMMER_URL && SKIMMER_EXPECTED_COMMIT && SKIMMER_EXPECTED_VERSION && SKIMMER_EVIDENCE_DIR);
const base = new URL(SKIMMER_URL);
const isLive = base.protocol === 'https:';
assert(isLive || ['127.0.0.1', 'localhost'].includes(base.hostname));
if (isLive) assert.equal(base.origin, 'https://styayur.github.io');
assert.equal(base.pathname, '/Skimmer-Scraper/');
assert(!isLive || SKIMMER_DEPLOY_ARTIFACT_DIR, 'Live verification requires the downloaded Pages artifact');
mkdirSync(SKIMMER_EVIDENCE_DIR, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', url: base.href, browser: browser.version(), checks: {}, pageErrors: [], consoleErrors: [],
  warnings: [], siteErrors: [], assets: [], transmissions: [] };
const done = (id, name, observations = {}) => {
  report.checks[id] = { name, result: isLive ? 'VERIFIED LIVE' : 'TESTED', ...observations };
  console.log(JSON.stringify({ check: id, name }));
};
const snapshot = (tab = page) => tab.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot());
const wait = (predicate, arg = null, tab = page, timeout = 60_000) => tab.waitForFunction(predicate, arg, { timeout, polling: 75 });
const screenshot = name => page.screenshot({ path: join(SKIMMER_EVIDENCE_DIR, name + '.png'), animations: 'disabled' });
const monitor = tab => {
  tab.on('pageerror', error => report.pageErrors.push(error.message));
  tab.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
    if (message.type() === 'warning') report.warnings.push(message.text().slice(0, 300));
  });
  tab.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== base.origin) return;
    if (response.status() >= 400) report.siteErrors.push({ path: url.pathname, status: response.status() });
    if (url.pathname.includes('/assets/')) report.assets.push({ path: url.pathname, status: response.status() });
  });
  tab.on('request', request => {
    const u = new URL(request.url());
    if (!['http:', 'https:'].includes(u.protocol) || u.origin === base.origin) return;
    report.transmissions.push({ origin: u.origin, path: u.pathname, method: request.method() });
  });
};
monitor(page);
let stage = 'entry';

try {
  const response = await page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: 70_000 });
  assert.equal(response?.status(), 200);
  const transport = await response.securityDetails();
  if (isLive) assert(transport?.protocol?.includes('TLS'), JSON.stringify(transport));
  done(1, 'HTTP entry', { status: response.status(), transport, secureContext: await page.evaluate(() => isSecureContext) });
  await wait(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const metadata = await page.request.get(new URL('build-info.json', base).href);
  assert(metadata.ok());
  const metaBytes = await metadata.body();
  report.build = JSON.parse(metaBytes.toString());
  assert.equal(report.build.version, SKIMMER_EXPECTED_VERSION);
  assert.equal(report.build.dirty, false);
  done(2, 'Version provenance', { version: report.build.version });
  assert.equal(report.build.sourceCommit, SKIMMER_EXPECTED_COMMIT);
  done(3, 'Exact source commit', { sourceCommit: report.build.sourceCommit });
  const module = await page.locator('script[type=module][src]').getAttribute('src');
  const url = new URL(module, base);
  assert(url.origin === base.origin && url.pathname.startsWith(base.pathname + 'assets/'));
  const script = await page.request.get(url.href);
  assert(script.ok());
  const entrySha = hash(await script.body());
  const rel = url.pathname.slice(base.pathname.length);
  if (SKIMMER_DEPLOY_ARTIFACT_DIR) {
    assert.equal(entrySha, hash(readFileSync(join(SKIMMER_DEPLOY_ARTIFACT_DIR, rel))));
    assert.equal(hash(metaBytes), hash(readFileSync(join(SKIMMER_DEPLOY_ARTIFACT_DIR, 'build-info.json'))));
  }
  done(4, 'Runtime bundle identity', { path: url.pathname, sha256: entrySha, artifactCompared: Boolean(SKIMMER_DEPLOY_ARTIFACT_DIR) });

  stage = 'title and tutorial';
  const webgl = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && { version: gl.getParameter(gl.VERSION), renderer: info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL) };
  });
  assert(webgl?.version.includes('WebGL 2'));
  await wait(() => window.__SKIMMER_SCRAPER__.snapshot().render.triangles > 10_000);
  done(5, 'Live 3D title', { webgl, triangles: (await snapshot()).render.triangles });
  await expect(page.locator('.title-panel > *')).toHaveCount(3);
  await expect(page.locator('.title-panel')).toHaveText('SKIMMER SCRAPER 开始游戏 游戏教程');
  done(6, 'Minimal title', { items: await page.locator('.title-panel > *').allInnerTexts() });
  await screenshot('title-desktop');
  await page.setViewportSize({ width: 360, height: 680 });
  await page.getByRole('link', { name: '游戏教程', exact: true }).click();
  await expect(page.locator('#guide-content section')).toHaveCount(19);
  const search = page.getByRole('searchbox', { name: '搜索教程' });
  await search.fill('API Key 费用');
  await expect(page.locator('#guide-index a:visible')).toHaveCount(1);
  await expect(page.locator('#guide-ai')).toBeVisible();
  await search.clear();
  await page.getByRole('link', { name: '源码与开源许可证' }).click();
  await expect(page.locator('#guide-privacy')).toBeFocused();
  assert.equal(await page.getByRole('link', { name: '源码 · AGPL-3.0' }).getAttribute('href'), report.build.sourceUrl);
  const license = await page.request.get(new URL('LICENSE', base).href);
  assert(license.ok() && (await license.text()).includes('GNU AFFERO GENERAL PUBLIC LICENSE'));
  await screenshot('tutorial-mobile');
  done(7, 'Complete tutorial, search and direct navigation', { chapters: 19, mobileViewport: [360, 680] });
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  const rules = page.locator('#rules-panel');
  await expect(rules).toBeVisible();
  assert.equal(await page.locator('#advanced-flight-settings').evaluate(node => node.open), false);
  const primary = await rules.locator(':scope > .setting-heading:visible label').evaluateAll(items =>
    items.map(label => label.firstChild.textContent.trim()));
  assert.deepEqual(primary, ['玩法', '视角', '伴机数量']);
  await page.getByRole('button', { name: '玩法帮助' }).click();
  await expect(page.locator('#guide-modes')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '玩法帮助' })).toBeFocused();
  assert(await rules.evaluate(node => node.scrollWidth <= node.clientWidth));
  await screenshot('settings-mobile');
  done(8, 'Minimal settings, responsive layout and contextual help', { primary });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1920, height: 1080 });

  stage = 'default flight and system speech';
  await page.locator('#start-button').click();
  await wait(() => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running');
  const defaults = await snapshot();
  assert(defaults.rules.mode === 'free' && defaults.rules.shield && defaults.voice.input === 'off' && defaults.voice.output === 'local');
  assert(defaults.companions.length === 3 && defaults.companions.every(agent => agent.deployed && !agent.uncovered));
  assert(defaults.dynamicStructures.length > 0 && defaults.streaming.dynamicBvhCount > 0);
  done(13, 'Three companions and dynamic colliders', { deployed: defaults.companions.length, dynamic: defaults.dynamicStructures.length,
    dynamicBvhs: defaults.streaming.dynamicBvhCount });
  await wait(() => window.__SKIMMER_SCRAPER__.snapshot().voice.playbackHistory.some(entry => entry.provider === 'local'));
  const system = await snapshot();
  assert(system.voice.kokoro === null && system.cooperation.model.requests === 0);
  done(14, 'Native system speech completes by default', { speech: system.voice.lastCompleted, input: system.voice.input });

  stage = 'mirror and high-speed flight';
  const mirror = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__;
    game.pause();
    await game.setPose({x:0,y:310,z:120}, {yaw:1.9,pitch:.76,roll:0});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return game.snapshot().render.mirrorSky;
  });
  assert(mirror?.ground && mirror.triangles > 0, JSON.stringify(mirror));
  await screenshot('mirror-ground');
  done(9, 'Analytical mirror city ground', { mirror, screenshot: 'mirror-ground.png' });
  await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__;
    await game.setPose({x:0,y:410,z:120}, {yaw:0,pitch:0,roll:0});
    game.resume();
  });
  await page.keyboard.down('Shift');
  let stream;
  try {
    stream = await page.evaluate(async () => {
      const state = () => window.__SKIMMER_SCRAPER__.snapshot();
      const start = state();
      const frames = [], chunks = [];
      const begin = performance.now();
      let previous = begin;
      await new Promise(resolve => {
        const clock = now => {
          if (now >= previous) frames.push(now - previous);
          previous = now;
          if (frames.length % 15 === 0) {
            const s = state();
            chunks.push({ coverage: s.streaming.coverageComplete, buffered: s.buffering,
              active: s.streaming.activeChunks, bsp: s.streaming.bvhCount, moving: s.dynamicStructures.length });
          }
          if (now - begin < 18_000) requestAnimationFrame(clock);
          else resolve();
        };
        requestAnimationFrame(clock);
      });
      const end = state();
      const sorted = frames.slice(1).sort((a,b) => a-b);
      const p = fraction => sorted[Math.floor((sorted.length - 1) * fraction)];
      return { elapsed: end.runTime - start.runTime, speed: end.speed, mode: end.mode,
        distance: Math.hypot(end.position.x-start.position.x,end.position.y-start.position.y,end.position.z-start.position.z),
        activePeak: Math.max(...chunks.map(s=>s.active)), maxStaticBvhs: Math.max(...chunks.map(s=>s.bsp)),
        maxMoving: Math.max(...chunks.map(s=>s.moving)), buffered: chunks.filter(s=>s.buffered).length,
        coveredSamples: chunks.filter(s=>s.coverage).length, samples: chunks.length,
        generated: end.streaming.generatedTotal - start.streaming.generatedTotal, retired: end.streaming.retiredTotal - start.streaming.retiredTotal,
        activationP95Ms: end.streaming.activationP95Ms, generationP95Ms: end.streaming.generationP95Ms,
        fps: 1000 * frames.length/(previous-begin), p50Ms: p(.5), p95Ms: p(.95), p99Ms: p(.99) };
    });
  } finally { await page.keyboard.up('Shift'); }
  assert(stream.mode === 'running' && stream.distance > 900 && stream.generated > 0 && stream.samples > 0 && stream.activePeak <= 41, JSON.stringify(stream));
  assert(stream.coveredSamples / stream.samples > .9, JSON.stringify(stream));
  done(10, 'High-speed infinite streaming', stream);
  assert(stream.fps >= 30 && stream.p95Ms <= 90 && stream.elapsed > 15, JSON.stringify(stream));
  done(20, 'No sustained slowdown in controlled native flight', { seconds: stream.elapsed, fps: stream.fps,
    p50Ms: stream.p50Ms, p95Ms: stream.p95Ms, p99Ms: stream.p99Ms,
    scope: isLive ? '18 second production flight. Longer hardware runs are recorded separately.'
      : '18 second local flight. Longer hardware runs are recorded separately.' });

  if (process.env.SKIMMER_FULL_JOURNEY === '1') {
    stage = 'five world crossings';
    const attitudes = [
      {pitch:.75, roll:1.56, yaw:0}, {pitch:1.16, roll:3.08, yaw:.42}, {pitch:1.31, roll:-1.57, yaw:-.37},
      {pitch:1.63, roll:-2.83, yaw:1.62}, {pitch:1.03, roll:.73, yaw:-2.23},
    ];
    report.crossings = [];
    for (const [index, attitude] of attitudes.entries()) {
      if (index) await page.keyboard.press('c');
      const before = (await snapshot()).cameraMode;
      await page.evaluate(async pose => {
        const game = window.__SKIMMER_SCRAPER__;
        game.pause();
        await game.setPose({x:0,y:519,z:120}, pose);
        game.resume();
      }, attitude);
      await wait(count => window.__SKIMMER_SCRAPER__.snapshot().journey.crossings === count, index + 1);
      const s = await snapshot();
      const release = s.worldReleases.at(-1);
      assert(s.mode === 'running' && s.cameraMode === before);
      assert(s.companions.length === 3 && s.companions.every(agent => agent.deployed && !agent.uncovered));
      assert(release?.bvhAfter === 0 && release.rootChildrenAfter === 0);
      if (index === 4) assert(s.journey.easterEggUnlocked);
      report.crossings.push({ index: index + 1, camera: s.cameraMode, signature: s.journey.easterEggUnlocked, release });
    }
  }

  stage = 'import and variant replay';
  const world = page.locator('#world-panel');
  const openWorld = async () => {
    if (!await world.isVisible()) await page.keyboard.press('g');
    await expect(world).toBeVisible();
  };
  await openWorld();
  const library = page.locator('#local-world-library');
  if (!await library.evaluate(node=>node.open)) await library.locator(':scope > summary').click();
  const contents = createWorldFixture('variants');
  const fixtureSha = hash(contents);
  await page.locator('#local-world-file').setInputFiles({ name: 'variants.glb', mimeType: 'model/gltf-binary', buffer: contents });
  await page.locator('#local-world-analyze').click();
  await expect(page.locator('#local-world-config')).toBeVisible({ timeout: 45_000 });
  await page.locator('#local-world-save').check();
  await page.locator('#local-world-apply').click();
  await wait(() => window.__SKIMMER_SCRAPER__.snapshot().localWorld?.manifest.name === 'variants');
  const readCity = async () => {
    const values = await page.evaluate(() => {
      const game = window.__SKIMMER_SCRAPER__;
      const local = game.snapshot().localWorld;
      const distances = [];
      for (const y of [6, 16, 28, 42, 58, 76]) for (let x=-128;x<=128;x+=16) for (let z=-128;z<=128;z+=16) {
        const hit = game.surface({x,y,z},12);
        distances.push(hit ? Math.round(hit.distance * 1000) : -1);
      }
      return { manifest: local.manifest, spawn: local.spawn, distances };
    });
    const { distances, ...details } = values;
    return { ...details, deployedGeometrySha256: hash(JSON.stringify(distances)), probes: distances.length };
  };
  const original = await readCity();
  assert.equal(original.manifest.id, fixtureSha);
  assert(original.manifest.collisionTriangles > 0);
  done(11, 'Local GLB import and collision BVH', { fixtureSha, triangles: original.manifest.collisionTriangles });
  const generate = async (prior = 0) => {
    await openWorld();
    await page.getByRole('button', { name: '生成新变体' }).click();
    await wait(old => {
      const result = window.__SKIMMER_SCRAPER__.snapshot().localWorld?.manifest.variant?.seed;
      return !!result && result !== old;
    }, prior);
    return readCity();
  };
  const first = await generate();
  assert(first.manifest.variant.layout === 'grouped' && first.manifest.variant.movedGroups > 2);
  assert.notEqual(first.deployedGeometrySha256, original.deployedGeometrySha256);
  await openWorld();
  const seed = page.getByRole('textbox', { name: '输入种子' });
  const replay = await seed.inputValue();
  assert(replay.length > 64);
  const second = await generate(first.manifest.variant.seed);
  assert.notEqual(second.deployedGeometrySha256, first.deployedGeometrySha256);
  await openWorld();
  await seed.fill(replay);
  await page.locator('#world-form button[type=submit]').click();
  await wait(prior => window.__SKIMMER_SCRAPER__.snapshot().localWorld?.manifest.variant?.seed === prior, first.manifest.variant.seed);
  const restored = await readCity();
  assert.equal(restored.deployedGeometrySha256, first.deployedGeometrySha256);
  assert.deepEqual(restored.spawn, first.spawn);
  assert.equal(restored.manifest.collisionTriangles, original.manifest.collisionTriangles);
  done(12, 'GLB variant replay with identical collision geometry', { fixtureSha, probes: first.probes, geometry: first.deployedGeometrySha256,
    alternateGeometry: second.deployedGeometrySha256, movedGroups: first.manifest.variant.movedGroups });

  stage = 'legacy migration';
  const legacyContext = await browser.newContext({ viewport: { width: 1120, height: 720 } });
  const old = await legacyContext.newPage();
  monitor(old);
  await old.addInitScript(() => {
    localStorage.setItem('skimmer-scraper.preferences.v2', JSON.stringify({ cameraMode: 'nose', visualStimulation: 'reduced' }));
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'challenge', graceSeconds: 7.4 }));
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 1, formation: 'line' }));
    localStorage.setItem('skimmer-scraper.camera-anchors.v3', JSON.stringify({ procedural: {x:.35,y:1.12,z:-2.45} }));
    localStorage.setItem('skimmer-scraper.best.v1', '24.7');
  });
  await old.goto(new URL('?seed=334458&world=stable&gen=3', base).href);
  await wait(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, old);
  const loaded = await snapshot(old);
  assert(loaded.rules.mode === 'challenge' && loaded.rules.graceSeconds === 7.4 && loaded.cameraMode === 'cockpit');
  assert.equal(loaded.seed, 334458);
  assert.deepEqual(loaded.cameraAnchor, {x:.35,y:1.12,z:-2.45});
  assert.equal(loaded.companionSettings.count,1);
  assert.equal(await old.evaluate(() => localStorage.getItem('skimmer-scraper.best.v1')), '24.7');
  done(17, 'Historical score, settings, cockpit migration and stable URL', { seed: loaded.seed, grace: loaded.rules.graceSeconds,
    camera: loaded.cameraMode, oldScore: 24.7 });
  await legacyContext.close();

  stage = 'asset paths and browser errors';
  assert(report.assets.length && report.assets.every(item => item.path.startsWith(base.pathname + 'assets/')));
  assert.deepEqual(report.siteErrors, []);
  done(18, 'All loaded game assets under the Pages project path', { assets: report.assets.length });
  assert.deepEqual(report.transmissions, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  done(19, 'No runtime errors in the core browser suite', { pageErrors: 0, consoleErrors: 0, warnings: report.warnings });
  report.externalEvidenceRequired = { 15: 'Native Kokoro production browser report', 16: 'Authorized paid DeepSeek browser plus fallback reports' };
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failedStage = stage;
  report.failure = error.message;
  await screenshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(join(SKIMMER_EVIDENCE_DIR, 'core.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, stage, failure: report.failure, checks: Object.keys(report.checks) }));
  await browser.close();
}
