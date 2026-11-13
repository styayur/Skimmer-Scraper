import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface ChunkState {
  key: string;
  state: string;
  revision: number;
  fingerprint: number | null;
}

interface RevisionHistorySnapshot {
  maxEntries: number;
  epoch: number;
  entries: Array<{
    key: string;
    revision: number;
    retireCount: number;
  }>;
}

interface EphemeralSnapshot {
  ready: boolean;
  mode: string;
  position: { x: number; y: number; z: number };
  worldMode: 'stable' | 'ephemeral';
  worldPreset: string;
  streaming: {
    activeChunks: number;
    queuedChunks: number;
    generatingChunks: number;
    maxLoadedChunks: number;
    coverageComplete: boolean;
  } | null;
  revisionHistory: RevisionHistorySnapshot | null;
  chunkStates: ChunkState[];
  render: { calls: number; triangles: number };
}

interface EphemeralBridge {
  snapshot(): EphemeralSnapshot;
  setPose(
    position: { x: number; y: number; z: number },
    options?: { pitch?: number },
  ): Promise<EphemeralSnapshot>;
}

const snapshot = (page: Page): Promise<EphemeralSnapshot> =>
  page.evaluate(() => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: EphemeralBridge })
      .__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.snapshot();
  });

const setPose = (
  page: Page,
  position: { x: number; y: number; z: number },
): Promise<EphemeralSnapshot> =>
  page.evaluate((target) => {
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: EphemeralBridge })
      .__SKIMMER_SCRAPER__;
    if (!bridge) throw new Error('Debug bridge unavailable.');
    return bridge.setPose(target, { pitch: 0 });
  }, position);

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
    const bridge = (window as unknown as { __SKIMMER_SCRAPER__?: EphemeralBridge })
      .__SKIMMER_SCRAPER__;
    const state = bridge?.snapshot();
    return state?.streaming !== null && state?.streaming !== undefined &&
      state.streaming.coverageComplete &&
      state.streaming.queuedChunks === 0 &&
      state.streaming.generatingChunks === 0;
  }, { timeout: 90_000 });
};

const chunk = (state: EphemeralSnapshot, key: string): ChunkState | undefined =>
  state.chunkStates.find((candidate) => candidate.key === key && candidate.state === 'ACTIVE');

const openPausedWorldPanel = async (page: Page): Promise<void> => {
  await page.locator('#world-open').click();
  await expect(page.locator('#world-panel')).toBeVisible();
  await page.waitForFunction(() => {
    const bridge = (window as unknown as {
      __SKIMMER_SCRAPER__?: { snapshot(): { mode: string } };
    }).__SKIMMER_SCRAPER__;
    return bridge?.snapshot().mode === 'paused';
  });
};

const travelFar = async (
  page: Page,
  position: { x: number; y: number; z: number },
): Promise<void> => {
  await setPose(page, position);
  await waitSettled(page);
};

