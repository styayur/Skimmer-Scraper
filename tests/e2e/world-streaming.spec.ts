import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface StreamerSnapshot {
  stateCounts: Record<string, number>;
  loadedChunks: number;
  activeChunks: number;
  queuedChunks: number;
  generatingChunks: number;
  generatedTotal: number;
  retiredTotal: number;
  disposedGeometryCount: number;
  bvhCount: number;
  estimatedCpuGeometryBytes: number;
  generationAvgMs: number;
  generationP95Ms: number;
  generationMinMs: number;
  generationMaxMs: number;
  generationSampleCount: number;
  activationP95Ms: number;
  maxLoadedChunks: number;
  coverageComplete: boolean;
  rebaseCount: number;
}

interface StreamingSnapshot {
  ready: boolean;
  mode: string;
  runTime: number;
  position: { x: number; y: number; z: number };
  surfaceLocked: boolean;
  grace: number;
  buffering: boolean;
  world: { chunks: number; buildings: number; collisionTriangles: number };
  adapter: { chunks: number; bvhCount: number } | null;
  streaming: StreamerSnapshot | null;
  renderOrigin: { x: number; y: number; z: number };
  render: { calls: number; triangles: number; fps: number };
}

interface StreamingBridge {
  snapshot(): StreamingSnapshot;
  advance(seconds: number): Promise<StreamingSnapshot>;
  setPose(position: { x: number; y: number; z: number }): Promise<StreamingSnapshot>;
}

const snapshot = (page: Page): Promise<StreamingSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: StreamingBridge })
      .__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.snapshot();
  });

const advance = (page: Page, seconds: number): Promise<StreamingSnapshot> =>
  page.evaluate((duration) => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: StreamingBridge })
      .__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.advance(duration);
  }, seconds);

const setPose = (page: Page, position: { x: number; y: number; z: number }): Promise<StreamingSnapshot> =>
  page.evaluate((target) => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: StreamingBridge })
      .__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.setPose(target);
  }, position);

const waitReady = async (page: Page): Promise<StreamingSnapshot> => {
  const handle = await page.waitForFunction(() => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: StreamingBridge }).__SKIMMER_SCRAPER__;
    const state = bridge?.snapshot();
    return state?.ready && state.mode === 'running' && !state.buffering && state.streaming?.coverageComplete ? state : false;
  }, null, { timeout: 90_000 });
  const state = await handle.jsonValue();
  await handle.dispose();
  if (!state) throw new Error('Spawn collision coverage was not ready.');
  return state;
};

