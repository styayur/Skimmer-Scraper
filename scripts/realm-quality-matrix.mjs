import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

export async function qualityMatrix(page, output, packDirectory) {
  const base = new URL(page.url());
  base.search = '';
  const device = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    return {
      renderer: gl.getParameter(
        gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL,
      ),
      native: !!window.__TAURI__,
      build: await (await fetch('./build-info.json')).json(),
    };
  });
  assert.match(device.renderer, /780M/);
  assert.equal(device.build.dirty, false);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const rows = [];
  const report = () =>
    writeFile(
      output,
      JSON.stringify(
        {
          device,
          seed: 334458,
          method:
            'Scripted boosted yaw, one initial pose per scenario, 12 seconds per scenario. Balanced and High, all four companion counts. Wall-clock rAF intervals.',
          rows,
        },
        null,
        2,
      ) + '\n',
    );
  const id = 'dragonspine-high-1';
  let installedHere = false;
  try {
    if (device.native) {
      const present = await page.evaluate(
        async (id) =>
          (await window.__TAURI__.core.invoke('pack_list')).some(
            (p) => p.id === id,
          ),
        id,
      );
      if (!present) {
        await page.keyboard.press('g');
        const pack = page.locator('#world-packs');
        await pack.locator('summary').click();
        await pack.locator('input').setInputFiles(path.resolve(packDirectory));
        await page.waitForFunction(
          (id) => document.querySelector('#world-packs select')?.value === id,
          id,
          { timeout: 180000 },
        );
        installedHere = true;
      }
      await page.evaluate(
        (id) => localStorage.setItem('skimmer-scraper.active-pack', id),
        id,
      );
    }
    for (const theme of ['city', 'dragon'])
      for (const quality of ['balanced', 'high'])
        for (const count of [0, 1, 2, 3]) {
          const url = new URL(base);
          url.searchParams.set('seed', '334458');
          url.searchParams.set('gen', '4');
          if (theme === 'dragon') url.searchParams.set('theme', theme);
          await page.evaluate((count) => {
            localStorage.setItem(
              'skimmer-scraper.companions.v3',
              JSON.stringify({ count }),
            );
            localStorage.setItem(
              'skimmer-scraper.rules.v3',
              JSON.stringify({ mode: 'free', shield: true }),
            );
          }, count);
          await page.goto(url.href);
          await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__);
          if (quality === 'high')
            await page.locator('#quality-button').evaluate((b) => b.click());
          await page.locator('#start-button').click();
          await page.waitForFunction(
            () => window.__SKIMMER_SCRAPER__.snapshot().runTime > 1,
          );
          await page.evaluate(async () => {
            const g = window.__SKIMMER_SCRAPER__;
            g.pause();
            await g.setPose(
              { x: -100, y: 290, z: -440 },
              { yaw: 0, pitch: 0, roll: 0 },
            );
            g.resume();
          });
          await page.keyboard.down('Shift');
          await page.keyboard.down('q');
          if (theme === 'dragon')
            await page.waitForFunction(
              (native) => {
                const d =
                  window.__SKIMMER_SCRAPER__.snapshot().streaming.realmDetail;
                return native ? d?.high > 0 : d?.resident > 0;
              },
              device.native,
              { timeout: 20000 },
            );
          const result = await page.evaluate(async () => {
            const g = window.__SKIMMER_SCRAPER__;
            const start = g.snapshot();
            const frames = [];
            let previous = await new Promise(requestAnimationFrame);
            const origin = previous;
            while (previous - origin < 12000) {
              const now = await new Promise(requestAnimationFrame);
              frames.push(now - previous);
              previous = now;
            }
            const end = g.snapshot(),
              sorted = [...frames].sort((a, b) => a - b);
            const p = (q) => sorted[Math.floor(q * (sorted.length - 1))];
            const canvas = document.querySelector('canvas');
            return {
              canvas: [canvas.width, canvas.height],
              qualityLabel:
                document.querySelector('#quality-button').textContent,
              frames: frames.length,
              averageFps: (1000 * frames.length) / (previous - origin),
              p95Ms: p(0.95),
              p99Ms: p(0.99),
              worstMs: p(1),
              elapsedSimulation: end.runTime - start.runTime,
              mode: end.mode,
              companions: end.companions.filter((w) => w.deployed).length,
              detail: end.streaming.realmDetail,
              render: end.render,
              startPosition: start.position,
              endPosition: end.position,
            };
          });
          await page.keyboard.up('q');
          await page.keyboard.up('Shift');
          assert.equal(result.mode, 'running');
          assert.equal(result.companions, count);
          assert.ok(result.elapsedSimulation > 0);
          assert.equal(!!result.detail, theme === 'dragon');
          rows.push({ theme, quality, count, ...result });
          await report();
          console.log(theme, quality, count, result.averageFps.toFixed(1));
        }
  } finally {
    if (installedHere)
      await page.evaluate(
        (id) => window.__TAURI__.core.invoke('pack_remove', { id }),
        id,
      );
  }
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const [url, output] = process.argv.slice(2);
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--use-angle=d3d11', '--disable-software-rasterizer'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__);
    await qualityMatrix(page, output);
  } finally {
    await browser.close();
  }
}
