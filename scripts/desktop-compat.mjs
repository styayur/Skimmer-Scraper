import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkCompatibility(page, output) {
  const build = await page.evaluate(async () => (await fetch('./build-info.json')).json());
  const modelRequests = [];
  page.on('request', request => {
    if (/kokoro|onnxruntime|huggingface|\.onnx(?:$|\?)/i.test(request.url())) modelRequests.push(request.url());
  });
  const report = { build, modelRequests };
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
  await page.locator('#voice-output').selectOption('local');
  report.characterPreviews = [];
  for (const language of ['zh-CN','en-US']) {
    await page.locator('#voice-language').selectOption(language);
    for (const agent of [1, 2, 3]) {
      await page.locator('#voice-preview-agent').selectOption(String(agent));
      const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/radio/' + language + '/' + agent + '-preview.opus') && r.ok());
      await page.locator('#voice-preview').click();
      await response;
      await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().voice.preview.phase === 'completed');
      report.characterPreviews.push({ language, agent, completed: true });
    }
  }
  assert.deepEqual(modelRequests, []);
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
