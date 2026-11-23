import { expect, test } from '@playwright/test';
test('opens Dragonspine from the world menu, streams local tiles and restores the city', async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto('/');
  await page.waitForFunction(
    () => window.__SKIMMER_SCRAPER__?.snapshot().ready,
  );
  await page.keyboard.press('g');
  await page.locator('#world-theme').selectOption('dragon');
  await page.locator('#world-form button[type=submit]').click();
  await expect(page).toHaveURL(/theme=dragon/);
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () => {
      const s = window.__SKIMMER_SCRAPER__?.snapshot();
      return (
        s?.mode === 'running' &&
        s.dynamicStructures.some((d) => d.id === 'bronze-crest') &&
        (s.streaming?.realmDetail?.loaded ?? 0) > 0
      );
    },
    null,
    { timeout: 60000 },
  );
  await expect(page.locator('#journey-skip,.flight-menu')).toHaveCount(0);
  const initial = await page.evaluate(
    () => window.__SKIMMER_SCRAPER__!.snapshot().dynamicStructures[0]!.position,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__SKIMMER_SCRAPER__!.snapshot().dynamicStructures[0]!.position,
      ),
    )
    .not.toEqual(initial);
  await page.keyboard.press('g');
  await page.locator('#world-theme').selectOption('city');
  await page.locator('#world-form button[type=submit]').click();
  await page.waitForFunction(
    () =>
      window.__SKIMMER_SCRAPER__?.snapshot().ready &&
      !location.search.includes('theme=dragon'),
  );
  expect(
    await page.evaluate(
      () => window.__SKIMMER_SCRAPER__!.snapshot().streaming?.realmDetail,
    ),
  ).toBeUndefined();
});
