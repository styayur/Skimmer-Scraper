import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const baseUrl = process.env.LIVE_PAGES_URL ?? 'https://styayur.github.io/Skimmer-Scraper/';
const expectedProjectPath = process.env.LIVE_PROJECT_PATH ?? '/Skimmer-Scraper/';
const errors = [];
const failedRequests = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() });
});

const waitReady = () => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready === true, {
  timeout: 90_000,
});

const response = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 90_000 });
await waitReady();
const initialVersion = await page.evaluate(() => window.__SKIMMER_SCRAPER__?.version ?? null);
await page.screenshot({ path: 'evidence/v0.2.0-live-pages-title.png', fullPage: true, animations: 'disabled' });

await page.locator('#world-open').click();
await page.locator('#world-seed-input').fill('v020-live');
await page.locator('#world-preset-select').selectOption('neon');
await page.locator('#world-mode-select').selectOption('ephemeral');
await page.locator('#world-copy-link').click();
const copiedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
const shareLinkChecks = {
  seed: copiedUrl.searchParams.get('seed') === 'v020-live',
  preset: copiedUrl.searchParams.get('preset') === 'neon',
  world: copiedUrl.searchParams.get('world') === 'ephemeral',
  generatorVersion: copiedUrl.searchParams.get('gen') === '2',
  projectSubpathPreserved: copiedUrl.pathname === expectedProjectPath,
};
await page.getByRole('button', { name: /生成并重载/ }).click();
await page.waitForURL(/world=ephemeral/);
await waitReady();
await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().worldMode === 'ephemeral', {
  timeout: 90_000,
});
await page.getByRole('button', { name: /开始挑战/ }).click();
await page.locator('#hud').waitFor({ state: 'visible' });
await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running', {
  timeout: 90_000,
});
await page.evaluate(() => window.__SKIMMER_SCRAPER__.setPose(
  { x: 0, y: 85, z: 120 },
  { pitch: 0 },
));
await page.keyboard.press('c');
await page.waitForFunction(() => {
  const state = window.__SKIMMER_SCRAPER__?.snapshot();
  return state?.cameraMode === 'cockpit' && state.cameraBlend > 0.5;
}, { timeout: 20_000 });
await page.waitForTimeout(550);
await page.screenshot({ path: 'evidence/v0.2.0-live-pages-cockpit.png', fullPage: true });
await page.keyboard.press('c');
await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().cameraMode === 'chase', {
  timeout: 20_000,
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'evidence/v0.2.0-live-pages-flight.png', fullPage: true });

const runtime = await page.evaluate(() => {
  const bridge = window.__SKIMMER_SCRAPER__;
  const snapshot = bridge?.snapshot();
  const gl = document.querySelector('#game-canvas')?.getContext('webgl2');
  const extension = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    bridgeVersion: bridge?.version ?? null,
    title: document.title,
    snapshot,
    webglVersion: gl ? String(gl.getParameter(gl.VERSION)) : null,
    renderer: gl && extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
    markers: {
      worldModeSelector: Boolean(document.querySelector('#world-mode-select')),
      ephemeralTitle: document.querySelector('#title-world-meta')?.textContent?.includes('EPHEMERAL') ?? false,
      hudVisible: !document.querySelector('#hud')?.hidden,
    },
  };
});

const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  url: page.url(),
  baseUrl,
  httpStatus: response?.status() ?? null,
  initialVersion,
  runtime,
  shareLinkChecks,
  consoleErrors: errors,
  failedRequests,
  status: errors.length === 0 && failedRequests.length === 0 &&
    initialVersion === '0.2.0' &&
    shareLinkChecks.seed && shareLinkChecks.preset && shareLinkChecks.world &&
    shareLinkChecks.generatorVersion && shareLinkChecks.projectSubpathPreserved &&
    runtime.snapshot?.worldMode === 'ephemeral' &&
    runtime.markers.hudVisible
    ? 'pass'
    : 'fail',
  caveat: 'Public GitHub Pages smoke test. Headless Chromium may use SwiftShader; this is not the real-GPU benchmark.',
};
mkdirSync('evidence', { recursive: true });
writeFileSync('evidence/v0.2.0-live-pages-verification.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
await browser.close();
if (evidence.status !== 'pass') process.exit(1);
