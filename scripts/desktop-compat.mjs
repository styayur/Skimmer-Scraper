import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkCompatibility(page, output) {
  const report = {};
  const persist = () =>
    writeFile(
      path.join(output, 'webview2-compat.json'),
      JSON.stringify(report, null, 2),
    );
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running',
  );
  report.sky = await page.evaluate(async () => {
    const g = window.__SKIMMER_SCRAPER__;
    g.pause();
    await g.setPose({ x: 0, y: 519, z: 120 }, { pitch: 1.15 });
    g.resume();
    await g.advance(5);
    const s = g.snapshot();
    return {
      worldIndex: s.journey.worldIndex,
      phase: s.journey.phase,
      companions: s.companions.filter((x) => x.deployed).length,
    };
  });
  assert.equal(report.sky.worldIndex, 1);
  await page
    .locator('#game-canvas')
    .click({ position: { x: 20, y: 20 }, force: true });
  report.pointerLock = await page.evaluate(
    () => document.pointerLockElement?.id ?? null,
  );
  await page.evaluate(() => {
    if (document.pointerLockElement) document.exitPointerLock();
  });
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.voice-settings > summary').click();
  await page.locator('#voice-preview').click();
  await page
    .waitForFunction(
      () =>
        ['completed', 'failed'].includes(
          window.__SKIMMER_SCRAPER__.snapshot().voice.preview.phase,
        ),
      null,
      { timeout: 20000 },
    )
    .catch(() => {});
  report.systemPreview = await page.evaluate(
    () => window.__SKIMMER_SCRAPER__.snapshot().voice.preview,
  );
  await persist();
  await page.locator('#voice-output').selectOption('high-quality');
  await page
    .waitForFunction(
      () =>
        ['ready', 'error', 'unavailable', 'failed'].includes(
          window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro?.phase,
        ),
      null,
      { timeout: 180000 },
    )
    .catch(() => {});
  report.kokoro = await page.evaluate(
    () => window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro,
  );
  if (report.kokoro?.phase === 'ready') {
    await page.locator('#voice-preview').click();
    await page
      .waitForFunction(
        () =>
          ['completed', 'failed'].includes(
            window.__SKIMMER_SCRAPER__.snapshot().voice.preview.phase,
          ),
        null,
        { timeout: 80000 },
      )
      .catch(() => {});
    report.kokoroPreview = await page.evaluate(
      () => window.__SKIMMER_SCRAPER__.snapshot().voice.preview,
    );
  }
  await persist();
  const permission = await page.evaluate(() =>
    navigator.permissions.query({ name: 'microphone' }).then((s) => s.state),
  );
  report.microphone = { permission };
  // Only open a live track when the OS and user have already granted capture permission.
  if (permission === 'granted')
    report.microphone = await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      const result = {
        permission: 'granted',
        live: track.readyState === 'live',
        sampleRate: track.getSettings().sampleRate,
      };
      stream.getTracks().forEach((t) => t.stop());
      return result;
    });
  await persist();
}
