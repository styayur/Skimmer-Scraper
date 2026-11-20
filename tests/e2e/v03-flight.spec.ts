import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('three views and a real shield contact keep free flight playable', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free' })));
  await page.goto('/?debug=1&seed=334458');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  for (const mode of ['nose','cockpit','chase']) {
    await page.keyboard.press('c');
    await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().cameraMode)).toBe(mode);
    if (mode === 'cockpit') await expect(page.locator('#cockpit-frame')).toBeVisible();
    else await expect(page.locator('#cockpit-frame')).toBeHidden();
  }
  const contact = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    await game.setPose({ x: 0, y: 3.8, z: 120 }, { pitch: -1 });
    return game.advance(0.4);
  });
  expect(contact.mode).toBe('running');
  expect(contact.shieldImpacts).toBeGreaterThan(0);
  expect(contact.surfaceDistance).toBeGreaterThan(3.2);
  writeFileSync('evidence/v0.3/phase-2-flight.json', JSON.stringify({ renderer: 'Chromium software WebGL2', shieldContact: contact, physicalGamepadTested: false, gamepadMethod: 'browser Gamepad API virtual standard mapping' }, null, 2));
  await page.screenshot({ path: 'evidence/v0.3/phase-2-shield.png' });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().mode)).toBe('paused');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().mode)).toBe('running');
  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').click();
  await expect(page.locator('#title-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('browser Gamepad API input hotplug, camera, pause, retry and keyboard fallback', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free' }));
    const fake = { connected: true, index: 0, id: 'Virtual XInput acceptance device', mapping: 'standard',
      axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })), timestamp: 0 };
    (window as unknown as { testPad: typeof fake | null }).testPad = fake;
    (window as unknown as { testPadBackup: typeof fake }).testPadBackup = fake;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [(window as unknown as { testPad: typeof fake | null }).testPad] });
  });
  await page.goto('/?autostart=1&seed=334458');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  const press = async (index: number): Promise<void> => {
    await page.evaluate(i => { const pad = (window as unknown as { testPad: { buttons: Array<{pressed: boolean;value: number}> } }).testPad;
      pad.buttons[i].pressed = true; pad.buttons[i].value = 1; }, index);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(i => { const pad = (window as unknown as { testPad: { buttons: Array<{pressed: boolean;value: number}> } }).testPad;
      pad.buttons[i].pressed = false; pad.buttons[i].value = 0; }, index);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
  await press(3);
  expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().cameraMode)).toBe('nose');
  await press(9);
  expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().mode)).toBe('paused');
  await press(9);
  await press(2);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().mode === 'running');
  await page.evaluate(() => { (window as unknown as { testPad: unknown }).testPad = null; });
  await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().inputDevice)).toBe('Keyboard');
  const before = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().position);
  await page.keyboard.down('a');
  try {
    await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().control.roll), { timeout: 20_000 }).toBeGreaterThan(0.3);
    await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().position), { timeout: 20_000 }).not.toEqual(before);
  } finally { await page.keyboard.up('a'); }
  await page.evaluate(() => {
    const win = window as unknown as { testPad: unknown; testPadBackup: unknown };
    win.testPad = win.testPadBackup;
  });
  await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().inputDevice)).toContain('Gamepad');
});

test('audio resume rejection keeps flight and page teardown usable', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free' }));
    AudioContext.prototype.resume = () => Promise.reject(new Error('Simulated autoplay denial'));
  });
  await page.goto('/?autostart=1&seed=334458');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await page.keyboard.press('Escape');
  await page.locator('#pause-resume').click();
  await expect.poll(() => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().mode)).toBe('running');
  await page.reload();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  expect(errors).toEqual([]);
});
