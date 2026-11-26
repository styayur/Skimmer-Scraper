import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

function frameSummary(rows) {
  const times = rows.map(row => row.ms).sort((a, b) => a - b);
  if (!times.length) return null;
  const quantile = q => times[Math.floor(q * (times.length - 1))];
  return {
    frames: times.length,
    fps: 1000 * times.length / times.reduce((total, value) => total + value, 0),
    p50Ms: quantile(.5), p95Ms: quantile(.95), p99Ms: quantile(.99), worstMs: quantile(1),
  };
}

/** Compare a matched City flight with captions and with three actual local acknowledgements. */
export async function profileVoice(page, output, runtime) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const modelRequests = [];
  const observe = request => {
    if (/kokoro|onnxruntime|\.onnx(?:$|\?)|huggingface\.co/i.test(request.url())) modelRequests.push(request.url());
  };
  page.on('request', observe);
  const rows = [];
  try {
    for (const outputMode of ['off', 'local']) {
      await page.evaluate(mode => {
        localStorage.setItem('skimmer-scraper.voice.v1', JSON.stringify({ output: mode }));
        localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 3 }));
        localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free', shield: true }));
      }, outputMode);
      const url = new URL(page.url());
      url.search = '?gen=2&seed=334458';
      await page.goto(url.href);
      await page.locator('#start-button').click();
      await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().runTime > 1);
      for (const agent of [1, 2, 3]) {
        await page.evaluate(async () => {
          const g = window.__SKIMMER_SCRAPER__;
          g.pause();
          await g.setPose({ x: 196, y: 410, z: 26 }, { yaw: 0, pitch: 0, roll: 0 });
          g.resume();
        });
        await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().companions.filter(c => c.deployed && !c.uncovered).length === 3);
        await page.keyboard.press('t');
        await page.locator('#radio-input').fill('KITE-' + agent + ', hold formation');
        await page.locator('#radio-input').press('Enter');
        const observations = await page.evaluate(async () => {
          const g = window.__SKIMMER_SCRAPER__;
          const frames = [];
          let last = await new Promise(requestAnimationFrame);
          const start = last;
          while (last - start < 12000) {
            const now = await new Promise(requestAnimationFrame);
            const s = g.snapshot();
            if (s.mode !== 'running' || document.hidden) throw Error('Flight interrupted during audio measurement');
            frames.push({ ms: now - last, clip: s.voice.activeSpeech?.voiceId ?? null });
            last = now;
          }
          return { frames, voice: g.snapshot().voice };
        });
        const target = agent + '-command';
        const spoken = observations.frames.filter(frame => frame.clip === target);
        rows.push({ agent, outputMode, flight: frameSummary(observations.frames), speaking: frameSummary(spoken),
          silent: frameSummary(observations.frames.filter(frame => !frame.clip)), voice: observations.voice });
        await writeFile(path.join(output, 'flight-voice.json'), JSON.stringify({ runtime, rows, modelRequests }, null, 2));
        assert.equal(observations.voice.output, outputMode);
        assert.equal(spoken.length > 0, outputMode === 'local', 'Requested character acknowledgement ' + target);
        assert.deepEqual(modelRequests, []);
      }
    }
  } finally {
    page.off('request', observe);
    await cdp.detach();
  }
}
