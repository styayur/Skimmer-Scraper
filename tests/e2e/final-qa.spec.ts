import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface FinalSnapshot {
  ready: boolean;
  mode: string;
  runTime: number;
  world: {
    chunks: number;
    buildings: number;
    collisionTriangles: number;
    renderTriangles: number;
  };
  streaming: {
    activeChunks: number;
    queuedChunks: number;
    generatingChunks: number;
    bvhCount: number;
    estimatedCpuGeometryBytes: number;
    generationAvgMs: number;
    generationP95Ms: number;
  } | null;
  render: { calls: number; triangles: number; points: number; lines: number; fps: number };
  surfaceLocked: boolean;
}

interface FinalBridge {
  snapshot(): FinalSnapshot;
  pause(): boolean;
}

const snapshot = (page: Page): Promise<FinalSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: FinalBridge })
      .__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.snapshot();
  });

const waitReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): { ready: boolean; mode: string } };
    }).__SKIMMER_SCRAPER__;
    return bridge?.snapshot().ready === true && bridge.snapshot().mode === 'running';
  }, { timeout: 90_000 });
};

const waitSettled = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: FinalBridge })
      .__SKIMMER_SCRAPER__;
    const streaming = bridge?.snapshot().streaming;
    return streaming !== null && streaming !== undefined &&
      streaming.queuedChunks === 0 && streaming.generatingChunks === 0;
  }, { timeout: 90_000 });
};

const sampleFrames = (page: Page, durationMs: number): Promise<number[]> =>
  page.evaluate(async (sampleDurationMs) => new Promise<number[]>((resolve) => {
    const samples: number[] = [];
    const started = performance.now();
    let previous = started;
    const tick = (now: number): void => {
      const delta = now - previous;
      previous = now;
      if (delta > 0 && delta < 1_000) samples.push(delta);
      if (now - started >= sampleDurationMs) resolve(samples);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), durationMs);

const percentile = (values: number[], ratio: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index]!;
};

const summarizeFrames = (samples: number[]): {
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  averageMs: number;
  maxMs: number;
  averageFps: number;
} => {
  const averageMs = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
  return {
    sampleCount: samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    averageMs,
    maxMs: Math.max(...samples),
    averageFps: 1000 / Math.max(0.001, averageMs),
  };
};

test.describe('v0.2.0 final QA', () => {
  test.setTimeout(180_000);

  test('records software-rendered frame proxies and scene budgets without claiming hardware certification', async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: Array<{ url: string; status: number }> = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() });
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?autostart=1&seed=v020-final-qa&preset=neon&world=stable');
    await waitReady(page);
    await waitSettled(page);
    await page.evaluate(() => {
      const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: FinalBridge })
        .__SKIMMER_SCRAPER__;
      if (!bridge?.pause()) throw new Error('Unable to pause the final QA scene.');
    });
    await page.waitForTimeout(600);

    const balancedFrames = await sampleFrames(page, 4_000);
    const balanced = await snapshot(page);
    await page.screenshot({
      path: 'evidence/v0.2.0-final-flight-balanced.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.locator('#quality-button').click();
    await expect(page.locator('#quality-button')).toHaveText('画质 · 高');
    await page.waitForTimeout(800);
    const highFrames = await sampleFrames(page, 4_000);
    const high = await snapshot(page);

    const browserEnvironment = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
      const gl = canvas?.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      const performanceWithMemory = performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      };
      return {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        devicePixelRatio: window.devicePixelRatio,
        webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : null,
        vendor: gl && extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null,
        renderer: gl && extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
        memory: performanceWithMemory.memory ?? null,
      };
    });
    expect(browserEnvironment.webglVersion).toContain('WebGL 2');
    expect(browserEnvironment.renderer).not.toBeNull();

    const balancedPerformance = summarizeFrames(balancedFrames);
    const highPerformance = summarizeFrames(highFrames);
    const softwareRenderer = /swiftshader|llvmpipe|software/i.test(browserEnvironment.renderer ?? '');
    const runtime = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      version: '0.2.0',
      environment: { ...browserEnvironment, viewport: { width: 1280, height: 720 }, sampleDurationMs: 4_000 },
      balanced: {
        performance: balancedPerformance,
        snapshot: balanced,
      },
      high: {
        performance: highPerformance,
        snapshot: high,
      },
      resourceBounds: {
        activeChunks: high.streaming?.activeChunks ?? 0,
        hardChunkBudget: 41,
        bvhCount: high.streaming?.bvhCount ?? 0,
        estimatedCpuGeometryBytes: high.streaming?.estimatedCpuGeometryBytes ?? 0,
      },
      verdict: {
        correctness: errors.length === 0 && failedRequests.length === 0,
        realGpuPerformanceCertified: false,
        evidenceClass: softwareRenderer
          ? 'headless-software-rendering-proxy'
          : 'headless-browser-proxy-unverified-hardware',
      },
      consoleErrors: errors,
      failedRequests,
      caveat: 'This is Chromium automation evidence. It does not certify real-GPU frame pacing, thermals or GPU memory reclamation.',
    };
    writeFileSync('evidence/v0.2.0-qa-runtime.json', `${JSON.stringify(runtime, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(balancedPerformance.sampleCount).toBeGreaterThan(0);
    expect(highPerformance.sampleCount).toBeGreaterThan(0);
    expect(balanced.render.calls).toBeGreaterThan(0);
    expect(high.render.triangles).toBeGreaterThan(10_000);
    expect(runtime.resourceBounds.activeChunks).toBeLessThanOrEqual(41);
    expect(runtime.verdict.realGpuPerformanceCertified).toBe(false);
    expect(await page.locator('#hud').isVisible()).toBe(true);
  });
});
