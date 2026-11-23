import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createWorldFixture, type WorldFixture } from '../fixtures/worldGlb';

const evidence = 'evidence/v0.5/pr5-world';
const snapshot = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
const openLibrary = async (page: Page) => {
  await page.keyboard.press('g');
  const library = page.locator('#local-world-library');
  await expect(library).toBeVisible();
  if (!await library.evaluate((element: HTMLDetailsElement) => element.open)) await library.locator(':scope > summary').click();
};
const putFixture = async (page: Page, style: WorldFixture, external = false) => {
  await page.locator('#local-world-file').setInputFiles({
    name: `${style}.glb`, mimeType: 'model/gltf-binary', buffer: createWorldFixture(style, external),
  });
  await page.locator('#local-world-analyze').click();
};

test('flies an imported arch with three companions, collides with an obstacle and restores the procedural world', async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const outbound: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== baseURL && !/^(blob:|data:)/.test(request.url())) outbound.push(request.url());
  });
  await page.goto('/?seed=334458&gen=3');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const original = await snapshot(page);
  await openLibrary(page);
  await putFixture(page, 'arches', true);
  await expect(page.locator('#local-world-status')).toContainText('external URI');
  await page.locator('#local-world-cancel').click();
  await expect(page.locator('#local-world-status')).toHaveText('已取消导入。');

  await putFixture(page, 'arches');
  await expect(page.locator('#local-world-summary')).toContainText('0 个动画片段');
  await page.getByText('比例、方向与出生点', { exact: true }).click();
  await page.locator('#local-world-manual').check();
  const form = page.locator('#local-world-config');
  await form.locator('[name=x]').fill('0');
  await form.locator('[name=y]').fill('12');
  await form.locator('[name=z]').fill('110');
  await page.getByText('网格语义', { exact: true }).click();
  await page.locator('#local-world-mesh').selectOption({ label: 'East overhang' });
  await page.locator('#local-world-role').selectOption('OBSTACLE');
  const collisionHelp = page.getByRole('button', { name: '碰撞分类帮助' });
  await collisionHelp.click();
  await expect(page.locator('#guide-motion')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(collisionHelp).toBeFocused();
  await expect(form).toBeVisible();
  await expect(form.locator('[name=y]')).toHaveValue('12');
  await expect(page.locator('#local-world-role')).toHaveValue('OBSTACLE');
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/world-settings.png` });
  await page.locator('#local-world-apply').click();
  await expect.poll(async () => (await snapshot(page)).localWorld?.manifest.name).toBe('arches');
  const imported = await snapshot(page);
  expect(imported.localWorld!.spawn).toEqual({ x: 0, y: 12, z: 110 });
  expect(imported.localWorld!.manifest.meshRoles.find(mesh => /overhang/i.test(mesh.name))?.role).toBe('OBSTACLE');
  expect(imported.adapter?.bvhCount).toBe(2);
  expect(imported.streaming).toBeNull();
  expect(imported.render.mirrorSky.triangles).toBe(0);
  const surfaces = await page.evaluate(() => {
    const game = window.__SKIMMER_SCRAPER__!;
    return {
      bridge: game.surface({ x: 0, y: 27, z: 0 }, 5, true),
      obstacle: game.surface({ x: 0, y: 8, z: -61 }, 5),
      obstacleAsProximity: game.surface({ x: 0, y: 8, z: -61 }, 5, true),
      backdrop: game.surface({ x: 0, y: 98, z: -260 }, 5),
    };
  });
  expect(surfaces.bridge?.distance).toBeCloseTo(2);
  expect(surfaces.obstacle?.distance).toBeCloseTo(1);
  expect(surfaces.obstacleAsProximity).toBeNull();
  expect(surfaces.backdrop).toBeNull();
  await page.locator('#start-button').click();
  await expect.poll(async () => (await snapshot(page)).mode).toBe('running');
  const tunnel = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(2));
  expect(tunnel.position.z).toBeLessThan(0);
  expect(tunnel.shieldImpacts).toBe(0);
  expect(tunnel.surfaceLocked).toBe(true);
  expect(tunnel.companions).toHaveLength(3);
  expect(tunnel.companions.every(agent => agent.deployed && !agent.uncovered)).toBe(true);
  await page.screenshot({ path: `${evidence}/arch-flight.png` });
  const impact = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    game.pause();
    await game.setPose({ x: 0, y: 8, z: -55 }, { yaw: 0, pitch: 0, roll: 0 });
    game.resume();
    return game.advance(0.45);
  });
  expect(impact.shieldImpacts).toBeGreaterThan(0);
  const retry = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    await game.retry();
    return game.snapshot();
  });
  expect(retry.localWorld?.manifest.id).toBe(imported.localWorld?.manifest.id);
  expect(retry.shieldImpacts).toBe(0);
  await openLibrary(page);
  await page.locator('#local-world-collision').check();
  await expect.poll(async () => (await snapshot(page)).localWorld?.collisionVisible).toBe(true);
  await page.screenshot({ path: `${evidence}/collision-layer.png` });
  await page.locator('#local-world-builtin').click();
  await expect.poll(async () => (await snapshot(page)).localWorld).toBeNull();
  const restored = await snapshot(page);
  expect(restored.seed).toBe(original.seed);
  expect(restored.worldReleases.at(-1)).toMatchObject({ bvhBefore: 2, bvhAfter: 0, rootChildrenAfter: 0 });
  expect(restored.worldReleases.at(-1)!.disposedGeometryCount).toBeGreaterThan(2);

  await page.reload();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await openLibrary(page);
  await expect(page.locator('#local-world-select').locator('option')).toContainText('arches');
  await page.locator('#local-world-load').click();
  await expect(page.locator('#local-world-config')).toBeVisible();
  await expect(page.locator('#local-world-manual')).toBeChecked();
  await expect(form.locator('[name=z]')).toHaveValue('110');
  await page.locator('#local-world-cancel').click();
  await page.locator('#local-world-remove').click();
  await expect(page.locator('#local-world-saved')).toBeHidden();
  expect(errors).toEqual([]);
  expect(outbound).toEqual([]);
  writeFileSync(`${evidence}/arches.json`, JSON.stringify({ original, imported, surfaces, tunnel, impact, retry, restored, errors, outbound }, null, 2));
});

test('imports simple, high-detail and animated GLB worlds with local-only decoding', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=334458');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const results = [];
  for (const style of ['building', 'detailed', 'animated'] as const) {
    await openLibrary(page);
    if (style === 'building') {
      const bytes = [...createWorldFixture(style)];
      const dataTransfer = await page.evaluateHandle(payload => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(payload)], 'building.glb', { type: 'model/gltf-binary' }));
        return data;
      }, bytes);
      await page.locator('#local-world-drop').dispatchEvent('drop', { dataTransfer });
      await dataTransfer.dispose();
      await page.locator('#local-world-analyze').click();
    } else {
      await putFixture(page, style);
    }
    await expect(page.locator('#local-world-config')).toBeVisible({ timeout: 30_000 });
    if (style === 'building') {
      await page.getByText('比例、方向与出生点', { exact: true }).click();
      await page.locator('[name=scale]').fill('2');
      await page.locator('[name=yaw]').fill('90');
    }
    await page.locator('#local-world-save').uncheck();
    await page.locator('#local-world-apply').click();
    await expect.poll(async () => (await snapshot(page)).localWorld?.manifest.name).toBe(style);
    await page.locator('#start-button').click();
    await expect.poll(async () => (await snapshot(page)).mode).toBe('running');
    const flight = await page.evaluate(() => window.__SKIMMER_SCRAPER__!.advance(0.75));
    expect(flight.mode).toBe('running');
    expect(flight.streaming).toBeNull();
    expect(flight.localWorld?.manifest.animations).toHaveLength(style === 'animated' ? 1 : 0);
    if (style === 'building') expect(flight.localWorld!.manifest.bounds.x).toBeCloseTo(680);
    if (style === 'detailed') expect(flight.world.renderTriangles).toBeGreaterThan(100_000);
    expect(flight.companions.every(agent => agent.deployed)).toBe(true);
    expect(flight.worldReleases.every(world => world.bvhAfter === 0 && world.rootChildrenAfter === 0)).toBe(true);
    results.push(flight);
  }
  expect(errors).toEqual([]);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/world-variants.json`, JSON.stringify({ results, errors }, null, 2));
});