test.describe('v0.2 phase 4 ephemeral world', () => {
  test.setTimeout(300_000);

  test('keeps stable maps repeatable and changes Ephemeral interiors only after full unload', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?autostart=1&seed=phase-4-ephemeral&preset=neon&world=ephemeral');
    await waitReady(page);
    await openPausedWorldPanel(page);

    await expect(page.locator('#world-mode-select')).toHaveValue('ephemeral');
    await expect(page.locator('#world-mode-description')).toContainText('不再完全记得');
    await page.locator('#world-mode-select').selectOption('stable');
    await expect(page.locator('#world-mode-description')).toContainText('始终得到相同城市');
    await page.locator('#world-mode-select').selectOption('ephemeral');
    await page.locator('#world-copy-link').click();
    const copiedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(copiedUrl.searchParams.get('seed')).toBe('phase-4-ephemeral');
    expect(copiedUrl.searchParams.get('preset')).toBe('neon');
    expect(copiedUrl.searchParams.get('world')).toBe('ephemeral');
    expect(copiedUrl.searchParams.get('gen')).toBe('2');

    const home = { x: 0, y: 85, z: 120 };
    const waypointB = { x: 4_420, y: 85, z: 120 };
    const waypointC = { x: 8_840, y: 85, z: 120 };
    await travelFar(page, home);
    const initial = await snapshot(page);
    const initialHome = chunk(initial, '0:0');
    expect(initialHome).toBeDefined();
    expect(initialHome!.revision).toBe(0);

    await travelFar(page, waypointB);
    expect(chunk(await snapshot(page), '0:0')).toBeUndefined();
    await travelFar(page, waypointC);
    await travelFar(page, home);
    const revisited = await snapshot(page);
    const revisitedHome = chunk(revisited, '0:0');
    expect(revisitedHome).toBeDefined();
    expect(revisitedHome!.revision).toBe(1);
    expect(revisitedHome!.fingerprint).not.toBe(initialHome!.fingerprint);
    expect(revisited.revisionHistory).not.toBeNull();
    expect(revisited.revisionHistory!.maxEntries).toBe(256);
    expect(revisited.revisionHistory!.entries.length).toBeLessThanOrEqual(256);
    expect(revisited.revisionHistory!.entries.find((entry) => entry.key === '0:0')?.revision).toBe(1);
    expect(revisited.revisionHistory!.epoch).toBeGreaterThanOrEqual(1);
    expect(revisited.streaming!.activeChunks).toBeLessThanOrEqual(41);
    expect(revisited.streaming!.coverageComplete).toBe(true);
    await page.screenshot({
      path: 'evidence/v0.2/phase-4-ephemeral-world-panel.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.close();

    const stablePage = await page.context().newPage();
    stablePage.on('pageerror', (error) => errors.push(error.message));
    stablePage.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await stablePage.setViewportSize({ width: 1440, height: 900 });
    await stablePage.goto('/?autostart=1&seed=phase-4-stable&preset=neon&world=stable');
    await waitReady(stablePage);
    await openPausedWorldPanel(stablePage);
    await travelFar(stablePage, home);
    const stableInitial = await snapshot(stablePage);
    const stableInitialHome = chunk(stableInitial, '0:0');
    expect(stableInitialHome).toBeDefined();
    expect(stableInitialHome!.revision).toBe(0);
    expect(stableInitial.revisionHistory).toBeNull();

    await travelFar(stablePage, waypointB);
    await travelFar(stablePage, waypointC);
    await travelFar(stablePage, home);
    const stableRevisited = await snapshot(stablePage);
    const stableRevisitedHome = chunk(stableRevisited, '0:0');
    expect(stableRevisitedHome).toBeDefined();
    expect(stableRevisitedHome!.revision).toBe(0);
    expect(stableRevisitedHome!.fingerprint).toBe(stableInitialHome!.fingerprint);
    await stablePage.screenshot({
      path: 'evidence/v0.2/phase-4-stable-roundtrip.png',
      fullPage: true,
      animations: 'disabled',
    });
    await stablePage.locator('#world-mode-select').selectOption('ephemeral');
    await stablePage.getByRole('button', { name: /生成并重载/ }).click();
    await stablePage.waitForURL(/world=ephemeral/);
    const appliedUrl = new URL(stablePage.url());
    expect(appliedUrl.searchParams.get('world')).toBe('ephemeral');
    await stablePage.close();

    writeFileSync(
      'evidence/v0.2/phase-4-runtime.json',
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        ephemeral: {
          seed: 'phase-4-ephemeral',
          initialRevision: initialHome!.revision,
          revisitRevision: revisitedHome!.revision,
          initialFingerprint: initialHome!.fingerprint,
          revisitFingerprint: revisitedHome!.fingerprint,
          changedAfterUnload: revisitedHome!.fingerprint !== initialHome!.fingerprint,
          revisionHistory: {
            maxEntries: revisited.revisionHistory!.maxEntries,
            epoch: revisited.revisionHistory!.epoch,
            entryCount: revisited.revisionHistory!.entries.length,
            homeEntry: revisited.revisionHistory!.entries.find((entry) => entry.key === '0:0'),
          },
          activeChunks: revisited.streaming!.activeChunks,
          coverageComplete: revisited.streaming!.coverageComplete,
        },
        stable: {
          seed: 'phase-4-stable',
          initialRevision: stableInitialHome!.revision,
          revisitRevision: stableRevisitedHome!.revision,
          initialFingerprint: stableInitialHome!.fingerprint,
          revisitFingerprint: stableRevisitedHome!.fingerprint,
          repeatable: stableRevisitedHome!.fingerprint === stableInitialHome!.fingerprint,
        },
        ui: {
          modeSelector: 'ephemeral',
          shareLinkRoundTrip: true,
          modeSelectorApplied: appliedUrl.searchParams.get('world') === 'ephemeral',
        },
        render: revisited.render,
        consoleErrors: errors,
        caveat: 'Chromium headless integration evidence. Revision history is session-local and bounded to 256 entries; it is not persistent world history.',
      }, null, 2)}\n`,
    );

    expect(errors).toEqual([]);
  });
});
