import { expect, test } from '@playwright/test';

const key = 'skimmer.journey-memory.v1';
test('a real flight visit survives a reload and can be inspected and erased offline', async ({ page }) => {
  test.setTimeout(150_000);
  const openJournal = async () => {
    await page.keyboard.press('f');
    await page.locator('#advanced-flight-settings > summary').click();
    await page.locator('#journey-memory-settings > summary').click();
  };
  const ready = () => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
  const external: string[] = [];
  page.on('request', req => { if (req.url().startsWith('https:')) external.push(new URL(req.url()).hostname); });
  await page.goto('/?seed=42&gen=3');
  await ready();
  await openJournal();
  await page.locator('#companion-count').selectOption('3');
  expect(await state()).toBeNull();
  const enable = page.locator('#journey-memory-enabled'), share = page.locator('#journey-memory-share');
  await enable.check();
  await expect(share).toBeEnabled();
  await expect(share).not.toBeChecked();
  await share.check();
  await expect.poll(async () => (await state()).shareWithModel).toBe(true);
  await page.goto('/?autostart=1&seed=42&gen=3');
  await expect.poll(async () => (await state())?.entries[0]?.event).toBe('visit');
  await page.goto('/?seed=42&gen=3');
  await ready();
  await openJournal();
  const entry = page.locator('#journey-memory-entries li').first();
  await expect(entry).toContainText('42');
  await enable.uncheck();
  await expect(share).not.toBeChecked();
  await expect(entry).toBeVisible();
  await entry.getByRole('button').click();
  await expect.poll(async () => (await state()).entries).toEqual([]);
  expect(external).toEqual([]);
});
