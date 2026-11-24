import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { collectFlight } from './streaming-flight-sample.mjs';

const [origin, output, expectedSha] = process.argv.slice(2);
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
assert.match(expectedSha, /^[0-9a-f]{40}$/);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer', '--enable-precise-memory-info',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  for (const theme of ['city', 'dragon']) {
    for (const quality of ['balanced', 'high']) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const url = new URL(origin);
      url.search = new URLSearchParams({ seed: '334458', theme, gen: '4' });
      await page.goto(url.href);
      await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 90000 });
      const environment = await page.evaluate(async () => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        return { build: await (await fetch('./build-info.json')).json(), viewport: [innerWidth, innerHeight],
          renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) };
      });
      assert.equal(environment.build.sourceCommit, expectedSha);
      assert.match(environment.renderer, /Radeon.*780M/i);
      await page.locator('#start-button').click();
      if (quality === 'high') {
        await page.keyboard.press('f');
        await page.locator('#advanced-flight-settings > summary').click();
        await page.locator('#comfort-settings > summary').click();
        await page.locator('#quality-button').click();
        assert.match(await page.locator('#quality-button').innerText(), /高/);
        await page.locator('#rules-close').click();
      }
      await page.evaluate(() => window.addEventListener('skimmer-flight-sample-start', () => {
        window.flightLongTasks = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.flightLongTasks.push([entry.startTime, entry.duration]);
        }).observe({ type: 'longtask' });
      }, { once: true }));
      const result = await collectFlight(page, { seconds: 44, altitude: 410, cold: false });
      const longTasks = await page.evaluate(() => window.flightLongTasks);
      const record = { environment, browser: browser.version(), theme, quality, errors, longTasks, ...result };
      const name = theme + '-' + quality;
      await writeFile(path.join(output, name + '.json'), JSON.stringify(record) + '\n');
      await page.screenshot({ path: path.join(output, name + '.png') });
      console.log(name, result.frameMs, result.worstFrameMs, result.bufferingMs);
      assert.equal(result.end.deployed, 3);
      assert.equal(result.mode, 'running');
      assert(result.end.elapsed >= 44 && result.distanceTraveled > 1980);
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
