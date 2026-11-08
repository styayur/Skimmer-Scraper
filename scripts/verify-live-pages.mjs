import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const baseUrl = 'https://styayur.github.io/Skimmer-Scraper/';
const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

const response = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 90_000 });
await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready === true, {
  timeout: 90_000,
});
await page.screenshot({ path: 'evidence/v0.1.0-live-pages-title.png', fullPage: true, animations: 'disabled' });
await page.getByRole('button', { name: /开始挑战/ }).click();
await page.locator('#hud').waitFor({ state: 'visible' });
await page.waitForTimeout(700);
await page.screenshot({ path: 'evidence/v0.1.0-live-pages-flight.png', fullPage: true });

const result = await page.evaluate(() => {
  const bridge = window.__SKIMMER_SCRAPER__;
  const gl = document.querySelector('#game-canvas')?.getContext('webgl2');
  const extension = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    title: document.title,
    snapshot: bridge?.snapshot(),
    webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : null,
    renderer: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
  };
});

const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  url: baseUrl,
  httpStatus: response?.status() ?? null,
  title: result.title,
  webglVersion: result.webglVersion,
  renderer: result.renderer,
  surfaceState: await page.locator('#surface-state').textContent(),
  hudVisible: await page.locator('#hud').isVisible(),
  snapshot: result.snapshot,
  consoleErrors: errors,
  status: errors.length === 0 ? 'pass' : 'fail',
  caveat: 'Public GitHub Pages preview smoke; headless Chromium may use SwiftShader. Not a Cloudflare deployment.',
};
mkdirSync('evidence', { recursive: true });
writeFileSync('evidence/v0.1.0-live-pages-verification.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
await browser.close();
if (evidence.status !== 'pass') process.exit(1);
