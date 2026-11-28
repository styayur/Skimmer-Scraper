import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Real WebView2, its installed CSP and the session-only stock importer. */
export async function checkDesktopCatalog(page, output, runtime) {
  const requests = [];
  const errors = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol === 'https:' && !['tauri.localhost', 'ipc.localhost'].includes(url.hostname))
      requests.push({ method: request.method(), url: url.href });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.origin + '/?catalog=switchyard');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const catalog = page.locator('#partner-world-catalog');
  await catalog.waitFor();
  assert.equal(await page.locator('#partner-world-select').inputValue(), 'switchyard');
  const [source, sha256] = (await page.locator('#partner-world-pin').textContent()).split(' · SHA-256 ');
  assert.equal(new URL(source).origin, 'https://raw.githubusercontent.com');
  assert.deepEqual(requests, []);
  await page.locator('#partner-world-import').click();
  await page.locator('#local-world-config').waitFor({ timeout: 60000 });
  await page.locator('#local-world-save').uncheck();
  await page.locator('#local-world-apply').click();
  await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__.snapshot().localWorld);
  const world = await page.evaluate(() => {
    const { manifest, spawn } = window.__SKIMMER_SCRAPER__.snapshot().localWorld;
    return { id: manifest.id, bytes: manifest.bytes, collisionTriangles: manifest.collisionTriangles, spawn };
  });
  assert.equal(world.id, sha256);
  assert.deepEqual(requests, [{ method: 'GET', url: source }]);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'desktop-partner-catalog.json'),
    JSON.stringify({ runtime, world, beforeConfirmation: 0, requests, errors }, null, 2) + '\n');
}
