import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

export async function checkPack(page, output, directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'world-pack.json'), 'utf8'),
  );
  const bytes = manifest.files.reduce((s, f) => s + f.bytes, 0);
  assert(bytes > 128 * 1024 ** 2);
  await page.keyboard.press('g');
  await page.locator('#world-packs > summary').click();
  const panel = page.locator('#world-packs');
  const present = await page.evaluate(
    async (id) =>
      (await window.__TAURI__.core.invoke('pack_list')).some(
        (p) => p.id === id,
      ),
    manifest.id,
  );
  if (!present) {
    await panel.locator('input').setInputFiles(path.resolve(directory));
    await page.waitForFunction(
      (id) => document.querySelector('#world-packs select')?.value === id,
      manifest.id,
      { timeout: 180000 },
    );
  }
  await panel.locator('select').selectOption(manifest.id);
  await panel.locator('[data-pack-open]').click();
  await page.waitForFunction(
    () =>
      window.__SKIMMER_SCRAPER__?.snapshot().streaming?.realmDetail?.high > 0,
    null,
    { timeout: 60000 },
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () => window.__SKIMMER_SCRAPER__?.snapshot().runTime > 2,
  );
  await page.screenshot({ path: path.join(output, 'high-streaming.png') });
  const samples = [];
  const duration = Number(process.env.SKIMMER_SOAK_SECONDS ?? 20);
  const until = Date.now() + duration * 1000;
  while (Date.now() < until) {
    const sample = await page.evaluate(async () => {
      const start = performance.now(),
        deltas = [];
      let last = start;
      while (last - start < 1000) {
        const now = await new Promise(requestAnimationFrame);
        if (now > last) deltas.push(now - last);
        last = now;
      }
      const s = window.__SKIMMER_SCRAPER__.snapshot();
      return {
        ms: last - start,
        frames: deltas.length,
        worstMs: Math.max(...deltas),
        mode: s.mode,
        runTime: s.runTime,
        position: s.position,
        detail: s.streaming.realmDetail,
        buffering: s.buffering,
        triangles: s.streaming.renderTriangles,
        heapBytes: performance.memory?.usedJSHeapSize,
      };
    });
    assert.equal(sample.mode, 'running');
    samples.push(sample);
  }
  const report = {
    version: manifest.packVersion,
    id: manifest.id,
    bytes,
    tiles: manifest.files.length,
    device: 'Tauri WebView2',
    resolution: '1920x1080 CSS / DPR 1',
    durationSeconds: duration,
    samples,
  };
  await writeFile(
    path.join(output, 'high-streaming.json'),
    JSON.stringify(report, null, 2),
  );
  if (!present) {
    await page.keyboard.press('g');
    const details = page.locator('#world-packs');
    if (!(await details.evaluate((e) => e.open)))
      await details.locator('summary').click();
    await details.locator('select').selectOption(manifest.id);
    await details.locator('[data-pack-remove]').click();
    await page.waitForFunction(
      async (id) =>
        !(await window.__TAURI__.core.invoke('pack_list')).some(
          (p) => p.id === id,
        ),
      manifest.id,
    );
  }
}
