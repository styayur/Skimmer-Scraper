import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const [executable, output, libraryCheck] = process.argv.slice(2);
if (!executable || !output)
  throw Error(
    'Usage: node scripts/desktop-smoke.mjs <installed executable> <evidence directory>',
  );
await mkdir(output, { recursive: true });
const profile = process.env.SKIMMER_QA_WEBVIEW_PROFILE ?? await mkdtemp(path.join(tmpdir(), 'skimmer-webview-'));
const launched = Date.now();
const app = spawn(path.resolve(executable), [], {
  env: {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0',
  },
  stdio: 'inherit',
});
let browser;
try {
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    if (app.exitCode !== null)
      throw Error('Application exited during launch: ' + app.exitCode);
    for (const location of [
      'EBWebView/DevToolsActivePort',
      'DevToolsActivePort',
    ]) {
      const portFile = path.join(profile, location);
      if ((await stat(portFile).catch(() => null))?.mtimeMs < launched - 1000) continue;
      const active = await readFile(portFile, 'utf8').catch(
        () => '',
      );
      if (active) port = Number(active.split('\n')[0]);
    }
    if (!port) await delay(200);
  }
  assert.ok(port, 'WebView2 debugging endpoint');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__, null, {
    timeout: 60000,
  });
  const runtime = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      origin: location.origin,
      userAgent: navigator.userAgent,
      renderer: extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
      app: await (await fetch('./build-info.json')).json(),
      wasm: WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
      webgpu: !!(await navigator.gpu?.requestAdapter()),
      localRadio: typeof AudioContext === 'function',
    };
  });
  assert.match(runtime.origin, /^https?:\/\/tauri\.localhost$/);
  if (process.env.SKIMMER_QA_SHA) assert.equal(runtime.app.sourceCommit, process.env.SKIMMER_QA_SHA);
  if (libraryCheck === 'product') {
    const { checkDesktopProduct } = await import('./desktop-product-check.mjs');
    await checkDesktopProduct(page, output, runtime);
  } else if (libraryCheck === 'flight-voice') {
    const { profileVoice } = await import('./profile-flight-voice.mjs');
    await profileVoice(page, output, runtime);
  } else if (libraryCheck === 'glide-pad') {
    const { checkGlideBumper } = await import('./glide-bumper-check.mjs');
    await checkGlideBumper(page, output);
  } else if (libraryCheck === 'gamepad') {
    const { observeGamepad } = await import('./desktop-live-input.mjs');
    await page.locator('#start-button').click();
    await page.waitForFunction(
      () => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running',
    );
    const gamepad = await observeGamepad(
      page,
      Number(process.env.SKIMMER_PAD_SECONDS ?? 90),
    );
    await writeFile(
      path.join(output, 'gamepad.json'),
      JSON.stringify({ runtime, gamepad }, null, 2),
    );
    assert.ok(
      gamepad.axisDelta > 0.25 && gamepad.pausedAfterStart,
      'Move a stick and press Start during flight',
    );
  } else if (libraryCheck === 'live-input') {
    const { liveInput } = await import('./desktop-live-input.mjs');
    await liveInput(page, output);
  } else if (libraryCheck === 'matrix') {
    const { qualityMatrix } = await import('./realm-quality-matrix.mjs');
    await qualityMatrix(
      page,
      path.join(output, 'desktop-matrix.json'),
      process.argv[5],
      process.argv[6] === 'city-comparison',
      process.argv[6] === 'glide-comparison',
    );
  } else if (libraryCheck === 'compat') {
    const { checkCompatibility } = await import('./desktop-compat.mjs');
    await checkCompatibility(page, output);
  } else if (libraryCheck === 'pack-cancel') {
    const { checkDownloadCancellation } = await import('./desktop-pack-check.mjs');
    await checkDownloadCancellation(page, output, runtime);
  } else if (libraryCheck === 'pack') {
    const { checkPack } = await import('./desktop-pack-check.mjs');
    await checkPack(page, output, process.argv[5], runtime);
  } else if (libraryCheck) {
    const { createWorldFixture } =
      await import('../tests/fixtures/worldGlb.ts');
    const { createHash } = await import('node:crypto');
    const buffer = createWorldFixture('arches');
    const id = createHash('sha256').update(buffer).digest('hex');
    await page.keyboard.press('g');
    await page.locator('#local-world-library > summary').click();
    const invokeList = () =>
      page.evaluate(() => window.__TAURI__.core.invoke('world_list'));
    if (libraryCheck === 'save') {
      assert(
        !(await invokeList()).some((r) => r.manifest.id === id),
        'Fixture already installed',
      );
      const fixture = path.join(output, 'qa-arches.glb');
      await writeFile(fixture, buffer);
      await page.locator('#local-world-file').setInputFiles(fixture);
      await page.locator('#local-world-analyze').click();
      await page.locator('#local-world-apply').click();
      await page.waitForFunction(
        (id) =>
          window.__SKIMMER_SCRAPER__.snapshot().localWorld?.manifest.id === id,
        id,
      );
      assert((await invokeList()).some((r) => r.manifest.id === id));
    } else if (libraryCheck === 'restore') {
      const row = (await invokeList()).find((r) => r.manifest.id === id);
      assert.equal(row?.manifest.name, 'qa-arches');
      await page.locator('#local-world-select').selectOption(id);
      await page.locator('#local-world-load').click();
      await page.locator('#local-world-apply').waitFor({ state: 'visible' });
      await page.locator('#local-world-remove').click();
      await page.waitForFunction(
        async (id) =>
          !(await window.__TAURI__.core.invoke('world_list')).some(
            (r) => r.manifest.id === id,
          ),
        id,
      );
    } else throw Error('Unknown library check');
    await writeFile(
      path.join(output, libraryCheck + '.json'),
      JSON.stringify(
        { runtime, libraryCheck, id, bytes: buffer.length },
        null,
        2,
      ),
    );
  } else {
    await page.locator('#start-button').click();
    await page.waitForFunction(
      () => window.__SKIMMER_SCRAPER__.snapshot().runTime > 2,
    );
    const flight = await page.evaluate(() => {
      const s = window.__SKIMMER_SCRAPER__.snapshot();
      return {
        time: s.runTime,
        speed: s.speed,
        companions: s.companions.filter((a) => a.deployed).length,
      };
    });
    assert.equal(flight.companions, 3);
    await page.screenshot({ path: path.join(output, 'city-webview2.png') });
    await page.keyboard.press('Escape');
    await page.locator('#pause-panel').waitFor({ state: 'visible' });
    await page.keyboard.press('Alt+Enter');
    await page.waitForFunction(() =>
      window.__TAURI__.window.getCurrentWindow().isFullscreen(),
    );
    await page.keyboard.press('Alt+Enter');
    await page.waitForFunction(
      async () =>
        !(await window.__TAURI__.window.getCurrentWindow().isFullscreen()),
    );
    await page.locator('#pause-resume').click();
    await page.keyboard.press('r');
    await page.waitForFunction(
      () => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running',
    );
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(output, 'desktop-smoke.json'),
      JSON.stringify(
        {
          runtime,
          flight,
          executableSha256: createHash('sha256').update(await readFile(executable)).digest('hex'),
          escapePause: true,
          fullscreenRoundTrip: true,
          errors,
        },
        null,
        2,
      ) + '\n',
    );
  }
} finally {
  await browser?.close().catch(() => {});
  if (app.exitCode === null) {
    // Close the actual application window through the normal Windows close message.
    const close = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '(Get-Process -Id ' + app.pid + ').CloseMainWindow()',
      ],
      { windowsHide: true },
    );
    await once(close, 'exit');
    for (let i = 0; i < 50 && app.exitCode === null; i++) await delay(100);
    if (app.exitCode === null) {
      app.kill();
      throw Error('Application did not close normally');
    }
  }
}
