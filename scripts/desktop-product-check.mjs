import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function checkDesktopProduct(page, output, runtime) {
  const report = { runtime };
  const save = () => writeFile(path.join(output, 'desktop-product.json'), JSON.stringify(report, null, 2));
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running');
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
  if (process.env.SKIMMER_QA_OFFLINE_UPDATE === '1') {
    assert.match(report.updateStatus, /暂时无法连接|could not reach GitHub/i);
    await page.locator('#rules-close').click();
    if (await page.locator('#pause-panel').isVisible()) await page.locator('#pause-resume').click();
    const start = await page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot().runTime);
    await page.waitForFunction(t => {
      const state = window.__SKIMMER_SCRAPER__.snapshot();
      return state.mode === 'running' && state.runTime > t + 2;
    }, start);
    report.flightAfterFailedUpdateCheck = true;
    await save();
    return;
  }
  assert.match(report.updateStatus, /最新正式版|可更新至|latest release|update available/i);
  const score = 'skimmer-scraper.best.v2:stable:sakura:gen4:desktop-transfer-test';
  if (process.env.SKIMMER_QA_EXPECT_RETAINED_SCORE === '1') {
    report.scoreAfterReinstall = await page.evaluate(key => localStorage.getItem(key), score);
    await save();
    assert.equal(report.scoreAfterReinstall, '123.25');
  }
  const scores = {
    [score]: '123.25',
    [score + ':challenge:grace5:assisted:surface-glide']: '87.5',
  };
  await page.evaluate(values => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, scores);
  const download = page.waitForEvent('download', { timeout: 15000 });
  await panel.locator('[data-save-export]').click();
  const file = await download;
  assert.equal(file.suggestedFilename(), 'skimmer-pilot.json');
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  const parsed = JSON.parse(backup);
  assert.equal(parsed.format, 'skimmer-pilot');
  assert.equal(parsed.schema, 1);
  for (const [key, value] of Object.entries(scores)) assert.equal(parsed.records[key], value);
  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), Object.keys(scores));
  const reload = page.waitForEvent('domcontentloaded');
  await panel.locator('input[type=file]').setInputFiles({ name: 'skimmer-pilot.json', mimeType: 'application/json', buffer: backup });
  await reload;
  await page.waitForFunction(values => window.__SKIMMER_SCRAPER__?.snapshot().ready &&
    Object.entries(values).every(([key,value]) => localStorage.getItem(key) === value), scores);
  report.scoreClassesRestored = ['solo', 'assisted-surface-glide'];
  report.saveRestored = true;
  await save();
}
