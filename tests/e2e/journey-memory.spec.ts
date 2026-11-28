import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

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
  await page.keyboard.press('Escape');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  await expect.poll(async () => (await state())?.entries[0]?.event).toBe('visit');
  await page.keyboard.press('t');
  const radio = page.locator('#radio-input');
  await radio.fill('remember this conversation private-probe-79');
  await radio.press('Enter');
  await expect.poll(async () => (await state()).entries.some((e: { detail: string }) => e.detail === 'radio-contact')).toBe(true);
  await page.goto('/?seed=42&gen=3');
  await ready();
  await openJournal();
  const entry = page.locator('#journey-memory-entries li').first();
  await expect(entry).toContainText('42');
  const reloaded = await state();
  expect(JSON.stringify(reloaded)).not.toContain('private-probe-79');
  if (process.env.SKIMMER_JOURNEY_EVIDENCE) {
    mkdirSync('acceptance/v011/companions', { recursive: true });
    await page.locator('#journey-memory-settings').screenshot({ path: 'acceptance/v011/companions/journal-settings.png' });
  }
  await enable.uncheck();
  await expect(share).not.toBeChecked();
  await expect(entry).toBeVisible();
  await page.locator('#journey-memory-entries li').filter({ hasText: '与伴机联络' }).getByRole('button').click();
  await expect.poll(async () => (await state()).entries.length).toBe(reloaded.entries.length - 1);
  const afterDelete = await state();
  expect(afterDelete.entries.some((e: { event: string }) => e.event === 'visit')).toBe(true);
  await page.locator('#journey-memory-clear').click();
  await expect.poll(async () => (await state()).entries).toEqual([]);
  expect(external).toEqual([]);
  if (process.env.SKIMMER_JOURNEY_EVIDENCE)
    writeFileSync('acceptance/v011/companions/journal-lifecycle.json', JSON.stringify({
      freshProfileKey: null, reloaded, afterDelete, afterClear: await state(), externalRequests: external,
    }, null, 2) + '\n');
});
