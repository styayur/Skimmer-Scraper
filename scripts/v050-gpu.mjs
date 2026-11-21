import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const mode = process.argv[2] ?? 'soak';
assert(['soak', 'matrix'].includes(mode), 'Usage: node scripts/v050-gpu.mjs soak|matrix');
const origin = process.env.SKIMMER_URL ?? 'http://127.0.0.1:4181/';
const output = process.env.SKIMMER_EVIDENCE_DIR ?? 'evidence/v0.5/pr9-release';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: [
  '--use-angle=d3d11', '--disable-software-rasterizer', '--disable-background-timer-throttling',
] });
const evidence = { method: 'Headed hardware Chrome. Actual wall-time RAF during moving Free Flight.', driver: process.env.SKIMMER_GPU_DRIVER ?? null, runs: [] };
mkdirSync(output, { recursive: true });

async function fly(count, quality, seconds, soak) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(count => {
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free', shield: true }));
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count, formation: 'wedge', behavior: 'formation' }));
  }, count);
  try {
    const url = new URL(origin);
    url.search = '?autostart=1&seed=334458&gen=3';
    await page.goto(url.href);
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running', null, { timeout: 90_000 });
    assert(await page.evaluate(count => {
      const state = window.__SKIMMER_SCRAPER__.snapshot();
      return state.rules.mode === 'free' && state.rules.shield && state.companions.length === count;
    }, count), 'Expected shielded Free Flight with the requested companion count');
    if (quality === 'high') {
      await page.keyboard.press('f');
      await page.locator('#advanced-flight-settings > summary').click();
      await page.locator('#comfort-settings > summary').click();
      await page.locator('#quality-button').click();
      await page.locator('#rules-close').click();
    }
    await page.evaluate(async () => {
      const game = window.__SKIMMER_SCRAPER__;
      game.pause();
      await game.setPose({ x: 0, y: 328, z: 120 }, { yaw: 0, pitch: 0, roll: 0 });
      game.resume();
    });
    const environment = await page.evaluate(async () => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL), webgl: gl.getParameter(gl.VERSION),
        userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight],
        build: await fetch(new URL('build-info.json', location.href)).then(response => response.json()) };
    });
    assert(environment.renderer && !/SwiftShader|llvmpipe|software/i.test(environment.renderer), 'GPU acceleration required');
    assert.equal(environment.build.dirty, false);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const startCpu = await cdp.send('Performance.getMetrics');
    await page.exposeFunction('flightProgress', data => console.log(JSON.stringify({ soak, quality, count, ...data })));
    await page.keyboard.down('Shift');
    let turning = false;
    let turn = 0;
    let inputError;
    const input = soak && setInterval(async () => {
      if (turning) return;
      turning = true;
      const key = turn++ % 2 ? 'e' : 'q';
      try { await page.keyboard.down(key); await page.waitForTimeout(320); await page.keyboard.up(key); }
      catch (error) { inputError = error; }
      finally { turning = false; }
    }, 22_000);
    let sample;
    try {
      sample = await page.evaluate(async seconds => {
        const game = window.__SKIMMER_SCRAPER__;
        const snapshot = () => {
          const state = game.snapshot();
          return { mode: state.mode, time: state.runTime, position: state.position, buffering: state.buffering,
            companions: state.companions.length, shieldImpacts: state.shieldImpacts, world: state.journey.worldIndex,
            chunks: state.streaming?.activeChunks ?? 0, staticBvhs: state.streaming?.bvhCount ?? 0,
            dynamicBvhs: state.streaming?.dynamicBvhCount ?? null, movingStructures: state.dynamicStructures.length,
            queuedChunks: state.streaming?.queuedChunks ?? 0, drawCalls: state.render.calls, triangles: state.render.triangles,
            geometries: state.render.geometries, textures: state.render.textures, heap: performance.memory?.usedJSHeapSize ?? null };
        };
        const start = performance.now();
        const frames = [];
        const samples = [{ wallMs: 0, ...snapshot() }];
        const longTasks = [];
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ at: entry.startTime - start, ms: entry.duration }))));
        observer.observe({ type: 'longtask', buffered: false });
        let previous = start;
        let nextSample = start + 1000;
        let nextProgress = start + 60_000;
        await new Promise(resolve => {
          const frame = now => {
            frames.push(now - previous);
            previous = now;
            if (now >= nextSample || now - start >= seconds * 1000) {
              samples.push({ wallMs: now - start, ...snapshot() });
              nextSample = now + 1000;
            }
            if (now >= nextProgress) {
              const current = samples.at(-1);
              window.flightProgress({ wallSeconds: Math.round((now - start) / 1000), simulatedSeconds: Math.round(current.time),
                z: Math.round(current.position.z), mode: current.mode, buffering: current.buffering, chunks: current.chunks, movingStructures: current.movingStructures });
              nextProgress += 60_000;
            }
            if (now - start < seconds * 1000 && samples.at(-1).mode === 'running') requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        observer.disconnect();
        const sorted = [...frames].sort((a, b) => a - b);
        const percentile = p => sorted[Math.floor((sorted.length - 1) * p)];
        const distanceMeters = samples.slice(1).reduce((total, sample, index) => {
          const prior = samples[index];
          if (sample.world !== prior.world) return total;
          return total + Math.hypot(sample.position.x - prior.position.x, sample.position.y - prior.position.y, sample.position.z - prior.position.z);
        }, 0);
        const peaks = Object.fromEntries(['chunks', 'staticBvhs', 'dynamicBvhs','movingStructures','drawCalls','triangles','geometries','textures','heap']
          .map(key => [key, samples.reduce((peak, sample) => Math.max(peak, sample[key] ?? 0), 0)]));
        return { wallSeconds: (previous - start) / 1000, simulatedSeconds: samples.at(-1).time - samples[0].time,
          distanceMeters, frameCount: frames.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
          maximumMs: sorted.at(-1), fps: 1000 * frames.length / (previous - start), peaks, samples, longTasks };
      }, seconds);
    } finally {
      if (input) clearInterval(input);
      await page.keyboard.up('Shift').catch(() => {});
    }
    if (inputError) throw inputError;
    const endCpu = await cdp.send('Performance.getMetrics');
    const metric = (values, name) => values.metrics.find(item => item.name === name)?.value ?? 0;
    const result = { environment, count, quality, soak, requestedSeconds: seconds, pageErrors: errors,
      taskMs: (metric(endCpu, 'TaskDuration') - metric(startCpu, 'TaskDuration')) * 1000, ...sample };
    evidence.runs.push(result);
    writeFileSync(join(output, `gpu-${mode}.json`), JSON.stringify(evidence, null, 2) + '\n');
    if (soak || count === 3) await page.screenshot({ path: join(output, `gpu-${mode}-${quality}.png`), animations: 'disabled' });
    assert.equal(errors.length, 0);
    assert(result.samples.every(sample => sample.mode === 'running' && sample.companions === count));
    assert(result.distanceMeters > seconds * 25 && result.simulatedSeconds >= seconds * 0.95, 'Insufficient actual flight time or travel');
    if (soak) assert(result.wallSeconds >= 900 && result.simulatedSeconds >= 900, 'At least fifteen minutes of continuous flight are required');
    console.log(JSON.stringify({ soak, quality, count, seconds: result.wallSeconds, time: result.simulatedSeconds,
      meters: result.distanceMeters, p50: result.p50Ms, p95: result.p95Ms, p99: result.p99Ms, fps: result.fps, peaks: result.peaks, errors }));
  } finally { await context.close(); }
}

try {
  if (mode === 'soak') await fly(3, 'balanced', 930, true);
  else for (const quality of ['balanced', 'high']) for (const count of [0, 1, 2, 3]) await fly(count, quality, 15, false);
} finally { await browser.close(); }
