import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function checkKokoroCache(page, output, runtime) {
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running',
  );
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.voice-settings > summary').click();
  await page.locator('#voice-output').selectOption('high-quality');
  const snapshot = () =>
    page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro);
  await page.waitForFunction(
    () => window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro?.phase === 'ready',
    null,
    { timeout: 200000 },
  );
  const prepared = await snapshot();
  const samples = [];
  for (let n = 0; n < 2; n++) {
    const completed = (await snapshot()).completed;
    await page.locator('#voice-preview').click();
    await page.waitForFunction(
      (last) => {
        const v = window.__SKIMMER_SCRAPER__.snapshot().voice;
        return v.kokoro?.completed > last && v.preview.phase === 'completed';
      },
      completed,
      { timeout: 45000 },
    );
    samples.push(await snapshot());
  }
  await writeFile(
    path.join(output, 'kokoro-cache.json'),
    JSON.stringify(
      {
        runtime,
        prepared,
        samples,
        method:
          'Two completed same-speaker previews in the installed Windows app, real local WebGPU model and Web Audio.',
      },
      null,
      2,
    ) + '\n',
  );
  assert.equal(samples[1].generated, samples[0].generated);
  assert.equal(samples[1].cacheHits, samples[0].cacheHits + 1);
  assert.ok(
    samples[1].cachedClipBytes > 0 &&
      samples[1].cachedClipBytes <= 4 * 1024 * 1024,
  );
}
