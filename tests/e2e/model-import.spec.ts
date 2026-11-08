import { expect, test, type Page } from '@playwright/test';

interface DebugSnapshot {
  ready: boolean;
  selectedAircraft: string;
  localModelCount: number;
}

const snapshot = (page: Page): Promise<DebugSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): DebugSnapshot };
    }).__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.snapshot();
  });

test.describe('phase 3 local GLB aircraft library', () => {
  test.setTimeout(120_000);

  test('imports, renders, persists, rotates and removes a local GLB without network transfer', async ({ page }) => {
    const errors: string[] = [];
    const requestedUrls: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => requestedUrls.push(request.url()));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?seed=334458');
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean } };
      }).__SKIMMER_SCRAPER__;
      return bridge?.snapshot().ready === true;
    });

    await page.getByRole('button', { name: /机库/ }).click();
    await expect(page.locator('#library-panel')).toBeVisible();
    await page.locator('#model-file').setInputFiles('tests/fixtures/test-aircraft.glb');
    await expect(page.locator('.model-option[aria-selected="true"]')).toContainText('test-aircraft');
    await expect(page.locator('#remove-model-button')).toBeEnabled();
    await expect(page.locator('#rotate-model-button')).toBeEnabled();

    const imported = await snapshot(page);
    expect(imported.selectedAircraft).not.toBe('procedural');
    expect(imported.localModelCount).toBe(1);
    await page.screenshot({ path: 'evidence/phase-3-model-library.png', fullPage: true, animations: 'disabled' });

    await page.getByRole('button', { name: '旋转 180°' }).click();
    await expect(page.locator('#toast')).toContainText('旋转模型 180°');

    await page.getByRole('button', { name: '关闭机库' }).click();
    await page.getByRole('button', { name: /开始挑战/ }).click();
    await expect(page.locator('#hud')).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'evidence/phase-3-imported-flight.png', fullPage: true });

    await page.locator('#camera-button').click();
    await expect(page.locator('#cockpit-frame')).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'evidence/v0.2/phase-1-cockpit-imported.png', fullPage: true });

    expect(requestedUrls.some((url) => url.includes('test-aircraft'))).toBe(false);
    const nonLocalRequests = requestedUrls.filter((url) =>
      !url.startsWith('http://127.0.0.1:4173') &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:'),
    );
    expect(nonLocalRequests).toEqual([]);

    await page.goto('/?seed=334458');
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean } };
      }).__SKIMMER_SCRAPER__;
      return bridge?.snapshot().ready === true;
    });
    await page.getByRole('button', { name: /机库/ }).click();
    await expect(page.locator('.model-option[aria-selected="true"]')).toContainText('test-aircraft');

    await page.getByRole('button', { name: '移除当前导入' }).click();
    await expect(page.locator('.model-option')).toHaveCount(1);
    await expect(page.locator('.model-option[aria-selected="true"]')).toContainText('KITE-07');
    expect((await snapshot(page)).localModelCount).toBe(0);

    expect(errors).toEqual([]);
  });
});
