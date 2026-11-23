import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const output = 'evidence/v0.7/pr1';
mkdirSync(output, { recursive: true });
mkdirSync('acceptance/v0.7', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5179/');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready);
  await page.keyboard.press('g');
  const library = page.locator('#local-world-library');
  if (!await library.evaluate(element => element.open)) await library.locator(':scope > summary').click();
  await page.locator('#local-world-file').setInputFiles('art/district/district.glb');
  await page.locator('#local-world-analyze').click();
  await page.locator('#local-world-config').waitFor();
  await page.locator('#local-world-save').uncheck();
  await page.locator('#local-world-apply').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().localWorld?.manifest.name === 'district');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running');
  const metadata = await page.evaluate(() => {
    const game = window.__SKIMMER_SCRAPER__;
    const { manifest } = game.snapshot().localWorld;
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { bounds: manifest.bounds, triangles: manifest.triangles, materials: manifest.materials,
      animations: manifest.animations.map(({ name, seconds }) => ({ name, seconds })),
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), gate: game.surface({x:0,y:54,z:-42},7),
      pier: game.surface({x:16,y:54,z:-42},10) };
  });
  assert.equal(metadata.bounds.x, 220);
  assert.equal(metadata.bounds.z, 220);
  assert(metadata.animations.length > 0 && metadata.pier && !metadata.gate);
  const views = [];
  for (const [view, mode, position, pitch] of [
    ['chase', 'chase', { x: 0, y: 42, z: 111 }, .05],
    ['cockpit', 'cockpit', { x: 0, y: 47, z: 48 }, .12],
  ]) {
    const sample = await page.evaluate(async ({ mode, position, pitch }) => {
      const game = window.__SKIMMER_SCRAPER__;
      game.setCameraMode(mode);
      await game.setPose(position, { yaw: 0, pitch, roll: 0 });
      return game.snapshot().cameraPosition;
    }, { mode, position, pitch });
    await page.screenshot({ path: output + '/' + view + '.jpg', quality: 86 });
    views.push({ view, mode, position, pitch, camera: sample });
  }
  assert.deepEqual(errors, []);
  writeFileSync('acceptance/v0.7/pr1.json', JSON.stringify({ ...metadata, views, errors }, null, 2) + '\n');
} finally {
  await browser.close();
}

