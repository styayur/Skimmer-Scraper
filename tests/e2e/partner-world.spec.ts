import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const asset = 'https://raw.githubusercontent.com/styayur/V2Wpro/7eb42fd3db2693989db7d3626101ed1b6e92e533/examples/district.glb';
const digest = 'a707d463ce3279c9517d51b3dccde296c461eea2131b214315923b58b4f383d0';

test('selects a partner without a request, verifies the GLB, exports the active flight and exact seed', async ({ page }, info) => {
  test.setTimeout(120_000);
  const bytes = await readFile('tests/fixtures/v2w-relay-district.glb');
  const external: string[] = [];
  const errors: string[] = [];
  let damaged = true;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**/*', async route => {
    external.push(route.request().method() + ' ' + route.request().url());
    if (route.request().url() !== asset) { await route.abort(); return; }
    const body = Buffer.from(bytes);
    if (damaged) body[body.length - 1] ^= 1;
    await route.fulfill({ body, contentType: 'model/gltf-binary' });
  });
  await page.goto('/?catalog=relay-district');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, undefined, { timeout: 90_000 });
  const catalog = page.locator('#partner-world-catalog');
  await expect(catalog).toBeVisible();
  await expect(page.locator('#partner-world-select')).toHaveValue('relay-district');
  await expect(page.locator('#partner-world-play-link')).toHaveAttribute('href', '?catalog=relay-district');
  await expect(page.locator('#partner-world-source')).toContainText('raw.githubusercontent.com');
  await catalog.locator('details > summary').click();
  await expect(page.locator('#partner-world-pin')).toContainText(digest);
  await page.screenshot({ path: info.outputPath('catalog.png') });
  expect(external).toEqual([]);
  await page.locator('#partner-world-import').click();
  await expect(page.locator('#local-world-status')).toContainText('不匹配');
  await expect(page.locator('#local-world-apply')).toBeHidden();
  damaged = false;
  await page.locator('#partner-world-import').click();
  await expect(page.locator('#local-world-summary')).toContainText('1104');
  await page.locator('#local-world-save').uncheck();
  await page.locator('#local-world-apply').click();
  async function flyAndOpenWorlds() {
    await page.locator('#start-button').click();
    await page.waitForFunction(() => (window.__SKIMMER_SCRAPER__?.snapshot().runTime ?? 0) > .25);
    await page.keyboard.press('g');
  }
  await flyAndOpenWorlds();
  const seed = await page.locator('#world-seed-input').inputValue();
  async function download(id: string) {
    const pending = page.waitForEvent('download');
    await page.locator(id).click();
    const file = await pending;
    return readFile((await file.path())!, 'utf8');
  }
  expect((await download('#local-world-layout')).trim()).toBe(seed);
  const report = JSON.parse(await download('#local-world-diagnostic'));
  expect(report).toMatchObject({ format: 'flight-diagnostic-2', sha256: digest, outcome: 'player-observation',
    world: { layoutSeed: seed, bytes: bytes.length }, imported: { id: digest, variant: 0 },
    replayed: null, experiment: null, recording: { kind: 'player' }, returnedToBuiltin: false });
  expect(report.trace.length).toBeGreaterThan(1);
  const entry = page.locator('script[type=module][src]').first();
  const entryURL = await entry.evaluate((e: HTMLScriptElement) => e.src);
  const code = await (await page.request.get(entryURL)).body();
  expect(report.binary.sha256).toBe(createHash('sha256').update(code).digest('hex'));
  await page.locator('#local-world-keep').click();
  await page.waitForFunction(() => Object.values(sessionStorage).some(v => v.includes('"replay":true')));
  await page.reload();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, undefined, { timeout: 90_000 });
  await expect(page.locator('#world-seed-input')).toHaveValue(seed);
  await page.locator('#world-close').click();
  await flyAndOpenWorlds();
  const reopened = JSON.parse(await download('#local-world-diagnostic'));
  expect(reopened.replayed).toEqual(reopened.imported);
  expect(reopened.world.layoutSeed).toBe(seed);
  const library = page.locator('#local-world-library');
  if (!await library.evaluate((el: HTMLDetailsElement) => el.open)) await library.locator(':scope > summary').click();
  await page.locator('#local-world-load').click();
  await page.locator('.world-import-transform > summary').first().click();
  await page.locator('#local-world-config [name="yaw"]').fill('15');
  await page.locator('#local-world-apply').click();
  await expect(page.locator('#world-seed-input')).not.toHaveValue(seed);
  await flyAndOpenWorlds();
  const edited = JSON.parse(await download('#local-world-diagnostic'));
  expect(edited.world.layoutSeed).not.toBe(seed);
  expect(edited.replayed).toBeNull();
  expect(external).toEqual(['GET ' + asset, 'GET ' + asset]);
  expect(errors).toEqual([]);
});
