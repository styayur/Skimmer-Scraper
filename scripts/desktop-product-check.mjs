import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function checkDesktopProduct(page, output, runtime) {
  const report = { runtime };
  const save = () => writeFile(path.join(output, 'desktop-product.json'), JSON.stringify(report, null, 2));
  await page.locator('#start-button').click();
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  const panel = page.locator('#desktop-settings');
  await panel.locator('summary').first().click();
  await page.waitForFunction(() => document.querySelector('[data-environment]').textContent.includes('WebView2 '));
  const env = await page.evaluate(() => window.__TAURI__.core.invoke('desktop_environment'));
  report.webview2 = env.webview2;
  assert.match(report.webview2, /^\d+\.\d+\.\d+\.\d+/);
  report.namedLibrary = path.basename(env.directory);
  if (process.env.SKIMMER_QA_LIBRARY_PARENT) {
    const expected = path.join(process.env.SKIMMER_QA_LIBRARY_PARENT, 'Skimmer-Scraper-Worlds');
    const original = await page.evaluate(() => window.__TAURI__.core.invoke('world_list'));
    await panel.locator('[data-directory]').click();
    await page.waitForFunction(() => !document.querySelector('[data-directory]').disabled, null, { timeout: 240000 });
    const current = await page.evaluate(() => window.__TAURI__.core.invoke('desktop_environment'));
    assert.equal(path.resolve(current.directory), path.resolve(expected));
    assert.deepEqual(await page.evaluate(() => window.__TAURI__.core.invoke('world_list')), original);
    report.selectedDirectory = path.basename(current.directory);
    report.retainedWorldCount = original.length;
    await save();
  }
  await panel.locator('[data-check]').click();
  await page.waitForFunction(() => !document.querySelector('[data-check]').disabled, null, { timeout: 20000 });
  report.updateStatus = await panel.locator('[role=status]').textContent();
  await save();
  assert.match(report.updateStatus, /最新正式版|可更新至/);
  const score = 'skimmer-scraper.best.v2:stable:sakura:gen4:desktop-transfer-test';
  if (process.env.SKIMMER_QA_EXPECT_RETAINED_SCORE === '1') {
    report.scoreAfterReinstall = await page.evaluate(key => localStorage.getItem(key), score);
    await save();
    assert.equal(report.scoreAfterReinstall, '123.25');
  }
  await page.evaluate(key => localStorage.setItem(key, '123.25'), score);
  const download = page.waitForEvent('download', { timeout: 15000 });
  await panel.locator('[data-save-export]').click();
  const file = await download;
  assert.equal(file.suggestedFilename(), 'skimmer-pilot.json');
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  const parsed = JSON.parse(backup);
  assert.equal(parsed.records[score], '123.25');
  await page.evaluate(key => localStorage.removeItem(key), score);
  await panel.locator('input[type=file]').setInputFiles({ name: 'skimmer-pilot.json', mimeType: 'application/json', buffer: backup });
  await page.waitForFunction(key => localStorage.getItem(key) === '123.25', score);
  report.saveRestored = true;
  await save();
}
