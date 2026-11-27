import { test, expect } from '@playwright/test';
import lines from '../../art/radio/lines.json' with { type: 'json' };

test('previews bundled character calls on demand and handles an unavailable clip', async ({ page }) => {
  test.setTimeout(120_000);
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
  for (const language of ['zh-CN', 'en-US'] as const) {
    await page.locator('#voice-language').selectOption(language);
    for (const id of [1,2,3]) {
      await page.locator('#voice-preview-agent').selectOption(String(id));
      await page.locator('#voice-preview').click();
      const line = lines.find(item => item.agent === id && item.event === 'preview')!;
      await expect(page.locator('#voice-preview-status')).toHaveText(line.text[language]);
      await expect(page.locator('#voice-preview-status')).toHaveText('试听完成。');
      expect(clips.at(-1)).toBe('/radio/' + language + '/' + id + '-preview.opus');
    }
  }
  await page.route('**/1-preview.opus', route => route.abort());
  await page.locator('#voice-preview-agent').selectOption('1');
  await page.locator('#voice-preview').click();
  await expect(page.locator('#voice-preview-status')).toContainText('试听失败');
  await expect(page.locator('#voice-preview-status')).toContainText('Navigator on channel. Route check.');
  expect(modelHosts).toEqual([]);
});
