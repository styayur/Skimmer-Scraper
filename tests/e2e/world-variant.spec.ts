import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createWorldFixture, type WorldFixture } from '../fixtures/worldGlb';

const snapshot = (page: Page) => page.evaluate(() => window.__SKIMMER_SCRAPER__!.snapshot());
const opened = (page: Page) => page.locator('#world-panel');
const currentVariant = async (page: Page) => (await snapshot(page)).localWorld?.manifest.variant?.seed ?? 0;
const openWorld = async (page: Page) => {
  if (!await opened(page).isVisible()) await page.keyboard.press('g');
  await expect(opened(page)).toBeVisible();
};
const library = async (page: Page) => {
  await openWorld(page);
  const section = page.locator('#local-world-library');
  if (!await section.evaluate((details: HTMLDetailsElement) => details.open)) await section.locator('summary').first().click();
};
const loadFile = async (page: Page, style: WorldFixture) => {
  await library(page);
  await page.locator('#local-world-file').setInputFiles({
    name: `${style}.glb`, mimeType: 'model/gltf-binary', buffer: createWorldFixture(style),
  });
  await page.locator('#local-world-analyze').click();
};
const openFile = async (page: Page, style: WorldFixture, save = true) => {
  await loadFile(page, style);
  const config = page.locator('#local-world-config');
  await expect(config).toBeVisible();
  await config.locator('#local-world-save').setChecked(save);
  await config.locator('#local-world-apply').click();
  await expect.poll(async () => (await snapshot(page)).localWorld?.manifest.name).toBe(style);
};
const generate = async (page: Page) => {
  const prior = await currentVariant(page);
  await openWorld(page);
  await page.getByRole('button', { name: '生成新变体' }).click();
  await expect.poll(() => currentVariant(page)).not.toBe(prior);
  await expect(opened(page)).toBeHidden();
};
const paste = async (page: Page, seed: string) => {
  await openWorld(page);
  await page.getByRole('textbox', { name: '输入种子' }).fill(seed);
  await page.locator('#world-form button[type=submit]').click();
};
const readCity = async (page: Page) => {
  const sample = await page.evaluate(() => {
    const game = window.__SKIMMER_SCRAPER__!;
    const local = game.snapshot().localWorld!;
    const distances: number[] = [];
    for (const y of [6, 16, 28, 42, 58, 76]) {
      for (let x = -128; x <= 128; x += 16) for (let z = -128; z <= 128; z += 16) {
        const hit = game.surface({ x, y, z }, 12);
        distances.push(hit ? Math.round(hit.distance * 1000) : -1);
      }
    }
    const clear = [0, 2, 4, 6, 8, 12, 16, 20].every(distance =>
      game.surface({ ...local.spawn, z: local.spawn.z - distance }, 6.5) === null);
    return { ...local, distances, clear };
  });
  const { distances, ...city } = sample;
  return { ...city, geometrySHA256: createHash('sha256').update(JSON.stringify(distances)).digest('hex') };
};
const captureFlight = async (page: Page, file: string) => {
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  const result = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    const initial = game.snapshot();
    const flight = await game.advance(0.17);
    game.pause();
    await game.setPose({ x: -9, y: 37, z: 158 }, { yaw: 0, pitch: -0.08, roll: 0, preserveCompanions: true });
    await new Promise(requestAnimationFrame);
    return { shieldBefore: initial.shieldImpacts, shieldAfter: flight.shieldImpacts,
      companions: flight.companions, render: game.snapshot().render };
  });
  expect(result.shieldAfter).toBe(result.shieldBefore);
  expect(result.companions).toHaveLength(3);
  expect(result.companions.every(agent => agent.deployed && !agent.uncovered)).toBe(true);
  await page.screenshot({ path: file });
  return result.render;
};

