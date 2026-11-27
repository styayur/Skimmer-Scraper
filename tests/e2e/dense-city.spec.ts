import { expect, test } from '@playwright/test';

test('city can launch before its geometry worker downloads and use it afterwards', async ({ page, context }) => {
  let releaseWorker!: () => void;
  const gate = new Promise<void>(resolve => { releaseWorker = resolve; });
  let requested = false;
  await context.route('**/cityChunk.worker-*.js', async route => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/?seed=334458&gen=4', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
    expect(requested).toBe(true);
    await page.locator('#start-button').click();
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
    const streaming = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().streaming!);
    expect(streaming.bvhCount).toBeGreaterThan(0);
    expect(streaming.workerBuildP95Ms).toBeNull();
  } finally {
    releaseWorker();
  }
  await page.waitForFunction(() => (window.__SKIMMER_SCRAPER__?.snapshot().streaming?.workerBuildP95Ms ?? 0) > 0);
});

test('reproduces legacy URLs and flies through five dense-city worlds with three companions', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('skimmer-scraper.best.v2:stable:sakura:gen2:334458', '21.4');
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
  });
  const ready = () => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const snapshot = () => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
  await page.goto('/?seed=334458&preset=sakura&world=stable&gen=2');
  await ready();
  const legacy = await snapshot();
  expect(legacy.generatorVersion).toBe(2);
  expect(legacy.worldFingerprint).toBe(3887776065);
  expect(legacy.best).toBe(21.4);
  await page.keyboard.press('g');
  await expect(page.locator('#world-legacy-note')).toContainText('樱色黄昏');
  await page.locator('#world-upgrade').click();
  await page.waitForURL(/gen=4/);
  await ready();
  const city = await snapshot();
  expect(city.generatorVersion).toBe(4);
  expect(city.seed).toBe(legacy.seed);
  expect(city.worldPreset).toBe('city');
  expect(city.best).toBe(0);
  expect(city.worldFingerprint).not.toBe(legacy.worldFingerprint);
  expect(await page.evaluate(() => localStorage.getItem('skimmer-scraper.best.v2:stable:sakura:gen2:334458'))).toBe('21.4');
  await page.screenshot({ path: testInfo.outputPath('dense-title.png'), animations: 'disabled' });

  await page.keyboard.press('g');
  await expect(page.locator('#world-panel')).toBeVisible();
  await expect(page.locator('#world-legacy')).toBeHidden();
  await expect(page.locator('#world-preset-select')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await page.locator('#run-mode').selectOption('free');
  await page.locator('#companion-count').selectOption('3');
  await page.keyboard.press('Escape');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  const flight = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(4));
  expect(flight.position.z).toBeLessThan(-80);
  expect(flight.shieldImpacts).toBe(0);
  expect(flight.companions).toHaveLength(3);
  await page.screenshot({ path: testInfo.outputPath('dense-flight.png'), animations: 'disabled' });

  const seeds = new Set<number>();
  for (let index = 1; index <= 5; index++) {
    const arrival = await page.evaluate(async (crossing) => {
      const game = window.__SKIMMER_SCRAPER__!;
      game.pause();
      await game.setPose({ x: 0, y: 519, z: 120 }, { pitch: 1.15 });
      game.resume();
      const state = await game.advance(5);
      return state.journey.crossings < crossing ? game.advance(3) : state;
    }, index);
    expect(arrival.mode).toBe('running');
    expect(arrival.journey.worldIndex).toBe(index);
    expect(arrival.generatorVersion).toBe(4);
    expect(arrival.worldPreset).toBe('city');
    expect(arrival.companions).toHaveLength(3);
    expect(arrival.streaming!.bvhCount).toBeLessThanOrEqual(41);
    seeds.add(arrival.seed);
  }
  expect(seeds.size).toBe(5);
  expect((await snapshot()).journey.easterEggUnlocked).toBe(true);
  expect(errors).toEqual([]);
});
