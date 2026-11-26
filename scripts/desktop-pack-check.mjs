import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

export async function checkDownloadCancellation(page, output, runtime) {
  const list = () => page.evaluate(async () =>
    (await window.__TAURI__.core.invoke('pack_list')).map(pack => [pack.id, pack.files.map(f => f.sha256)]));
  const before = await list();
  const panel = page.locator('#world-packs');
  await page.keyboard.press('g');
  await panel.locator('summary').click();
  const attempts = [];
  for (let i = 0; i < 2; i++) {
    await panel.locator('[data-pack-download]').click();
    const deadline = Date.now() + 90000;
    let progress;
    while (!(progress?.received > 0) && Date.now() < deadline) {
      progress = await page.evaluate(() => window.__TAURI__.core.invoke('official_pack_progress'));
      if (!(progress?.received > 0)) await page.waitForTimeout(250);
    }
    assert(progress?.received > 0, 'The official download must transfer bytes before cancellation');
    const started = Date.now();
    await panel.locator('[data-pack-cancel]').click();
    await panel.locator('[data-pack-cancel]').waitFor({state:'hidden',timeout:90000});
    assert.match(await panel.locator('[role=status]').textContent(), /已取消/);
    assert.deepEqual(await list(), before);
    attempts.push({ progress, cancelMs: Date.now() - started });
  }
  await writeFile(path.join(output, 'pack-cancellation.json'), JSON.stringify({runtime, attempts, preservedPackages: before.length}, null, 2));
}

export async function checkPack(page, output, directory, runtime) {
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
  await page.evaluate(async () => {
    const game=window.__SKIMMER_SCRAPER__;
    game.pause();await game.setPose({x:-100,y:290,z:-440},{yaw:0,pitch:0,roll:0});game.resume();
  });
  await page.keyboard.down('q');
  await page.keyboard.down('Shift');
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().streaming?.realmDetail?.high>0);
  await page.screenshot({ path: path.join(output, 'high-streaming.png') });
  const samples = [];
  const frameTimes = [];
  const initialBuffering = await page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot().bufferingEvents);
  const duration = Number(process.env.SKIMMER_SOAK_SECONDS ?? 20);
  const until = Date.now() + duration * 1000;
  const startTime = await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot().runTime);
  while (Date.now() < until || (samples.at(-1)?.runTime ?? startTime)-startTime < duration) {
    assert(Date.now()<until+300000,'Simulation could not sustain the requested flight time');
    const sample = await page.evaluate(async () => {
      const start = await new Promise(requestAnimationFrame),
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
        deltas,
        worstMs: Math.max(...deltas),
        mode: s.mode,
        runTime: s.runTime,
        position: s.position,
        detail: s.streaming.realmDetail,
        buffering: s.buffering,
        residentGeometryBytes: s.streaming.estimatedCpuGeometryBytes,
        generationP95Ms: s.streaming.generationP95Ms,
        triangles: s.streaming.renderTriangles,
        activationP95Ms: s.streaming.activationP95Ms,
        gpuMs: s.render.gpuMs,
        drawCalls: s.render.calls,
        dynamicEntities: s.streaming.dynamicBvhCount,
        deployed: s.companions.filter(agent => agent.deployed).length,
        heapBytes: performance.memory?.usedJSHeapSize,
      };
    });
    assert.equal(sample.mode, 'running');
    assert.ok(sample.detail,'Flight left Dragonspine Realm');
    frameTimes.push(...sample.deltas);
    delete sample.deltas;
    samples.push(sample);
  }
  frameTimes.sort((a,b) => a-b);
  const percentile = q => frameTimes[Math.floor((frameTimes.length-1)*q)];
  const finalBuffering = await page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot().bufferingEvents);
  const report = {
    runtime,
    frameMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), worst: percentile(1) },
    fps: 1000 * frameTimes.length / frameTimes.reduce((sum, ms) => sum + ms, 0),
    bufferingEvents: { entries: finalBuffering.entries - initialBuffering.entries,
      ms: finalBuffering.totalMs - initialBuffering.totalMs, recent: finalBuffering.recent },
    version: manifest.packVersion,
    id: manifest.id,
    bytes,
    tiles: manifest.files.length,
    device: 'Tauri WebView2',
    control: 'Scripted keyboard boost and yaw in the shipping flight loop, one initial pose at 290 m',
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
