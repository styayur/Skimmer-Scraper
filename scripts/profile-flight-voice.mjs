import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function profileVoice(page, output, runtime) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running');
  const durationMs = 15_000;
  let modelWireBytes = 0;
  const trackResponse = async response => {
    if (!response.url().includes('/onnx/model_fp16.onnx') || response.fromServiceWorker()) return;
    const length = Number(await response.headerValue('content-length'));
    if (Number.isSafeInteger(length) && length > 0) modelWireBytes += length;
  };
  page.on('response', trackResponse);
  const configure = value => page.locator('#voice-output').evaluate((field, value) => {
    field.value = value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  const command = agent => page.evaluate(agent => {
    const field = document.querySelector('#radio-input');
    field.value = ['一号', '二号', '三号'][agent - 1] + '，你是谁？';
    field.form.requestSubmit();
  }, agent);
  const voice = () => page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot().voice);
  const completed = (previous, agent, provider) => page.waitForFunction(({ previous, agent, provider }) => {
    const state = window.__SKIMMER_SCRAPER__.snapshot().voice;
    return state.completed > previous.count && state.playbackHistory.some(entry => entry.id > previous.id && entry.agent === agent &&
      (entry.provider === provider || (provider === 'adaptive' && ['local', 'high-quality'].includes(entry.provider))));
  }, { previous, agent, provider }, { timeout: 50000 });
  const rows = [];
  async function sample(name, action) {
    await page.evaluate(async () => {
      const game = window.__SKIMMER_SCRAPER__;
      game.pause();
      await game.setPose({ x: 196, y: 410, z: 26 }, { yaw: 0, pitch: 0, roll: 0 });
      game.resume();
    });
    const before = await voice();
    const bytesBefore = modelWireBytes;
    await page.evaluate(() => {
      let first, last;
      const intervals = [], gpu = [], heap = [];
      let request;
      const tick = now => {
        if (last !== undefined) intervals.push(now - last);
        first ??= now;
        last = now;
        if (intervals.length % 15 === 0) {
          const state = window.__SKIMMER_SCRAPER__.snapshot();
          if (state.render.gpuMs != null) gpu.push(state.render.gpuMs);
          if (performance.memory) heap.push(performance.memory.usedJSHeapSize);
        }
        request = requestAnimationFrame(tick);
      };
      request = requestAnimationFrame(tick);
      window.endFlightSample = () => {
        cancelAnimationFrame(request);
        intervals.sort((a, b) => a - b);
        const p = ratio => intervals[Math.floor((intervals.length - 1) * ratio)];
        return { frames: intervals.length, elapsedMs: last-first, fps: 1000*intervals.length/(last-first),
          p50Ms: p(.5), p95Ms: p(.95), p99Ms: p(.99), worstMs: p(1), gpuMs: gpu,
          peakPageJsHeapBytes: heap.length ? Math.max(...heap) : null,
          mode: window.__SKIMMER_SCRAPER__.snapshot().mode };
      };
    });
    let failure;
    try { await action(before); } catch (error) { failure = String(error); }
    const frames = await page.evaluate(() => window.endFlightSample());
    rows.push({ name, frames, before, after: await voice(), modelWireBytes: modelWireBytes - bytesBefore, failure });
    await writeFile(path.join(output, 'flight-voice.json'), JSON.stringify({ runtime, rows }, null, 2));
    assert(!failure, failure);
    assert(frames.frames > 0 && frames.mode === 'running');
  }
  const allowFallback = value => page.locator('#voice-fallback').evaluate((field, checked) => {
    field.checked = checked;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await allowFallback(true);
  await configure('off');
  await sample('silent', async () => {
    await command(1);
    await page.waitForTimeout(durationMs);
  });
  await configure('local');
  async function speak(agent, provider) {
    const before = await voice();
    await command(agent);
    await completed({ count: before.completed, id: before.lastCompleted?.id ?? -1 }, agent, provider);
  }
  await sample('system', () => Promise.all([speak(1, 'local'), page.waitForTimeout(durationMs)]));
  await configure('off');
  await sample('kokoro-load', async () => {
    await configure('high-quality');
    await page.waitForFunction(() => {
      const k = window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro;
      if (k?.phase === 'error') throw Error(k.error + ' ' + k.detail);
      return k?.phase === 'ready';
    }, null, { timeout: 240000 });
  });
  await sample('kokoro-first-inference', () => Promise.all([speak(1, 'high-quality'), page.waitForTimeout(durationMs)]));
  await sample('kokoro-cache-hit', () => speak(1, 'high-quality'));
  assert(rows.at(-1).after.kokoro.cacheHits > rows.at(-1).before.kokoro.cacheHits);
  await sample('three-wingmates', async () => {
    for (const agent of [1, 2, 3]) await speak(agent, 'adaptive');
  });
  await allowFallback(false);
  await sample('three-wingmates-kokoro-only', async () => {
    for (const agent of [1, 2, 3]) await speak(agent, 'high-quality');
  });
  page.off('response', trackResponse);
}
