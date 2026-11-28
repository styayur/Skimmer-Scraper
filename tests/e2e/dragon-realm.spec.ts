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
  const choices = page.locator('#world-theme option');
  await expect(choices).toHaveCount(4);
  expect(await choices.evaluateAll(options => options.map(option => option.getAttribute('value'))))
    .toEqual(['city', 'kinetic-city', 'dragonspine', 'worldforge']);
  await expect(page.locator('#world-theme option[value="dragonspine"]')).toHaveText(/Dragonspine/);
  await expect(page.locator('#world-theme option[value="kinetic-city"]')).toHaveText(/Kinetic City/);
  await page.locator('#world-theme').selectOption('dragonspine');
  await page.locator('#world-form button[type=submit]').click();
  await expect(page).toHaveURL(url => url.searchParams.get('theme') === 'dragonspine' && url.searchParams.get('spans') === '1');
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () => {
      const s = window.__SKIMMER_SCRAPER__?.snapshot();
      return (
        s?.mode === 'running' &&
        s.dynamicStructures.some((d) => d.id === 'crownback') &&
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
      !location.search.includes('theme=dragonspine'),
  );
  expect(
    await page.evaluate(
      () => window.__SKIMMER_SCRAPER__!.snapshot().streaming?.realmDetail,
    ),
  ).toBeUndefined();
});

test('historical links retain the seed and explain how to recover the original world', async ({ page }) => {
  test.setTimeout(85_000);
  const fingerprint = async () => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot().worldFingerprint);
  await page.goto('/?theme=ascendant&seed=20822&gen=4');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const previous = await fingerprint();
  await page.goto('/?theme=dragon&seed=20822&gen=4');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await expect(page.locator('#legacy-dragon-notice')).toBeVisible();
  await expect(page.locator('#legacy-dragon-notice a')).toHaveAttribute('href', /v0\.8\.2$/);
  expect(await fingerprint()).toBe(previous);
  await page.keyboard.press('g');
  await expect(page.locator('#world-theme')).toHaveValue('dragonspine');
  await page.locator('#world-form button[type=submit]').click();
  await expect(page).toHaveURL(({searchParams}) => searchParams.get('theme') === 'dragonspine'
    && searchParams.get('seed') === '20822' && searchParams.get('gen') === '4' && !searchParams.has('spans'));
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  expect(await fingerprint()).toBe(previous);
});
