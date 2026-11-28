import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

export const hash = data => createHash('sha256').update(data).digest('hex');
export const ready = page => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 90000 });

export async function withInstalledGame(exe, version, source, visit) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(process.platform, 'win32');
  assert.equal(path.resolve(exe), path.join(process.env.RUNNER_TEMP, 'skimmer-lifecycle', 'installed', 'skimmer-scraper.exe'));
  assert(!process.env.WEBVIEW2_USER_DATA_FOLDER);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const app = spawn(exe, [], { stdio: 'inherit', windowsHide: false, env: {
    ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-address=127.0.0.1 --remote-debugging-port=' + new URL(endpoint).port,
  } });
  let browser;
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      assert.equal(app.exitCode, null, 'Installed application exited during startup');
      if (await fetch(endpoint + '/json/version').then(r => r.ok).catch(() => false)) break;
      await delay(200);
    }
    browser = await chromium.connectOverCDP(endpoint, { timeout: 10000 });
    const context = browser.contexts()[0];
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(90000);
    const page = context.pages()[0] ?? await context.waitForEvent('page');
    await ready(page);
    const cdp = await context.newCDPSession(page);
    const scripts = new Map();
    cdp.on('Debugger.scriptParsed', s => scripts.set(s.url, s.scriptId));
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Debugger.enable');
    // A previously shared legacy world URL is replayed on the installed origin.
    const world = new URL('/?gen=2&preset=sakura&seed=73581&world=stable', page.url());
    await page.goto(world.href);
    await ready(page);
    const identity = await page.evaluate(async () => {
      const gl = document.querySelector('#game-canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { origin: location.origin, url: location.href,
        userAgent: navigator.userAgent, renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
        environment: await window.__TAURI__.core.invoke('desktop_environment'),
        build: await (await fetch('./build-info.json', { cache: 'no-store' })).json(),
        entry: document.querySelector('script[type=module][src]').src };
    });
    assert.match(identity.origin, /^https?:\/\/tauri\.localhost$/);
    assert.equal(identity.build.sourceCommit, source);
    assert.equal(identity.build.version, version);
    assert.equal(identity.build.dirty, false);
    assert(identity.environment.webview2 && identity.renderer);
    assert.equal(path.resolve(identity.environment.directory).toLowerCase(),
      path.join(process.env.LOCALAPPDATA, 'io.github.styayur.skimmer-scraper', 'world-library-v1').toLowerCase());
    const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId: scripts.get(identity.entry) });
    identity.executedEntrySha256 = hash(scriptSource);
    await cdp.detach();
    console.log('Installed WebView2', identity.build.version, identity.build.sourceCommit, identity.environment.webview2);
    await visit(page, identity);
  } finally {
    await browser?.close().catch(() => {});
    if (app.exitCode === null && app.pid) {
      // Use the same normal Windows close message as the installed desktop smoke.
      const close = '$p = Get-Process -Id ' + app.pid + ' -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow() }';
      execFileSync('powershell.exe', ['-NoProfile', '-Command', close], { windowsHide: true, stdio: 'ignore' });
      for (let i = 0; app.exitCode === null && i < 150; i++) await delay(100);
    }
    if (app.exitCode === null) {
      app.kill();
      throw Error('The installed process did not shut down normally');
    }
    assert.equal(app.exitCode, 0);
  }
}
