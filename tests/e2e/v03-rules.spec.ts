import { expect, test } from '@playwright/test';

test('free flight, custom grace persistence and retry rule lock', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.evaluate(() => window.__SKIMMER_SCRAPER__!.title());
  await page.keyboard.press('f');
  await page.locator('#run-mode').selectOption('free');
  await page.locator('#run-grace').fill('12');
  await page.locator('#run-grace').dispatchEvent('change');
  await page.locator('#rules-close').click();
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__!.snapshot().mode === 'running');
  const result = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    await game.setPose({ x: 0, y: 500, z: 0 });
    return game.advance(13, { holdPosition: true });
  });
  expect(result.mode).toBe('running');
  expect(result.rules.graceSeconds).toBe(12);
  expect(result.rules.shield).toBe(true);
  await page.keyboard.press('f');
  await expect(page.locator('#run-mode')).toBeDisabled();
  await page.locator('#rules-close').click();
  await page.reload();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().rules.mode)).toBe('free');
  await page.screenshot({ path: 'evidence/v0.3/regression/v03-phase-1-free.png' });
});
