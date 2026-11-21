import { expect, test, type Page } from '@playwright/test';

const visiblePanels = (page: Page) => page.locator('[role="dialog"]:visible');
const mode = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().mode);
const waitReady = (page: Page) => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);

test('minimal live title, guide and keyboard navigation', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', { value: () => [] });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=334458');
  await waitReady(page);
  await expect(page.locator('.title-panel > *')).toHaveCount(3);
  await expect(page.locator('#title-screen').getByRole('heading', { name: 'SKIMMER SCRAPER' })).toBeVisible();
  const titleFrame = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().render.triangles);
  expect(titleFrame).toBeGreaterThan(10_000);
  await page.screenshot({ path: testInfo.outputPath('title-desktop.png'), animations: 'disabled' });

  await page.setViewportSize({ width: 360, height: 680 });
  const guideLink = page.locator('#title-screen').getByRole('link', { name: '操作指南' });
  await expect(guideLink).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('title-mobile.png'), animations: 'disabled' });
  await guideLink.click();
  await expect(visiblePanels(page)).toHaveCount(1);
  await expect(page.locator('#title-screen')).toHaveAttribute('inert', '');
  const closeHelp = page.locator('#help-close');
  await expect(closeHelp).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '游戏菜单' })).toBeFocused();
  await page.getByRole('link', { name: '开源许可与隐私' }).click();
  await expect(page.locator('#guide-privacy')).toBeFocused();
  await expect(page.getByRole('link', { name: '许可证全文' })).toHaveAttribute('href', './LICENSE');
  await expect(page.getByRole('link', { name: '源码 · AGPL-3.0' })).toHaveAttribute('href', /github.com\/styayur\/Skimmer-Scraper\/tree\/[a-f0-9]{40}/);
  await page.screenshot({ path: testInfo.outputPath('guide-mobile.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(guideLink).toBeFocused();
  await expect(visiblePanels(page)).toHaveCount(0);

  await page.keyboard.press('g');
  const seed = page.locator('#world-seed-input');
  await seed.fill('');
  await seed.pressSequentially('fghmrc wasdeq');
  await expect(seed).toHaveValue('fghmrc wasdeq');
  await expect(page.locator('#world-panel')).toBeVisible();
  await expect(visiblePanels(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await page.locator('summary[aria-label="玩法帮助"]').click();
  await page.getByRole('link', { name: '阅读指南' }).click();
  await expect(page.locator('#guide-start')).toBeFocused();
  await expect(visiblePanels(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: '阅读指南' })).toBeFocused();
  await page.locator('.model-settings summary').click();
  const key = page.locator('#ai-key');
  await key.pressSequentially('fghmrc');
  await expect(key).toHaveValue('fghmrc');
  await key.fill('');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await expect(page.locator('#library-panel')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#start-button').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => mode(page)).toBe('running');
  await page.keyboard.press('f');
  await expect.poll(() => mode(page)).toBe('paused');
  await page.keyboard.press('g');
  await expect(page.locator('#world-panel')).toBeVisible();
  await expect(visiblePanels(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => mode(page)).toBe('running');
});

test('standard gamepad navigates the title, nested menus, settings and flight', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 880, height: 600 });
  await page.addInitScript(() => {
    localStorage.setItem('skimmer-scraper.rules.v3', JSON.stringify({ mode: 'free' }));
    const pad = { id: 'Navigation test pad', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  const press = (index: number) => page.evaluate(async index => {
    const pad = navigator.getGamepads()[0]!;
    const button = pad.buttons[index] as { value: number; pressed: boolean };
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    button.pressed = true;
    button.value = 1;
    await frame();
    button.pressed = false;
    button.value = 0;
    await frame();
  }, index);
  await page.goto('/?seed=334458');
  await waitReady(page);
  await press(13);
  await expect(page.locator('#title-screen').getByRole('link')).toBeFocused();
  await press(0);
  await expect(page.locator('#help-panel')).toBeVisible();
  await press(1);
  await press(12);
  await press(0);
  await expect.poll(() => mode(page)).toBe('running');
  await press(8);
  await expect(page.locator('#pause-panel')).toBeVisible();
  await expect.poll(() => mode(page)).toBe('paused');
  await press(13);
  await press(13);
  await expect(page.locator('#rules-open')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('pause-desktop.png'), animations: 'disabled' });
  await press(0);
  await expect(page.locator('#rules-panel')).toBeVisible();
  await expect(visiblePanels(page)).toHaveCount(1);
  await press(1);
  await expect(page.locator('#rules-open')).toBeFocused();
  await press(1);
  await expect.poll(() => mode(page)).toBe('running');
  await press(9);
  await expect(page.locator('#pause-panel')).toBeVisible();
  await press(9);
  await expect.poll(() => mode(page)).toBe('running');
});
