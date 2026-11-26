import { expect, test } from '@playwright/test';

test('flies through an authored city passage and streams it again after leaving the area', async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const moduleResponses: number[] = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/world-modules/celadon-court.glb')) {
      moduleResponses.push(response.status());
    }
  });
  await page.goto('/?seed=334458&gen=4');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  expect(moduleResponses).toEqual([]);
  await page.keyboard.press('g');
  await page.locator('#world-passages').check();
  await page.locator('#world-form button[type=submit]').click();
  await expect(page).toHaveURL(/passages=1/);
  await page.waitForFunction(() => {
    const state = window.__SKIMMER_SCRAPER__?.snapshot();
    return state?.ready && state.chunkStates.some(chunk => chunk.passage);
  });
  expect(moduleResponses).toEqual([200]);

  const before = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().chunkStates.find(chunk => chunk.passage)!);
  const entry = before.passage!.entry;
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await page.evaluate(async entry => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.pause();
    await game.setPose({ ...entry, z: entry.z + 32 }, { yaw: 0, pitch: 0, roll: 0 });
  }, entry);
  await page.screenshot({ path: testInfo.outputPath('generated-passage.jpg'), quality: 88 });
  const hits = await page.evaluate(entry => {
    const game = window.__SKIMMER_SCRAPER__!;
    return [
      game.surface({ ...entry, z: entry.z - 14 }, 4),
      game.surface({ ...entry, x: entry.x + 7, z: entry.z - 14 }, 0.5),
    ];
  }, entry);
  expect(hits[0]).toBeNull();
  expect(hits[1]?.chunkId).toBe('chunk:' + before.key + ':r' + before.revision);
  const crossed = await page.evaluate(() => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.resume();
    return game.advance(1.1);
  });
  expect(crossed.mode).toBe('running');
  expect(crossed.position.z).toBeLessThan(entry.z - 24);

  await page.evaluate(() => window.__SKIMMER_SCRAPER__!.setPose({ x: 9000, y: 420, z: 9000 }));
  await page.waitForFunction(key => !window.__SKIMMER_SCRAPER__!.snapshot().chunkStates.some(chunk => chunk.key === key), before.key);
  await page.evaluate(entry => window.__SKIMMER_SCRAPER__!.setPose(entry), entry);
  await page.waitForFunction(key => window.__SKIMMER_SCRAPER__!.snapshot().chunkStates.some(chunk => chunk.key === key && chunk.passage), before.key);
  const restored = await page.evaluate(key => window.__SKIMMER_SCRAPER__!.snapshot().chunkStates.find(chunk => chunk.key === key), before.key);
  expect(restored?.fingerprint).toBe(before.fingerprint);
  expect(restored?.passage).toEqual(before.passage);
  expect(moduleResponses).toEqual([200]);
});
