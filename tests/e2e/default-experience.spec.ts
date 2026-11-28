import { expect, test, type Page } from '@playwright/test';

const snapshot = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
const ready = (page: Page) => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);

test('new players take off with a shield, chase view and three offline companions', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = () => { throw new Error('Unexpected microphone access'); };
    }
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  await page.keyboard.press('f');
  await expect(page.locator('#run-mode')).toHaveValue('free');
  await expect(page.locator('#camera-mode')).toHaveValue('chase');
  await expect(page.locator('#companion-count')).toHaveValue('3');
  await expect(page.locator('[data-control="profile"]')).toHaveValue('precision');
  await expect(page.locator('#run-grace')).toBeHidden();
  await expect(page.locator('#anchor-x')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect.poll(async () => (await snapshot(page)).mode).toBe('running');
  const flight = await snapshot(page);
  expect(flight.rules.mode).toBe('free');
  expect(flight.rules.shield).toBe(true);
  expect(flight.cameraMode).toBe('chase');
  expect(flight.companionSettings.formation).toBe('wedge');
  expect(flight.companions).toHaveLength(3);
  expect(flight.cooperation.model.connected).toBe(false);
  expect(flight.cooperation.model.requests).toBe(0);
  await expect(page.locator('#companion-status [data-wing]')).toHaveCount(3);
  await expect(page.locator('#hud-timer')).toBeHidden();
  await expect(page.getByRole('meter')).toBeHidden();
  const hudUpdates = await page.evaluate(async () => {
    const timer = document.getElementById('hud-timer')!;
    const best = document.getElementById('hud-best')!;
    const meter = document.querySelector('.grace-meter')!;
    const halo = document.getElementById('journey-easter-egg')!;
    const writes = { best: 0, graceMaximum: 0, haloVisibility: 0 };
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.target === best) writes.best++;
        if (record.target === meter) writes.graceMaximum++;
        if (record.target === halo) writes.haloVisibility++;
      }
    });
    observer.observe(best, { childList: true });
    observer.observe(meter, { attributes: true, attributeFilter: ['aria-valuemax'] });
    observer.observe(halo, { attributes: true, attributeFilter: ['hidden'] });
    const before = timer.textContent;
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    observer.disconnect();
    return { before, after: timer.textContent, writes };
  });
  await testInfo.attach('flight-hud-updates', {
    body: JSON.stringify(hudUpdates), contentType: 'application/json',
  });
  await expect(page.locator('#hud-timer')).not.toHaveText(hudUpdates.before ?? '');
  expect(hudUpdates.writes).toEqual({ best: 0, graceMaximum: 0, haloVisibility: 0 });
  await page.screenshot({ path: testInfo.outputPath('first-flight.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('old pilot data is retained and imported models get independent live cockpit presets', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const oldAnchor = { x: 0.35, y: 1.12, z: -2.45 };
  await page.addInitScript(anchor => {
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
    localStorage.setItem('skimmer-scraper.preferences.v2', JSON.stringify({ cameraMode: 'nose', visualStimulation: 'reduced' }));
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'challenge', graceSeconds: 7.4 }));
    localStorage.setItem('skimmer-scraper.companions.v3', JSON.stringify({ count: 1, formation: 'line' }));
    localStorage.setItem('skimmer-scraper.controls.v3', JSON.stringify({ profile: 'classic' }));
    localStorage.setItem('skimmer-scraper.camera-anchors.v3', JSON.stringify({ procedural: anchor }));
    localStorage.setItem('skimmer-scraper.best.v1', '24.7');
  }, oldAnchor);
  await page.goto('/?seed=334458');
  await ready(page);
  const legacy = await snapshot(page);
  expect(legacy.rules).toMatchObject({ mode: 'challenge', graceSeconds: 7.4 });
  expect(legacy.companionSettings).toMatchObject({ count: 1, formation: 'line' });
  expect(legacy.cameraMode).toBe('cockpit');
  expect(legacy.cameraAnchor).toEqual(oldAnchor);
  expect(await page.evaluate(() => localStorage.getItem('skimmer-scraper.best.v1'))).toBe('24.7');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('skimmer-scraper.preferences.v2')!).cameraMode)).toBe('cockpit');
  await page.keyboard.press('c');
  await expect.poll(async () => (await snapshot(page)).cameraMode).toBe('chase');

  await page.keyboard.press('m');
  await page.locator('#model-file').setInputFiles('tests/fixtures/test-aircraft.glb');
  await expect.poll(async () => (await snapshot(page)).localModelCount).toBe(1);
  await expect(page.locator('#model-note')).toContainText('test-aircraft');
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  const advanced = page.locator('#advanced-flight-settings > summary');
  await advanced.click();
  await page.locator('#camera-anchor-settings > summary').click();
  const preset = page.locator('#anchor-preset');
  await expect(preset).toHaveValue('standard');
  const standard = (await snapshot(page)).cameraAnchor;
  await preset.selectOption('high');
  await page.locator('#anchor-preview').check();
  await expect.poll(async () => (await snapshot(page)).cameraMode).toBe('cockpit');
  await expect(page.locator('#title-screen')).toBeHidden();
  expect((await snapshot(page)).cameraAnchor!.y).toBeGreaterThan(standard!.y);
  await page.locator('#anchor-save').click();
  await expect(page.locator('#anchor-message')).toContainText('已保存');
  const saved = await snapshot(page);
  await page.screenshot({ path: testInfo.outputPath('cockpit-preview.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).cameraMode).toBe('chase');
  await expect(page.locator('#title-screen')).toBeVisible();
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('skimmer-scraper.camera-anchors.v3')!));
  expect(records.procedural).toEqual(oldAnchor);
  expect(records[saved.selectedAircraft]).toMatchObject({ preset: 'high', ...saved.cameraAnchor });
  await page.keyboard.press('f');
  await expect(preset).toHaveValue('high');
  await page.locator('#anchor-recommend').click();
  await expect(preset).toHaveValue('standard');
  await expect(page.locator('#world-panel')).toBeHidden();
  expect(new URL(page.url()).searchParams.get('seed')).toBe('334458');
});