test.describe('v0.2 phase 3 infinite world streaming', () => {
  test.setTimeout(240_000);

  test('streams collision coverage across chunks, releases resources and rebases locally', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?autostart=1&seed=phase-3-stream&preset=neon&world=stable');
    const initial = await waitReady(page);
    expect(initial.streaming).not.toBeNull();
    expect(initial.streaming!.activeChunks).toBeLessThanOrEqual(41);
    expect(initial.streaming!.bvhCount).toBe(initial.streaming!.activeChunks);
    expect(initial.streaming!.coverageComplete).toBe(true);
    expect(initial.adapter?.chunks).toBe(initial.world.chunks);

    await setPose(page, { x: 0, y: 85, z: 120 });
    const normalFlight = await advance(page, 4);
    expect(normalFlight.mode).toBe('running');
    expect(normalFlight.runTime).toBeGreaterThan(2.5);
    expect(normalFlight.position.z).toBeLessThan(initial.position.z - 150);
    expect(normalFlight.streaming!.generatedTotal).toBeGreaterThan(initial.streaming!.generatedTotal);

    const bufferedState = page.waitForFunction(() => {
      const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: StreamingBridge })
        .__SKIMMER_SCRAPER__;
      const state = bridge?.snapshot();
      const label = document.querySelector('#surface-state')?.textContent ?? '';
      if (!state?.buffering || !label.includes('WORLD STREAM')) return false;
      return { runTime: state.runTime, label };
    }, null, { timeout: 15_000 });
    const [buffer, committed] = await Promise.all([
      bufferedState, setPose(page, { x: 12_105, y: 85, z: 0 }),
    ]);
    const bufferedAt = await buffer.jsonValue();
    await buffer.dispose();
    if (!bufferedAt) throw new Error('Did not observe the collision buffering state.');
    expect(bufferedAt.label).toContain('WORLD STREAM');
    expect(committed.buffering).toBe(false);
    expect(committed.position.x).toBeCloseTo(12_105, 2);

    const resumed = await page.waitForFunction(() => {
      const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: StreamingBridge })
        .__SKIMMER_SCRAPER__;
      const state = bridge?.snapshot();
      return state?.mode === 'running' && !state.buffering && state.streaming?.coverageComplete && state.surfaceLocked ? state : false;
    }, null, { timeout: 90_000 });
    const afterTeleport = await resumed.jsonValue();
    await resumed.dispose();
    if (!afterTeleport) throw new Error('Covered flight did not resume after teleport.');
    const bufferedTimerDeltaSeconds = Math.max(
      0,
      Math.round((committed.runTime - bufferedAt.runTime) * 1000) / 1000,
    );
    expect(bufferedTimerDeltaSeconds).toBeLessThanOrEqual(0.5);
    expect(afterTeleport.streaming!.coverageComplete).toBe(true);
    expect(afterTeleport.streaming!.rebaseCount).toBeGreaterThan(0);
    expect(afterTeleport.renderOrigin.x).toBe(10_000);
    expect(afterTeleport.surfaceLocked).toBe(true);
    await page.screenshot({
      path: 'evidence/v0.3/regression/v0.2/phase-3-rebased-city.png',
      fullPage: true,
      animations: 'disabled',
    });

    const afterHighPose = await setPose(page, { x: 12_105, y: 600, z: 0 });
    let afterFlight = afterHighPose;
    for (let attempt = 0; attempt < 12 && afterFlight.runTime < afterHighPose.runTime + 1; attempt += 1) {
      afterFlight = await advance(page, 1);
      if (afterFlight.mode !== 'running') break;
    }
    await page.waitForFunction(() => {
      const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: StreamingBridge })
        .__SKIMMER_SCRAPER__;
      const state = bridge?.snapshot();
      const streaming = state?.streaming;
      return streaming !== null && streaming !== undefined &&
        streaming.queuedChunks === 0 &&
        streaming.generatingChunks === 0;
    }, null, { timeout: 60_000 });

    const final = await snapshot(page);
    expect(afterFlight.runTime).toBeGreaterThanOrEqual(afterHighPose.runTime + 1);
    expect(final.mode).toBe('running');
    expect(final.runTime).toBeGreaterThanOrEqual(afterFlight.runTime);
    expect(final.grace).toBeGreaterThan(0);
    expect(final.streaming!.activeChunks).toBeLessThanOrEqual(final.streaming!.maxLoadedChunks);
    expect(final.streaming!.activeChunks).toBeLessThanOrEqual(41);
    expect(final.streaming!.bvhCount).toBe(final.streaming!.activeChunks);
    expect(final.streaming!.generatedTotal).toBeGreaterThan(final.streaming!.activeChunks);
    expect(final.streaming!.retiredTotal).toBeGreaterThan(0);
    expect(final.streaming!.disposedGeometryCount).toBeGreaterThan(0);
    expect(final.streaming!.generationAvgMs).toBeGreaterThan(0);
    expect(final.streaming!.activationP95Ms).toBeGreaterThan(0);
    expect(final.streaming!.generationSampleCount).toBeGreaterThan(0);
    expect(final.streaming!.generationMinMs).toBeLessThanOrEqual(final.streaming!.generationAvgMs);
    expect(final.streaming!.generationAvgMs).toBeLessThanOrEqual(final.streaming!.generationMaxMs);
    expect(final.streaming!.generationMinMs).toBeLessThanOrEqual(final.streaming!.generationP95Ms);
    expect(final.streaming!.generationP95Ms).toBeLessThanOrEqual(final.streaming!.generationMaxMs);
    expect(final.render.calls).toBeGreaterThan(0);
    expect(final.render.triangles).toBeGreaterThan(10_000);

    await expect(page.locator('#surface-state')).not.toContainText('WORLD STREAM');
    await page.screenshot({
      path: 'evidence/v0.3/regression/v0.2/phase-3-streaming.png',
      fullPage: true,
      animations: 'disabled',
    });

    writeFileSync(
      'evidence/v0.3/regression/v0.2/phase-3-runtime.json',
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        world: {
          seed: 'phase-3-stream',
          preset: 'neon',
          mode: 'stable',
          chunksBeforeTeleport: initial.world.chunks,
          chunksAfterTeleport: final.world.chunks,
        },
        streaming: final.streaming,
        rebase: {
          count: final.streaming?.rebaseCount ?? 0,
          renderOrigin: final.renderOrigin,
        },
        runtime: {
          position: final.position,
          runTime: final.runTime,
          surfaceLocked: final.surfaceLocked,
          calls: final.render.calls,
          triangles: final.render.triangles,
        },
        bufferingPausedRunTimer: bufferedTimerDeltaSeconds <= 0.5,
        bufferedTimerDeltaSeconds,
        consoleErrors: errors,
        caveat: 'Chromium headless verifies integration and resource counters. It is not a real-GPU performance certification or proof of complete GPU memory reclamation.',
      }, null, 2)}\n`,
    );

    expect(errors).toEqual([]);
  });
});
