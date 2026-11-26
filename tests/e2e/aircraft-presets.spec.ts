import { expect, test } from '@playwright/test';

for (const id of ['kite-w','kite-s']) {
  test(id + ' loads from the built-in hangar, flies and restores on reload', async ({page}, info) => {
    // The software-rendered CI run initializes WebGL twice and captures a flight frame.
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?seed=334458');
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
    await page.keyboard.press('m');
    const response = page.waitForResponse(r => r.url().endsWith('/aircraft/'+id+'.glb'));
    await page.locator('[data-model-id="'+id+'"]').click();
    expect((await response).ok()).toBe(true);
    await expect(page.locator('.model-option[aria-selected="true"]')).toHaveAttribute('data-model-id', id);
    await expect(page.locator('#remove-model-button')).toBeDisabled();
    await page.getByRole('button', {name:'关闭机库'}).click();
    await page.getByRole('button', {name:/开始游戏/}).click();
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
    await page.screenshot({path:info.outputPath(id+'-chase.png')});
    await page.reload();
    await page.waitForFunction(id => window.__SKIMMER_SCRAPER__?.snapshot().selectedAircraft===id,id);
    expect(await page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().localModelCount)).toBe(0);
    expect(errors).toEqual([]);
  });
}
