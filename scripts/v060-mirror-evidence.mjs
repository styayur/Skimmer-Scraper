import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [name, origin, output] = process.argv.slice(2);
assert(name && origin && output, 'Usage: node scripts/v060-mirror-evidence.mjs <name> <preview URL> <output directory>');
const url = new URL(origin);
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use an isolated local preview.');
url.search = '?autostart=1&seed=334458&gen=3';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer', '--disable-background-timer-throttling'] });
const views = [
  { name: 'low', y: 45, pitch: 0.6, yaw: 0, roll: 0 },
  { name: 'climb', y: 310, pitch: 0.76, yaw: 1.9, roll: 0 },
  { name: 'rolled', y: 250, pitch: 0.69, yaw: -1.7, roll: 1.22 },
  { name: 'inverted', y: 160, pitch: 0.68, yaw: 2.6, roll: Math.PI },
];

const stage = (page, pose) => page.evaluate(async ({ y, pitch, yaw, roll }) => {
  const game = window.__SKIMMER_SCRAPER__;
  game.pause();
  await game.setPose({ x: 0, y, z: 120 }, { pitch, yaw, roll });
  for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
  const state = game.snapshot();
  const probe = { x: state.cameraPosition.x + state.renderOrigin.x, y: state.cameraPosition.y + state.renderOrigin.y + 650,
    z: state.cameraPosition.z + state.renderOrigin.z - 500 };
  return { attitude: state.attitude, camera: state.cameraOrientation, position: state.position, seed: state.seed,
    mirror: state.render.mirrorSky, chunks: state.streaming.activeChunks, bvh: state.streaming.bvhCount,
    surface: game.surface(probe, 50) };
}, pose);

async function fly(page, seconds) {
  await stage(page, { y: 112, pitch: 0.34, yaw: 0, roll: 0 });
  return page.evaluate(async seconds => {
    const game = window.__SKIMMER_SCRAPER__;
    const sample = () => {
      const { mode, journey, position, runTime, render, streaming, companions, buffering } = game.snapshot();
      return { mode, world: journey.worldIndex, position, runTime, companions: companions.length, buffering,
        chunks: streaming.activeChunks, bvh: streaming.bvhCount, dynamicBvh: streaming.dynamicBvhCount,
        mirror: render.mirrorSky, calls: render.calls, triangles: render.triangles, textures: render.textures };
    };
    game.resume();
    const start = await new Promise(requestAnimationFrame);
    let previous = start;
    let sampledAt = start;
    const frames = [];
    const samples = [sample()];
    while (previous - start < seconds * 1000) {
      const now = await new Promise(requestAnimationFrame);
      frames.push(now - previous);
      previous = now;
      if (now - sampledAt >= 500) {
        samples.push(sample());
        sampledAt = now;
      }
    }
    const end = sample();
    game.pause();
    samples.push(end);
    const sorted = [...frames].sort((a, b) => a - b);
    const percentile = p => sorted[Math.floor((sorted.length - 1) * p)];
    const first = samples[0];
    return { seconds: (previous - start) / 1000, frames: frames.length, fps: frames.length * 1000 / (previous - start),
      p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
      meters: Math.hypot(end.position.x - first.position.x, end.position.y - first.position.y, end.position.z - first.position.z),
      simulatedSeconds: end.runTime - first.runTime, samples };
  }, seconds);
}

const data = { name, driver: process.env.SKIMMER_GPU_DRIVER ?? null, browser: browser.version(), views: {}, runs: [] };
try {
  for (const quality of ['balanced', 'high']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url.href);
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running', null, { timeout: 60_000 });
    data.environment ??= await page.evaluate(async () => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return { viewport: [innerWidth, innerHeight], renderer: extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
        build: await fetch('build-info.json').then(response => response.json()) };
    });
    assert(data.environment.renderer && !/SwiftShader|llvmpipe|software/i.test(data.environment.renderer));
    if (quality === 'balanced') {
      for (const view of views) {
        data.views[view.name] = await stage(page, view);
        assert.equal(data.views[view.name].surface, null);
        await page.screenshot({ path: join(output, `${name}-${view.name}.png`), animations: 'disabled' });
      }
    } else {
      await page.keyboard.press('f');
      await page.locator('#advanced-flight-settings > summary').click();
      await page.locator('#comfort-settings > summary').click();
      await page.locator('#quality-button').click();
      await page.locator('#rules-close').click();
    }
    for (let run = 0; run < 2; run++) {
      const result = await fly(page, 12);
      assert(result.meters > 400 && result.simulatedSeconds > 11);
      assert(result.samples.every(value => value.mode === 'running' && value.world === 0 && value.companions === 3));
      data.runs.push({ quality, ...result });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  writeFileSync(join(output, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({ renderer: data.environment.renderer, views: Object.keys(data.views),
    runs: data.runs.map(({ quality, fps, p95Ms, p99Ms }) => ({ quality, fps, p95Ms, p99Ms })) }));
} finally {
  await browser.close();
}
