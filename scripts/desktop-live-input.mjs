import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function liveInput(page, output) {
  const report = {
    build: await page.evaluate(async () =>
      (await fetch('./build-info.json')).json(),
    ),
  };
  const save = () =>
    writeFile(
      path.join(output, 'live-input.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running',
  );
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  const statuses = [];
  page.on('response', (r) => {
    if (r.url() === 'https://api.deepseek.com/chat/completions')
      statuses.push(r.status());
  });
  if (process.env.DEEPSEEK_API_KEY) {
    await page.locator('.model-settings summary').click();
    await page.locator('#ai-model').fill('deepseek-flash');
    await page.locator('#ai-budget').fill('1');
    await page.locator('#ai-timeout').fill('20000');
    try {
      await page.locator('#ai-key').fill(process.env.DEEPSEEK_API_KEY);
    } catch {
      throw Error('Could not configure the session credential');
    }
    await page.locator('#ai-connect').click();
    await page.locator('#rules-close').click();
    await page
      .waitForFunction(
        () => {
          const m = window.__SKIMMER_SCRAPER__.snapshot().cooperation.model;
          return m.requests > 0 && !m.pending;
        },
        null,
        { timeout: 85000 },
      )
      .catch(() => {});
    report.byok = await page.evaluate(() => {
      const m = window.__SKIMMER_SCRAPER__.snapshot().cooperation.model;
      return {
        requests: m.requests,
        successes: m.successes,
        pending: m.pending,
      };
    });
    report.byok.httpStatus = statuses;
    await save();
    await page.keyboard.press('f');
  }
  const voice = page.locator('.voice-settings');
  if (!(await voice.evaluate((e) => e.open)))
    await voice.locator('summary').click();
  await page.locator('#voice-output').selectOption('high-quality');
  await page
    .waitForFunction(
      () =>
        ['ready', 'error', 'unavailable'].includes(
          window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro?.phase,
        ),
      null,
      { timeout: 180000 },
    )
    .catch(() => {});
  report.kokoro = await page.evaluate(
    () => window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro,
  );
  if (report.kokoro.phase === 'ready') {
    await page.locator('#voice-preview').click();
    await page.locator('#rules-close').click();
    report.inferenceFlight = await page.evaluate(async () => {
      const g = window.__SKIMMER_SCRAPER__,
        rows = [];
      let last = await new Promise(requestAnimationFrame);
      const start = g.snapshot().runTime;
      for (let i = 0; i < 2000; i++) {
        const before = g.snapshot().voice.kokoro.phase;
        const now = await new Promise(requestAnimationFrame);
        rows.push({ dt: now - last, phase: before });
        last = now;
        if (
          i > 30 &&
          ['failed', 'completed'].includes(g.snapshot().voice.preview.phase)
        )
          break;
      }
      const phases = {};
      for (const { dt, phase } of rows) {
        const p = (phases[phase] ??= { frames: 0, totalMs: 0, worstMs: 0 });
        p.frames++;
        p.totalMs += dt;
        p.worstMs = Math.max(p.worstMs, dt);
      }
      const s = g.snapshot();
      return {
        phases,
        elapsedSimulation: s.runTime - start,
        preview: s.voice.preview.phase,
        kokoro: s.voice.kokoro,
      };
    });
  } else await page.locator('#rules-close').click();
  await save();
  await page.evaluate(() => {
    document.title = 'Skimmer-Scraper · Xbox 手柄验收 · 请按 Start 暂停';
  });
  console.log('Physical controller observation started');
  report.gamepad = await page.evaluate(async () => {
    const g = window.__SKIMMER_SCRAPER__,
      begin = performance.now(),
      baseline = new Map();
    const result = {
      device: null,
      axisDelta: 0,
      startDown: false,
      pausedAfterStart: false,
      startMode: g.snapshot().mode,
    };
    while (performance.now() - begin < 90000) {
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        result.device = pad.id;
        if (!baseline.has(pad.index)) baseline.set(pad.index, pad.axes.slice());
        pad.axes.forEach((v, i) => {
          result.axisDelta = Math.max(
            result.axisDelta,
            Math.abs(v - baseline.get(pad.index)[i]),
          );
        });
        if (pad.buttons[9]?.pressed) result.startDown = true;
      }
      if (result.startDown && g.snapshot().mode === 'paused') {
        result.pausedAfterStart = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    return result;
  });
  await save();
  assert.ok(
    report.gamepad.pausedAfterStart,
    'Physical Start input was not observed pausing the game',
  );
}
