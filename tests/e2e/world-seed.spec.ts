import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface WorldDebugSnapshot {
  ready: boolean;
  worldFingerprint: number;
  worldPreset: string;
  worldMode: string;
  generatorVersion: number;
  world: { buildings: number; chunks: number; islands: number; bridges: number };
}

const snapshot = (page: Page): Promise<WorldDebugSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): WorldDebugSnapshot };
    }).__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.snapshot();
  });

const waitReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean } };
    }).__SKIMMER_SCRAPER__;
    return bridge?.snapshot().ready === true;
  }, { timeout: 90_000 });
};

test.describe('v0.2 phase 2 seeded city', () => {
  test.setTimeout(180_000);

  test('reproduces shared URLs and changes the city for another seed', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?seed=seed-alpha&preset=neon&world=stable');
    await waitReady(page);
    const alpha = await snapshot(page);
    expect(alpha.worldPreset).toBe('neon');
    expect(alpha.worldMode).toBe('stable');
    expect(alpha.generatorVersion).toBe(2);
    expect(alpha.world.buildings).toBeGreaterThan(30);
    await page.screenshot({ path: 'evidence/v0.2/phase-2-shared-seed.png', fullPage: true });

    await page.reload();
    await waitReady(page);
    const alphaAgain = await snapshot(page);
    expect(alphaAgain.worldFingerprint).toBe(alpha.worldFingerprint);

    await page.locator('#world-open').click();
    await expect(page.locator('#world-panel')).toBeVisible();
    await page.locator('#world-seed-input').fill('seed-beta');
    await page.locator('#world-preset-select').selectOption('archipelago');
    await expect(page.locator('#world-preset-description')).toContainText('浮岛');
    await page.locator('#world-copy-link').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const copiedUrl = new URL(copied);
    expect(copiedUrl.searchParams.get('seed')).toBe('seed-beta');
    expect(copiedUrl.searchParams.get('preset')).toBe('archipelago');
    expect(copiedUrl.searchParams.get('world')).toBe('stable');
    expect(copiedUrl.searchParams.get('gen')).toBe('2');

    await page.getByRole('button', { name: /生成并重载/ }).click();
    await page.waitForURL(/seed=seed-beta/);
    await waitReady(page);
    const beta = await snapshot(page);
    expect(beta.worldPreset).toBe('archipelago');
    expect(beta.worldFingerprint).not.toBe(alpha.worldFingerprint);
    await expect(page.locator('#title-world-meta')).toContainText('seed-beta');
    await page.screenshot({ path: 'evidence/v0.2/phase-2-seed-variation.png', fullPage: true });

    await page.locator('#world-open').click();
    const beforeRandom = await page.locator('#world-seed-input').inputValue();
    await page.locator('#world-random').click();
    await expect(page.locator('#world-seed-input')).not.toHaveValue(beforeRandom);
    await page.locator('#world-copy-seed').click();
    const copiedSeed = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedSeed).toBe(await page.locator('#world-seed-input').inputValue());
    await page.locator('#world-reset').click();
    await expect(page.locator('#world-seed-input')).toHaveValue('334458');
    await expect(page.locator('#world-preset-select')).toHaveValue('sakura');
    await page.screenshot({ path: 'evidence/v0.2/phase-2-world-panel.png', fullPage: true, animations: 'disabled' });

    writeFileSync(
      'evidence/v0.2/phase-2-runtime.json',
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        generatorVersion: alpha.generatorVersion,
        sharedStableSeed: {
          seed: 'seed-alpha',
          preset: alpha.worldPreset,
          firstFingerprint: alpha.worldFingerprint,
          repeatFingerprint: alphaAgain.worldFingerprint,
          reproduced: alphaAgain.worldFingerprint === alpha.worldFingerprint,
        },
        variedSeed: {
          seed: 'seed-beta',
          preset: beta.worldPreset,
          fingerprint: beta.worldFingerprint,
          changed: beta.worldFingerprint !== alpha.worldFingerprint,
        },
        worldStats: { alpha: alpha.world, beta: beta.world },
        shareLinkVerified: true,
        defaultResetVerified: true,
        consoleErrors: errors,
        caveat: 'Chromium headless integration evidence. Boundary/order determinism is covered by Vitest.',
      }, null, 2)}\n`,
    );
    expect(errors).toEqual([]);
  });
});


