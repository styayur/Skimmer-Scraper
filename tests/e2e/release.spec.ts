import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface ReleaseSnapshot {
  ready: boolean;
  mode: string;
  runTime: number;
  surfaceLocked: boolean;
  surfaceDistance: number | null;
  world: { buildings: number; chunks: number; collisionTriangles: number; renderTriangles: number };
  render: { calls: number; triangles: number; points: number; lines: number; fps: number };
  selectedAircraft: string;
}

interface RuntimeEvidence {
  generatedAt: string;
  url: string;
  title: string;
  userAgent: string;
  webgl: {
    version: string;
    vendor: string | null;
    renderer: string | null;
    hardwareConcurrency: number;
    devicePixelRatio: number;
  };
  checks: {
    desktopTitle: boolean;
    desktopFlight: boolean;
    mobileLayout: boolean;
    noHorizontalOverflow: boolean;
    webgl2: boolean;
    surfaceLockAttained: boolean;
  };
  snapshot: ReleaseSnapshot;
  caveat: string;
}

const snapshot = (page: Page): Promise<ReleaseSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): ReleaseSnapshot };
    }).__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.snapshot();
  });

const waitForReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean } };
    }).__SKIMMER_SCRAPER__;
    return bridge?.snapshot().ready === true;
  });
};

test.describe('v0.1.0 release acceptance', () => {
  test.setTimeout(150_000);

  test('passes desktop, mobile, WebGL2 and runtime evidence gates', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?seed=334458');
    await waitForReady(page);

    await expect(page).toHaveTitle('Skimmer-Scraper — Close-Surface Flight');
    await expect(page.getByRole('heading', { name: 'SKIMMER SCRAPER' })).toBeVisible();
    await page.screenshot({
      path: 'evidence/phase-4-v0.1.0-title.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: /开始挑战/ })).toBeInViewport();
    const mobileLayout = await page.evaluate(() => {
      const start = document.querySelector<HTMLElement>('#start-button')?.getBoundingClientRect();
      const brand = document.querySelector<HTMLElement>('#game-title')?.getBoundingClientRect();
      return Boolean(start && brand && start.bottom <= window.innerHeight && brand.width <= window.innerWidth);
    });
    const noHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(mobileLayout).toBe(true);
    expect(noHorizontalOverflow).toBe(true);
    await page.screenshot({
      path: 'evidence/phase-4-v0.1.0-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: /开始挑战/ }).click();
    await page.waitForFunction(() => {
      const bridge = (window as unknown as {
        __SKIMMER_SCRAPER__?: { snapshot(): { mode: string } };
      }).__SKIMMER_SCRAPER__;
      return bridge?.snapshot().mode === 'running';
    });
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#surface-state')).toHaveText('SURFACE LOCK');

    await page.locator('#mute-button').click();
    await expect(page.locator('#mute-button')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#mute-button').click();
    await expect(page.locator('#mute-button')).toHaveAttribute('aria-pressed', 'false');

    await page.waitForTimeout(700);
    await page.screenshot({
      path: 'evidence/phase-4-v0.1.0-flight.png',
      fullPage: true,
    });

    const state = await snapshot(page);
    expect(state.mode).toBe('running');
    expect(state.surfaceLocked).toBe(true);
    expect(state.surfaceDistance).not.toBeNull();
    expect(state.world.buildings).toBeGreaterThan(80);
    expect(state.world.chunks).toBeGreaterThan(2);
    expect(state.world.collisionTriangles).toBeGreaterThan(10_000);
    expect(state.render.calls).toBeGreaterThan(0);
    expect(state.render.triangles).toBeGreaterThan(10_000);

    const webgl = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
      const gl = canvas?.getContext('webgl2');
      if (!gl) return null;
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        version: String(gl.getParameter(gl.VERSION)),
        vendor: extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null,
        renderer: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
        hardwareConcurrency: navigator.hardwareConcurrency,
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    expect(webgl).not.toBeNull();
    expect(webgl!.version).toContain('WebGL 2');

    const runtime: RuntimeEvidence = {
      generatedAt: new Date().toISOString(),
      url: page.url(),
      title: await page.title(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      webgl: webgl!,
      checks: {
        desktopTitle: true,
        desktopFlight: true,
        mobileLayout,
        noHorizontalOverflow,
        webgl2: true,
        surfaceLockAttained: state.surfaceLocked,
      },
      snapshot: state,
      caveat: 'Headless Chromium rendering evidence only; this is not a real-GPU performance certification.',
    };
    writeFileSync('evidence/phase-4-v0.1.0-runtime.json', `${JSON.stringify(runtime, null, 2)}\n`);
    expect(errors).toEqual([]);
  });

  test('shows a clear fallback when WebGL2 is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(
        this: HTMLCanvasElement,
        contextId: string,
        ...args: unknown[]
      ) {
        if (contextId === 'webgl2') return null;
        return original.call(this, contextId, ...args);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?seed=334458');
    await expect(page.locator('#webgl-error')).toBeVisible();
    await expect(page.getByRole('heading', { name: '无法启动 WebGL2' })).toBeVisible();
    await page.screenshot({
      path: 'evidence/phase-4-v0.1.0-webgl2-error.png',
      fullPage: true,
      animations: 'disabled',
    });
  });
});