test('copies and replays real separable city layouts, refreshing unlocked visits and retaining a kept layout', async ({ page, browser }, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 920, height: 620 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  const remote: string[] = [];
  const monitor = (tab: Page) => {
    tab.on('pageerror', error => errors.push(error.message));
    tab.on('request', request => {
      if (!/^(http:\/\/127\.0\.0\.1:4173\/|data:|blob:)/.test(request.url())) remote.push(request.url());
    });
  };
  monitor(page);
  await page.goto('/?seed=334458');
  const url = page.url();
  const ready = (tab: Page) => tab.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await ready(page);
  await openFile(page, 'variants');
  const original = await readCity(page);
  const originalRender = await captureFlight(page, testInfo.outputPath('original-flight.png'));

  await generate(page);
  const first = await readCity(page);
  expect(first.manifest.variant).toMatchObject({ layout: 'grouped' });
  expect(first.manifest.variant!.movedGroups).toBeGreaterThan(2);
  expect(first.clear).toBe(true);
  expect(first.geometrySHA256).not.toBe(original.geometrySHA256);
  expect(first.manifest.id).toBe(createHash('sha256').update(createWorldFixture('variants')).digest('hex'));
  expect(first.manifest.collisionTriangles).toBe(original.manifest.collisionTriangles);
  const firstRender = await captureFlight(page, testInfo.outputPath('variant-a-flight.png'));
  await openWorld(page);
  const seedInput = page.getByRole('textbox', { name: '输入种子' });
  const firstSeed = await seedInput.inputValue();
  expect(firstSeed.length).toBeGreaterThan(64);
  await seedInput.fill('334458');
  await page.getByRole('button', { name: '复制种子' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(firstSeed);
  await expect(page.locator('#world-mode-select')).toBeHidden();

  await page.reload();
  await ready(page);
  const second = await readCity(page);
  expect(second.manifest.variant?.seed).not.toBe(first.manifest.variant?.seed);
  expect(second.geometrySHA256).not.toBe(first.geometrySHA256);
  const secondRender = await captureFlight(page, testInfo.outputPath('variant-b-flight.png'));

  await paste(page, firstSeed);
  await expect.poll(() => currentVariant(page)).toBe(first.manifest.variant!.seed);
  const replay = await readCity(page);
  expect(replay.geometrySHA256).toBe(first.geometrySHA256);
  expect(replay.spawn).toEqual(first.spawn);
  await openWorld(page);
  await page.getByRole('button', { name: '保留当前世界' }).click();
  await expect(page.locator('#toast')).toContainText('当前世界已保留');
  await page.reload();
  await ready(page);
  const kept = await readCity(page);
  expect(kept.geometrySHA256).toBe(first.geometrySHA256);
  expect(kept.spawn).toEqual(first.spawn);

  await generate(page);
  await generate(page);
  const released = (await snapshot(page)).worldReleases.filter(world => world.bvhBefore === 2);
  expect(released.length).toBeGreaterThanOrEqual(2);
  expect(released.every(world => world.bvhAfter === 0 && world.dynamicBvhAfter === 0 && world.rootChildrenAfter === 0)).toBe(true);
  const releasedGeometries = released[0]!.disposedGeometryCount;
  expect(releasedGeometries).toBeGreaterThanOrEqual(3);
  expect(released.map(world => world.disposedGeometryCount)).toEqual(released.map(() => releasedGeometries));
  await openWorld(page);
  await page.locator('#local-world-builtin').click();
  await expect.poll(async () => (await snapshot(page)).localWorld).toBeNull();
  await library(page);
  await page.locator('#local-world-load').click();
  await expect(page.locator('#local-world-config')).toBeVisible();
  await page.locator('#local-world-apply').click();
  await expect.poll(() => currentVariant(page)).toBe(first.manifest.variant!.seed);
  const reopened = await readCity(page);
  expect(reopened.geometrySHA256).toBe(first.geometrySHA256);
  await library(page);
  await page.locator('#local-world-remove').click();
  await expect(page.locator('#local-world-saved')).toBeHidden();
  await page.reload();
  await ready(page);
  expect((await snapshot(page)).localWorld).toBeNull();

  const fresh = await browser.newContext({ viewport: { width: 920, height: 620 } });
  let onAnotherProfile;
  try {
    const destination = await fresh.newPage();
    monitor(destination);
    await destination.goto(url);
    await ready(destination);
    await paste(destination, firstSeed);
    await expect(destination.locator('#local-world-status')).toContainText('需要原始 GLB');
    await loadFile(destination, 'merged');
    await expect(destination.locator('#local-world-status')).toContainText('与种子不匹配');
    await loadFile(destination, 'variants');
    await expect.poll(() => currentVariant(destination)).toBe(first.manifest.variant!.seed);
    onAnotherProfile = await readCity(destination);
    expect(onAnotherProfile.geometrySHA256).toBe(first.geometrySHA256);
    expect(onAnotherProfile.spawn).toEqual(first.spawn);
  } finally { await fresh.close(); }
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
  writeFileSync(testInfo.outputPath('variants.json'), JSON.stringify({
    original, first, second, replay, kept, reopened, onAnotherProfile,
    originalRender, firstRender, secondRender, released, errors, remote,
  }, null, 2));
});

test('uses whole-layout variation for a merged mesh and preserves the real moving GLB BVH', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 920, height: 620 });
  await page.goto('/?seed=334458');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await openFile(page, 'merged', false);
  const mergedOriginal = await readCity(page);
  await generate(page);
  const merged = await readCity(page);
  expect(merged.manifest.variant).toMatchObject({ layout: 'whole', movedGroups: 0 });
  expect(merged.manifest.meshRoles).toHaveLength(1);
  expect(merged.manifest.triangles).toBe(mergedOriginal.manifest.triangles);
  expect(merged.geometrySHA256).not.toBe(mergedOriginal.geometrySHA256);
  expect(merged.clear).toBe(true);
  await captureFlight(page, testInfo.outputPath('merged-flight.png'));

  await loadFile(page, 'animated');
  await expect(page.locator('#local-world-config')).toBeVisible();
  await page.getByText('动画与运动路径', { exact: true }).click();
  await page.locator('#local-world-motion-mesh').selectOption({ label: 'Lift · 刚体' });
  await page.locator('#local-world-motion-custom').check();
  await page.locator('#local-world-motion-x').fill('16');
  await page.locator('#local-world-motion-seconds').fill('2');
  await page.locator('#local-world-save').uncheck();
  await page.locator('#local-world-apply').click();
  await expect.poll(async () => (await snapshot(page)).localWorld?.manifest.name).toBe('animated');
  await generate(page);
  const start = await snapshot(page);
  expect(start.localWorld?.manifest.variant).toMatchObject({ layout: 'whole', movedGroups: 0 });
  expect(start.dynamicStructures).toHaveLength(1);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
  const actual = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    const state = await game.advance(0.48);
    game.pause();
    const lift = state.dynamicStructures[0]!;
    const nearest = game.surface({ ...lift.position, y: lift.position.y + 8 }, 6, true);
    await game.setPose({ x: lift.position.x, y: lift.position.y + 13, z: lift.position.z + 34 },
      { yaw: 0, pitch: -0.14, roll: 0, preserveCompanions: true });
    return { lift, nearest, render: state.render };
  });
  expect(actual.lift.position.y).toBeGreaterThan(start.dynamicStructures[0]!.position.y + 12);
  expect(actual.lift.position.x).toBeGreaterThan(start.dynamicStructures[0]!.position.x + 5.5);
  expect(actual.nearest?.surfaceId).toBe(actual.lift.id);
  await page.screenshot({ path: testInfo.outputPath('moving-variant.png') });
  const contact = await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__!;
    await game.retry();
    game.pause();
    const lift = game.snapshot().dynamicStructures[0]!.position;
    await game.setPose({ x: lift.x, y: lift.y + 13, z: lift.z + 3 }, { yaw: 0, pitch: -1.1, roll: 0 });
    game.resume();
    const flight = await game.advance(0.22);
    game.pause();
    return { impacts: flight.shieldImpacts, tasks: flight.companions.map(wingmate => wingmate.task) };
  });
  expect(contact.impacts).toBeGreaterThan(0);
  await openWorld(page);
  await page.locator('#local-world-builtin').click();
  await expect.poll(async () => (await snapshot(page)).localWorld).toBeNull();
  const release = (await snapshot(page)).worldReleases.at(-1);
  expect(release).toMatchObject({ dynamicBvhBefore: 1, dynamicBvhAfter: 0, bvhAfter: 0, rootChildrenAfter: 0 });
  writeFileSync(testInfo.outputPath('whole-and-motion.json'),
    JSON.stringify({ mergedOriginal, merged, start: start.dynamicStructures, actual, contact, release }, null, 2));
});
