import { test, expect } from '@playwright/test';

test('previews bundled character calls on demand and handles an unavailable clip', async ({ page }) => {
  const clips: string[] = [];
  const modelHosts: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.opus')) clips.push(url.pathname);
    if (/huggingface|\.hf\.co/.test(url.hostname)) modelHosts.push(url.hostname);
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.voice-settings > summary').click();
  const output = page.locator('#voice-output');
  await expect(output).toHaveValue('off');
  expect(clips).toEqual([]);
  await output.selectOption('local');
  for (const id of [1,2,3]) {
    await page.locator('#voice-preview-agent').selectOption(String(id));
    await page.locator('#voice-preview').click();
    await expect(page.locator('#voice-preview-status')).toHaveText('试听完成。');
    expect(clips.at(-1)).toBe('/radio/en-US/' + id + '-preview.opus');
  }
  await page.route('**/1-preview.opus', route => route.abort());
  await page.locator('#voice-preview-agent').selectOption('1');
  await page.locator('#voice-preview').click();
  await expect(page.locator('#voice-preview-status')).toContainText('试听失败');
  expect(modelHosts).toEqual([]);
});
