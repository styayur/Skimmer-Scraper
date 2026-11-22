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

const collectFlight = async (page, { seconds, altitude, cold }) => {
  await page.evaluate(async ({ altitude, cold }) => {
    const game = window.__SKIMMER_SCRAPER__;
    game.pause();
    const position = cold ? { x: 4_596, y: altitude, z: 4_436 } : { x: 196, y: altitude, z: 26 };
    await game.setPose(position, { pitch: 0, yaw: 0, roll: 0 });
  }, { altitude, cold });
  if (!cold) await page.waitForFunction(() => {
    const { streaming } = window.__SKIMMER_SCRAPER__.snapshot();
    return streaming.queuedChunks === 0 && streaming.generatingChunks === 0;
  }, null, { timeout: 30_000 });

  return page.evaluate(async seconds => {
    const game = window.__SKIMMER_SCRAPER__;
    const controlAt = t => {
      // Accelerate, reverse twice using opposite banks, then climb and dive briefly.
      const keys = t < 26 || t >= 36 ? ['ShiftLeft'] : [];
      if (t >= 10 && t < 11.57) keys.push('KeyA', 'KeyQ');
      if (t >= 19 && t < 20.57) keys.push('KeyD', 'KeyE');
      if (t >= 25 && t < 25.15) keys.push('KeyS');
      if (t >= 30 && t < 30.26) keys.push('KeyW');
      if (t >= 35 && t < 35.13) keys.push('KeyS');
      return keys;
    };
    let held = [];
    const press = keys => {
      for (const code of held) if (!keys.includes(code)) window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      for (const code of keys) if (!held.includes(code)) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      held = keys;
    };

    // Sample the portion of the camera frustum that can see the near city. This is
    // a chunk-readiness projection: intervening buildings can occlude individual rays.
    const viewCoverage = state => {
      const active = new Set(state.chunkStates.filter(chunk => chunk.state === 'ACTIVE').map(chunk => chunk.key));
      const [x, y, z, w] = state.cameraOrientation;
      const ox = state.cameraPosition.x + state.renderOrigin.x;
      const oy = state.cameraPosition.y + state.renderOrigin.y;
      const oz = state.cameraPosition.z + state.renderOrigin.z;
      const vertical = Math.tan(state.fov * Math.PI / 360);
      const horizontal = vertical * innerWidth / innerHeight;
      const visible = new Set();
      for (const row of [-0.82, -0.48, -0.14, 0.2]) for (const column of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const lx = column * horizontal, ly = row * vertical, lz = -1;
        const ax = 2 * (y * lz - z * ly), ay = 2 * (z * lx - x * lz), az = 2 * (x * ly - y * lx);
        const rx = lx + w * ax + y * az - z * ay;
        const ry = ly + w * ay + z * ax - x * az;
        const rz = lz + w * az + x * ay - y * ax;
        if (ry >= -0.015) continue;
        for (const level of [35, 125, 215]) {
          const distance = (level - oy) / ry;
          const horizontalDistance = Math.hypot(rx, rz) * distance;
          if (horizontalDistance < 90 || horizontalDistance > 620) continue;
          visible.add(`${Math.floor((ox + rx * distance) / 220)}:${Math.floor((oz + rz * distance) / 220)}`);
        }
      }
      const missing = [...visible].filter(key => !active.has(key));
      return { tested: visible.size, missing };
    };

    const initial = game.snapshot();
    const frames = [];
    const samples = [];
    let last = await new Promise(requestAnimationFrame);
    const started = last;
    let lastSample = -1000;
    let oldState = initial;
    let distanceTraveled = 0;
    let visibleFrames = 0;
    let incompleteFrames = 0;
    let maxMissing = 0;
    let bufferingEntries = 0;
    let bufferingFrames = 0;
    let bufferingMs = 0;
    let collisionCellEntries = 0;
    let readyAtPreviousFrame = 0;
    const cell = p => `${Math.floor(p.x / 220)}:${Math.floor(p.z / 220)}`;
    const sample = state => ({ elapsed: state.runTime - initial.runTime, position: state.position,
      attitude: state.attitude, speed: state.speed, buffering: state.buffering, world: state.journey.worldIndex,
      stalledCompanions: state.companions.map(agent => agent.uncovered), deployed: state.companions.filter(agent => agent.deployed).length,
      drawCalls: state.render.calls, renderGeometries: state.render.geometries, textures: state.render.textures,
      dynamic: state.dynamicStructures.length, streaming: state.streaming, shieldImpacts: state.shieldImpacts });

    game.resume();
    oldState = game.snapshot();
    press(controlAt(0));
    try {
      while (oldState.runTime - initial.runTime < seconds && oldState.mode === 'running') {
        const now = await new Promise(requestAnimationFrame);
        const frameTime = now - last;
        if (now - started > (seconds + 50) * 1000) throw new Error('Scripted flight did not progress.');
        last = now;
        const state = game.snapshot();
        const path = state.position;
        const previous = oldState.position;
        distanceTraveled += Math.hypot(path.x - previous.x, path.y - previous.y, path.z - previous.z);
        if (cell(path) !== cell(previous)) {
          collisionCellEntries++;
          const [cx, cz] = cell(path).split(':').map(Number);
          const wasReady = oldState.chunkStates.filter(chunk => {
            if (chunk.state !== 'ACTIVE') return false;
            const [x, z] = chunk.key.split(':').map(Number);
            return Math.abs(x - cx) <= 1 && Math.abs(z - cz) <= 1;
          }).length === 9;
          if (wasReady && !oldState.buffering) readyAtPreviousFrame++;
        }
        const coverage = viewCoverage(state);
        if (coverage.tested > 0) visibleFrames++;
        if (coverage.missing.length > 0) incompleteFrames++;
        if (state.buffering && !oldState.buffering) bufferingEntries++;
        if (state.buffering) { bufferingFrames++; bufferingMs += frameTime; }
        if (now - lastSample >= 500 || coverage.missing.length > maxMissing || state.buffering !== oldState.buffering) {
          samples.push({ ms: now - started, ...sample(state), projectedCells: coverage.tested, missingCells: coverage.missing });
          lastSample = now;
          maxMissing = Math.max(maxMissing, coverage.missing.length);
        }
        frames.push(frameTime);
        press(controlAt(state.runTime - initial.runTime));
        oldState = state;
      }
    } finally {
      press([]);
      game.pause();
    }

    const sorted = frames.sort((a, b) => a - b);
    const percentile = p => sorted[Math.floor(p * (sorted.length - 1))];
    return { initial: sample(initial), end: sample(oldState), mode: oldState.mode, seconds: (last - started) / 1000,
      fps: sorted.length * 1000 / (last - started), frameCount: sorted.length, frameMs: [percentile(.5), percentile(.95), percentile(.99)],
      visibleFrames, incompleteFrames, maxMissing, bufferingEntries, bufferingFrames, bufferingMs, collisionCellEntries,
      readyAtPreviousFrame, distanceTraveled,
      samples };
  }, seconds);
};

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
