import { expect, test } from '@playwright/test';

for (const language of ['en-US', 'zh-TW'] as const) {
  test.describe(language, () => {
    test.use({ locale: language, viewport: { width: 360, height: 740 } });

    test('localizes the shell, searchable guide, settings and HUD', async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const english = language === 'en-US';
      await page.goto('/?seed=334458');
      await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
      await expect(page.locator('html')).toHaveAttribute('lang', english ? 'en-US' : 'zh-CN');
      await expect(page.locator('#start-button')).toHaveAccessibleName(english ? 'Start Game' : '开始游戏');
      if (english) {
        const labels = await page.locator('#app').evaluate(app => {
          const shell = app.cloneNode(true) as Element;
          shell.querySelectorAll('noscript').forEach(node => node.remove());
          return [shell.textContent, ...Array.from(shell.querySelectorAll('[aria-label],[placeholder]'),
            node => [node.getAttribute('aria-label'), node.getAttribute('placeholder')].join(' '))].join(' ');
        });
        expect(labels.match(/.{0,15}\p{Script=Han}.{0,15}/gu)).toBeNull();
      }
      await page.getByRole('link', { name: english ? 'Flight Guide' : '游戏教程', exact: true }).click();
      await expect(page.locator('#guide-content section')).toHaveCount(21);
      await page.getByRole('searchbox').fill(english ? 'API keys costs' : 'API Key 费用');
      await expect(page.locator('#guide-index a:visible')).toHaveCount(1);
      await expect(page.locator('#guide-ai')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('guide.png'), animations: 'disabled' });
      await page.keyboard.press('Escape');
      await page.keyboard.press('f');
      await page.locator('#advanced-flight-settings > summary').click();
      for (const panel of ['.model-settings', '.voice-settings']) {
        await page.locator(panel + ' summary').first().click();
      }
      await expect(page.locator('#ai-key')).toHaveAttribute('placeholder', english ? 'This page only' : '仅当前页面');
      await page.locator('#ai-connect').click();
      await expect(page.locator('#ai-message')).toContainText(english ? 'Invalid configuration' : '配置无效');
      await expect(page.locator('#voice-preview-agent option').first()).toHaveText(english ? 'KITE-1' : '风筝1');
      await expect(page.locator('#voice-language')).toHaveValue(english ? 'en-US' : 'zh-CN');
      await page.screenshot({ path: testInfo.outputPath('settings.png'), animations: 'disabled' });
      expect(await page.locator('#rules-panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await page.keyboard.press('m');
      await expect(page.locator('#model-list')).toContainText(english ? 'Procedural' : '程序化');
      await page.keyboard.press('Escape');
      await page.keyboard.press('g');
      await expect(page.locator('#world-seed-input')).toHaveValue('334458');
      await page.locator('#world-mode-select').selectOption('ephemeral');
      await expect(page.locator('#world-mode-select option:checked')).toHaveText(english ? 'Ephemeral world' : '短暂世界');
      await page.keyboard.press('Escape');
      await page.locator('#start-button').click();
      await expect(page.locator('#surface-state')).toHaveText(english ? 'Free Flight' : '自由飞行');
      await expect(page.locator('#companion-status')).toContainText(english ? 'KITE-1' : '风筝1');
      await page.keyboard.press('t');
      await expect(page.locator('[data-radio-command]').first()).toHaveAttribute('data-radio-command', english ? 'KITE-1 lead' : '一号领航');
    });
  });
}
