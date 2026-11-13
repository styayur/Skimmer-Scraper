import { expect, test, type Page } from '@playwright/test';

interface DebugSnapshot {
  ready: boolean;
  mode: string;
  runTime: number;
  best: number;
  surfaceDistance: number | null;
  surfaceLocked: boolean;
  grace: number;
  failureReason: string | null;
  adapter: { chunks: number; lastQueries: number } | null;
}

interface DebugBridge {
  snapshot(): DebugSnapshot;
  advance(seconds: number, options?: { holdPosition?: boolean }): DebugSnapshot;
  setPose(position: { x: number; y: number; z: number }): DebugSnapshot;
}

const bridgeCall = async <T>(page: Page, method: keyof DebugBridge, ...args: unknown[]): Promise<T> =>
  page.evaluate(
    ({ methodName, methodArgs }) => {
      const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: Record<string, unknown> })
        .__SKIMMER_SCRAPER__;
      if (!bridge) throw new Error('Debug bridge unavailable.');
      const fn = bridge[methodName] as (...values: unknown[]) => unknown;
      return fn(...methodArgs) as T;
    },
    { methodName: method, methodArgs: args },
  );

const snapshot = (page: Page): Promise<DebugSnapshot> => bridgeCall<DebugSnapshot>(page, 'snapshot');

test.describe('phase 2 proximity and collision rules', () => {
  test.setTimeout(120_000);

  test('enforces surface lock, grace expiry, impact and instant retry', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?debug=1&autostart=1&seed=334458');
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean; mode: string } };
      }).__SKIMMER_SCRAPER__;
      return bridge?.snapshot().ready === true && bridge.snapshot().mode === 'running';
    });

    await expect(page.locator('#surface-state')).toHaveText('SURFACE LOCK');
    const near = await snapshot(page);
    expect(near.surfaceLocked).toBe(true);
    expect(near.surfaceDistance).not.toBeNull();
    expect(near.surfaceDistance!).toBeLessThanOrEqual(32);
    expect(near.adapter?.chunks).toBeGreaterThan(1);
    await page.waitForTimeout(650);
    await page.screenshot({ path: 'evidence/phase-2-flight.png', fullPage: true });

    await bridgeCall(page, 'setPose', { x: 0, y: 280, z: 0 });
    const graceExpired = await bridgeCall<DebugSnapshot>(page, 'advance', 5.2, { holdPosition: true });
    expect(graceExpired.mode).toBe('failed');
    expect(graceExpired.failureReason).toBe('grace-expired');
    await expect(page.locator('#fail-screen')).toBeVisible();
    await expect(page.locator('#fail-title')).toHaveText('天际线甩掉了你');
    await expect(page.locator('#fail-reason')).toContainText('连续 5 秒');
    expect(graceExpired.best).toBeGreaterThanOrEqual(5.1);
    await page.screenshot({ path: 'evidence/phase-2-grace-failure.png', fullPage: true });

    await page.getByRole('button', { name: /再飞一次/ }).click();
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { mode: string } };
      }).__SKIMMER_SCRAPER__;
      return bridge?.snapshot().mode === 'running';
    });

    await bridgeCall(page, 'setPose', { x: 0, y: 0.5, z: 0 });
    const impact = await bridgeCall<DebugSnapshot>(page, 'advance', 0.1, { holdPosition: true });
    expect(impact.mode).toBe('failed');
    expect(impact.failureReason).toBe('impact');
    await expect(page.locator('#fail-title')).toHaveText('撞上天际线');
    await expect(page.locator('#fail-reason')).toContainText('建筑或场景表面');
    await expect(page.locator('#fail-screen')).toHaveCSS('display', 'grid');
    await expect(page.locator('#fail-screen')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: 'evidence/phase-2-impact-failure.png', fullPage: true, animations: 'disabled' });

    expect(errors).toEqual([]);
  });
});
