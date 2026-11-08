import { expect, test, type Page } from '@playwright/test';

interface DebugSnapshot {
  ready: boolean;
  mode: string;
  runTime: number;
  speed: number;
  altitude: number;
  position: { x: number; y: number; z: number };
  world: { buildings: number; collisionTriangles: number; renderTriangles: number };
  render: { calls: number; triangles: number; fps: number };
}

const readSnapshot = (page: Page): Promise<DebugSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): DebugSnapshot };
    }).__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.snapshot();
  });

test.describe('phase 1 flight prototype', () => {
  test.setTimeout(90_000);
  test('renders the title and a controllable WebGL2 flight scene', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?seed=334458');
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean } };
      }).__SKIMMER_SCRAPER__;
      return bridge?.snapshot().ready === true;
    });
    await expect(page.locator('#loading-screen')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'SKIMMER SCRAPER' })).toBeVisible();
    await page.screenshot({ path: 'evidence/phase-1-title.png', fullPage: true });

    await page.getByRole('button', { name: /开始挑战/ }).click();
    await expect(page.locator('#hud')).toBeVisible();

    const first = await readSnapshot(page);
    expect(first.world.buildings).toBeGreaterThan(80);
    expect(first.render.calls).toBeGreaterThan(0);
    await page.waitForTimeout(1000);

    await page.keyboard.down('a');
    await page.waitForTimeout(450);
    await page.keyboard.up('a');
    await page.waitForTimeout(300);

    const second = await readSnapshot(page);
    expect(second.mode).toBe('running');
    expect(second.runTime).toBeGreaterThan(0.1);
    expect(second.position.z).not.toBe(first.position.z);
    expect(second.render.triangles).toBeGreaterThan(0);
    await page.screenshot({ path: 'evidence/phase-1-flight.png', fullPage: true });

    expect(errors).toEqual([]);
  });
});


