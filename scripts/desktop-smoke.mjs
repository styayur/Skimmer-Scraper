import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const [executable, output] = process.argv.slice(2);
if (!executable || !output) throw Error('Usage: node scripts/desktop-smoke.mjs <installed executable> <evidence directory>');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'skimmer-webview-'));
const app = spawn(path.resolve(executable), [], {
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0' },
  stdio: 'inherit',
});
let browser;
try {
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    if (app.exitCode !== null) throw Error('Application exited during launch: ' + app.exitCode);
    for (const location of ['EBWebView/DevToolsActivePort', 'DevToolsActivePort']) {
      const active = await readFile(path.join(profile, location), 'utf8').catch(() => '');
      if (active) port = Number(active.split('\n')[0]);
    }
    if (!port) await delay(200);
  }
  assert.ok(port, 'WebView2 debugging endpoint');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent('page');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__, null, { timeout: 60000 });
  const runtime = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      origin: location.origin, userAgent: navigator.userAgent, renderer: extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
      app: await (await fetch('./build-info.json')).json(), wasm: WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0])),
      webgpu: !!await navigator.gpu?.requestAdapter(), voiceCount: speechSynthesis.getVoices().length,
    };
  });
  assert.match(runtime.origin, /^https?:\/\/tauri\.localhost$/);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().runTime > 2);
  const flight = await page.evaluate(() => {
    const s = window.__SKIMMER_SCRAPER__.snapshot();
    return { time: s.runTime, speed: s.speed, companions: s.companions.filter(a => a.deployed).length };
  });
  assert.equal(flight.companions, 3);
  await page.screenshot({ path: path.join(output, 'city-webview2.png') });
  await page.keyboard.press('Escape');
  await page.locator('#pause-panel').waitFor({state:'visible'});
  await page.keyboard.press('Alt+Enter');
  await page.waitForFunction(() => window.__TAURI__.window.getCurrentWindow().isFullscreen());
  await page.keyboard.press('Alt+Enter');
  await page.waitForFunction(async () => !await window.__TAURI__.window.getCurrentWindow().isFullscreen());
  await page.locator('#pause-resume').click();
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'desktop-smoke.json'), JSON.stringify({ runtime, flight, escapePause: true, fullscreenRoundTrip: true, errors }, null, 2) + '\n');
} finally {
  await browser?.close().catch(() => {});
  if (app.exitCode === null) {
    // Close the actual application window through the normal Windows close message.
    const close = spawn('powershell.exe', ['-NoProfile', '-Command', '(Get-Process -Id ' + app.pid + ').CloseMainWindow()'], { windowsHide:true });
    await once(close, 'exit');
    for (let i=0; i<50 && app.exitCode===null; i++) await delay(100);
    if (app.exitCode===null) { app.kill(); throw Error('Application did not close normally'); }
  }
}
