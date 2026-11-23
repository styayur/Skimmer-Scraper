import { collectFlight } from './streaming-flight-sample.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [name, origin, output, scenario = 'all'] = process.argv.slice(2);
assert(name && origin && output, 'Usage: node scripts/v060-streaming-evidence.mjs <name> <preview URL> <output directory> [all|balanced|cold]');
const url = new URL(origin);
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use an isolated local preview.');
url.search = '?autostart=1&seed=334458&gen=3&world=stable';
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer', '--disable-background-timer-throttling'] });
const records = { name, browser: browser.version(), driver: process.env.SKIMMER_GPU_DRIVER ?? null, runs: [] };

try {
  const scenarios = [
    { quality: 'balanced', cpuThrottle: 1, seconds: 44, altitude: 410 },
    { quality: 'high', cpuThrottle: 1, seconds: 44, altitude: 410 },
    { quality: 'balanced', cpuThrottle: 4, seconds: 44, altitude: 410 },
    { quality: 'balanced', cpuThrottle: 4, seconds: 14, altitude: 410, cold: true },
  ];
  const selected = scenario === 'balanced' ? scenarios.slice(0, 1) : scenario === 'cold' ? scenarios.slice(-1) : scenarios;
  for (const config of selected) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url.href);
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running', null, { timeout: 60_000 });
    records.environment ??= await page.evaluate(async () => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
      return { renderer, viewport: [innerWidth, innerHeight], build: await fetch('build-info.json').then(response => response.json()) };
    });
    assert(records.environment.renderer && !/SwiftShader|llvmpipe|software/i.test(records.environment.renderer));
    if (config.quality === 'high') {
      await page.keyboard.press('f');
      await page.locator('#advanced-flight-settings > summary').click();
      await page.locator('#comfort-settings > summary').click();
      await page.locator('#quality-button').click();
      await page.locator('#rules-close').click();
    }
    if (config.cpuThrottle > 1) {
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: config.cpuThrottle });
    }
    const result = await collectFlight(page, config);
    const capture = `${name}-${config.quality}-${config.cpuThrottle}x${config.cold ? '-cold' : ''}.png`;
    await page.screenshot({ path: join(output, capture), animations: 'disabled' });
    records.runs.push({ ...config, ...result, capture, errors });
    writeFileSync(join(output, `${name}.json`), JSON.stringify(records, null, 2) + '\n');
    console.log(JSON.stringify({ quality: config.quality, cpuThrottle: config.cpuThrottle, fps: result.fps, frameMs: result.frameMs,
      frames: result.frameCount, incompleteFrames: result.incompleteFrames, visibleFrames: result.visibleFrames, missedMax: result.maxMissing,
      buffered: result.bufferingEntries, bufferingMs: result.bufferingMs, cells: result.collisionCellEntries, meters: result.distanceTraveled,
      p95GenerationMs: result.end.streaming.generationP95Ms, dynamic: result.end.dynamic,
      peakChunks: Math.max(...result.samples.map(sample => sample.streaming.activeChunks)), runtime: result.end.elapsed }));
    assert.equal(result.mode, 'running');
    assert(result.end.elapsed >= config.seconds && result.end.world === 0);
    assert(result.visibleFrames > 0 && result.distanceTraveled > config.seconds * 45);
    assert(result.collisionCellEntries > Math.floor(config.seconds / 6));
    assert(result.samples.every(sample => sample.deployed === 3));
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
