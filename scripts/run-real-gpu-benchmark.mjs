import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const baseUrl = process.env.BENCHMARK_URL ?? 'http://127.0.0.1:4174/';
const channel = process.env.BENCHMARK_CHANNEL;
const hardwareName = process.env.GPU_NAME ?? 'unknown';
const hardwareDriver = process.env.GPU_DRIVER ?? 'unknown';
const errors = [];

const frameSummary = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
  const averageMs = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
  return {
    sampleCount: samples.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    averageMs,
    maxMs: Math.max(0, ...samples),
    averageFps: 1000 / Math.max(0.001, averageMs),
    meetsP95_33_3ms: percentile(0.95) <= 33.333,
    meetsApprox60Fps: 1000 / Math.max(0.001, averageMs) >= 55,
  };
};

const sampleFrames = (page, durationMs) => page.evaluate(async (sampleDurationMs) => new Promise((resolve) => {
  const samples = [];
  const started = performance.now();
  let previous = started;
  const tick = (now) => {
    const delta = now - previous;
    previous = now;
    if (delta > 0 && delta < 1_000) samples.push(delta);
    if (now - started >= sampleDurationMs) resolve(samples);
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), durationMs);

const readSnapshot = (page) => page.evaluate(() => {
  const bridge = window.__SKIMMER_SCRAPER__;
  if (!bridge) throw new Error('Debug bridge unavailable.');
  const state = bridge.snapshot();
  return {
    mode: state.mode,
    runTime: state.runTime,
    position: state.position,
    world: state.world,
    streaming: state.streaming ? {
      activeChunks: state.streaming.activeChunks,
      bvhCount: state.streaming.bvhCount,
      estimatedCpuGeometryBytes: state.streaming.estimatedCpuGeometryBytes,
      generationAvgMs: state.streaming.generationAvgMs,
      generationP95Ms: state.streaming.generationP95Ms,
    } : null,
    render: state.render,
    surfaceLocked: state.surfaceLocked,
  };
});

let browser = null;
let evidence;
try {
  browser = await chromium.launch({
    headless: false,
    ...(channel ? { channel } : {}),
    args: [
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      '--disable-software-rasterizer',
      '--use-angle=d3d11',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const benchmarkUrl = new URL(baseUrl);
  benchmarkUrl.search = '?autostart=1&seed=real-gpu-benchmark&preset=neon&world=stable';
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(benchmarkUrl.toString());
  await page.waitForFunction(() => {
    const bridge = window.__SKIMMER_SCRAPER__;
    return bridge?.snapshot().ready === true && bridge.snapshot().mode === 'running';
  }, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const streaming = window.__SKIMMER_SCRAPER__?.snapshot().streaming;
    return streaming && streaming.queuedChunks === 0 && streaming.generatingChunks === 0;
  }, { timeout: 90_000 });
  await page.evaluate(() => {
    if (!window.__SKIMMER_SCRAPER__?.pause()) throw new Error('Unable to pause benchmark scene.');
  });
  await page.waitForTimeout(800);

  const balancedFrames = await sampleFrames(page, 10_000);
  const balanced = await readSnapshot(page);
  await page.screenshot({ path: 'evidence/v0.2.0-real-gpu-balanced.png', fullPage: true, animations: 'disabled' });
  await page.locator('#quality-button').click();
  await page.waitForTimeout(1_000);
  const highFrames = await sampleFrames(page, 10_000);
  const high = await readSnapshot(page);
  await page.screenshot({ path: 'evidence/v0.2.0-real-gpu-high.png', fullPage: true, animations: 'disabled' });

  const environment = await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    const gl = canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    const performanceMemory = performance.memory ?? null;
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : null,
      vendor: gl && extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null,
      renderer: gl && extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
      memory: performanceMemory,
    };
  });
  const software = /swiftshader|llvmpipe|software/i.test(environment.renderer ?? '');
  const balancedSummary = frameSummary(balancedFrames);
  const highSummary = frameSummary(highFrames);
  const benchmarkStatus = software
    ? 'not_performed_software_renderer'
    : balancedSummary.meetsP95_33_3ms && highSummary.meetsP95_33_3ms
      ? 'pass'
      : 'hardware_renderer_target_not_met';

  evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceClass: software ? 'software_renderer_invalid_for_hardware_gate' : 'real_gpu_benchmark',
    status: benchmarkStatus,
    targetDevice: {
      os: 'Windows 11',
      recordedGpu: hardwareName,
      recordedDriver: hardwareDriver,
      requestedResolution: '1920x1080',
      requestedQuality: ['balanced', 'high'],
    },
    environment,
    balanced: { performance: balancedSummary, snapshot: balanced },
    high: { performance: highSummary, snapshot: high },
    consoleErrors: errors,
    method: 'Headed Chromium, paused simulation, 10 seconds of requestAnimationFrame timestamps per quality preset at 1920x1080.',
    caveat: 'Frame timing is only a real-GPU certificate when the unmasked WebGL renderer identifies hardware (not SwiftShader/llvmpipe/software).',
  };
} catch (error) {
  evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceClass: 'real_gpu_benchmark_failed_to_start',
    status: 'blocked',
    targetDevice: { os: 'Windows 11', recordedGpu: hardwareName, recordedDriver: hardwareDriver },
    error: error instanceof Error ? error.message : String(error),
    consoleErrors: errors,
    caveat: 'No hardware performance result is claimed.',
  };
} finally {
  if (browser) await browser.close();
}

writeFileSync('evidence/v0.2.0-real-gpu.json', `${JSON.stringify(evidence, null, 2)}
`);
console.log(JSON.stringify(evidence, null, 2));
process.exit(evidence.status === 'pass' || evidence.status === 'not_performed_software_renderer' ? 0 : 1);
