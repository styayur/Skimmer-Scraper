import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface ExperienceSnapshot {
  ready: boolean;
  mode: string;
  cameraMode: 'chase' | 'cockpit';
  cameraBlend: number;
  fov: number;
  proximity: number;
  proximityZone: string;
  visualStimulation: string;
  recordingHintVisible: boolean;
}

interface DebugBridge {
  snapshot(): ExperienceSnapshot;
  advance(seconds: number): ExperienceSnapshot;
  setPose(position: { x: number; y: number; z: number }): ExperienceSnapshot;
}

const call = (page: Page, method: keyof DebugBridge, ...args: unknown[]): Promise<ExperienceSnapshot> =>
  page.evaluate(
    ({ methodName, methodArgs }) => {
      const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: Record<string, unknown> })
        .__SKIMMER_SCRAPER__;
      if (!bridge) throw new Error('Debug bridge unavailable.');
      const fn = bridge[methodName] as (...values: unknown[]) => unknown;
      return fn(...methodArgs) as ExperienceSnapshot;
    },
    { methodName: method, methodArgs: args },
  );

const waitReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean } };
    }).__SKIMMER_SCRAPER__;
    return bridge?.snapshot().ready === true;
  });
};

test.describe('v0.2 phase 1 flight experience', () => {
  test.setTimeout(120_000);

  test('switches views, feeds proximity continuously and remembers comfort choices', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?seed=334458');
    await waitReady(page);
    await expect(page.locator('#record-hint')).toBeVisible();
    await page.locator('#record-hint-close').click();
    await expect(page.locator('#record-hint')).toBeHidden();

    await page.reload();
    await waitReady(page);
    await expect(page.locator('#record-hint')).toBeHidden();

    await page.getByRole('button', { name: /开始挑战/ }).click();
    await expect(page.locator('#hud')).toBeVisible();

    await page.locator('#camera-button').click();
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { cameraMode: string; cameraBlend: number } };
      }).__SKIMMER_SCRAPER__;
      const state = bridge?.snapshot();
      return state?.cameraMode === 'cockpit' && state.cameraBlend > 0.82;
    }, { timeout: 20_000 });
    const cockpit = await call(page, 'snapshot');
    expect(cockpit.fov).toBeGreaterThanOrEqual(62);
    expect(cockpit.fov).toBeLessThanOrEqual(88);
    await expect(page.locator('#cockpit-frame')).toBeVisible();
    await page.screenshot({ path: 'evidence/v0.2/phase-1-cockpit.png', fullPage: true });

    await page.keyboard.press('r');
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { mode: string; cameraMode: string } };
      }).__SKIMMER_SCRAPER__;
      const state = bridge?.snapshot();
      return state?.mode === 'running' && state.cameraMode === 'cockpit';
    });

    await page.locator('#effects-button').click();
    await expect(page.locator('#effects-button')).toHaveText('视觉 · 柔和');
    expect((await call(page, 'snapshot')).visualStimulation).toBe('reduced');
    await expect(page.locator('#app')).toHaveClass(/low-stim/);

    await call(page, 'setPose', { x: 0, y: 4.5, z: 180 });
    await call(page, 'advance', 0.2);
    const extreme = await call(page, 'snapshot');
    expect(extreme.proximityZone).toBe('extreme');
    expect(extreme.proximity).toBeGreaterThan(0.2);
    const proximityVariable = await page.locator('#app').evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--proximity-intensity').trim(),
    );
    expect(Number(proximityVariable)).toBeGreaterThan(0.2);
    await page.screenshot({ path: 'evidence/v0.2/phase-1-extreme-feedback.png', fullPage: true });

    await page.keyboard.press('c');
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { cameraMode: string; cameraBlend: number } };
      }).__SKIMMER_SCRAPER__;
      const state = bridge?.snapshot();
      return state?.cameraMode === 'chase' && state.cameraBlend < 0.15;
    }, { timeout: 20_000 });
    const chase = await call(page, 'snapshot');
    expect(chase.fov).toBeGreaterThanOrEqual(62);
    expect(chase.fov).toBeLessThanOrEqual(78);
    writeFileSync(
      'evidence/v0.2/phase-1-runtime.json',
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        cameraModes: { cockpit: cockpit.cameraMode, chase: chase.cameraMode },
        fov: { cockpit: cockpit.fov, chase: chase.fov },
        proximity: { zone: extreme.proximityZone, intensity: extreme.proximity },
        visualStimulation: extreme.visualStimulation,
        recordingHintRemembered: true,
        retryPreservedCamera: true,
        consoleErrors: errors,
        caveat: 'Headless Chromium / SwiftShader integration evidence; not a real-GPU performance result.',
      }, null, 2)}\n`,
    );
    expect(errors).toEqual([]);
  });
});




