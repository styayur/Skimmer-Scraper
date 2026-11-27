// Qualify one served URL. The ZIP orchestrator runs standalone and embed separately.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [address, sha, output, mode = 'standalone', profile] = process.argv.slice(2);
const base = new URL(address);
assert(['http:', 'https:'].includes(base.protocol) && /^[a-f0-9]{40}$/.test(sha));
assert(['standalone', 'embed'].includes(mode) && (!profile || profile === '--smoke'));
const smoke = profile === '--smoke';
const embedding = mode === 'embed';
await mkdir(output, { recursive: true });
const parent = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Embedded game qualification</title><link rel="icon" href="data:,">'
    + '<body style="margin:0"><iframe title="Game" sandbox="allow-scripts allow-same-origin allow-pointer-lock" '
    + 'allow="fullscreen; gamepad; autoplay" style="display:block;width:100vw;height:100vh;border:0"></iframe>'
    + '<script>document.querySelector("iframe").src=' + JSON.stringify(base.href).replaceAll('<', '\\u003c') + ';</script>');
});
if (embedding) await new Promise(resolve => parent.listen(0, '127.0.0.1', resolve));
const parentOrigin = embedding ? 'http://127.0.0.1:' + parent.address().port : null;
let browser;
try {
  browser = await chromium.launch(smoke
    ? { headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }
    : { channel: 'msedge', headless: false, args: ['--use-angle=d3d11', '--disable-software-rasterizer'] });
  for (const locale of ['zh-CN', 'en-US']) {
    const english = locale === 'en-US';
    const context = await browser.newContext({ locale, viewport: smoke ? { width: 960, height: 540 } : { width: 1280, height: 720 } });
    const page = await context.newPage();
    const report = { mode, locale, passed: false, address, parentOrigin, browser: browser.version(),
      profile: smoke ? 'software smoke' : 'headed Edge', errors: [], failed: [], remote: [], outsideMount: [],
      cancelledRequests: [] };
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.failed.push([response.status(), response.url()]); });
    page.on('requestfailed', request => {
      const reason = request.failure()?.errorText;
      if (reason === 'net::ERR_ABORTED') report.cancelledRequests.push(request.url());
      else report.failed.push([reason, request.url()]);
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['https:', 'http:'].includes(url.protocol)) return;
      if (url.origin === base.origin) {
        if (!url.pathname.startsWith(new URL('.', base).pathname)) report.outsideMount.push(url.href);
      } else if (url.origin !== parentOrigin) report.remote.push(url.href);
    });
    try {
      await page.goto(parentOrigin ?? base.href);
      const doc = embedding ? await (await page.locator('iframe').elementHandle()).contentFrame() : page.mainFrame();
      assert(doc && doc.parentFrame() === (embedding ? page.mainFrame() : null));
      await doc.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 60000 });
      assert.equal(new URL(doc.url()).href, base.href);
      if (embedding) assert.notEqual(new URL(page.url()).origin, new URL(doc.url()).origin);
      report.identity = await doc.evaluate(async () => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const result = await fetch('./build-info.json');
        if (!result.ok) throw Error('Unavailable build-info.json');
        return { lang: document.documentElement.lang, browserLanguage: navigator.language, build: await result.json(),
          topLevel: window === window.top, gpu: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
      });
      assert.equal(report.identity.topLevel, !embedding);
      assert.equal(report.identity.build.sourceCommit, sha);
      assert.equal(report.identity.build.version, '0.9.1');
      assert.equal(report.identity.lang, locale);
      assert.equal(report.identity.browserLanguage, locale);
      const start = doc.locator('#start-button');
      assert.equal((await start.innerText()).trim(), english ? 'Start Game' : '开始游戏');
      report.visibleTitle = await doc.locator('#title-screen').innerText();
      await page.screenshot({ path: path.join(output, locale + '-title.png') });
      await doc.locator('#title-screen [data-action=help]').click();
      assert.equal(await doc.locator('#help-title').innerText(), english ? 'Flight Guide' : '游戏教程');
      const tutorial = await doc.locator('#guide-content').innerText();
      report.tutorialCharacters = tutorial.length;
      assert(tutorial.length > 1000);
      assert.equal(/\p{Script=Han}/u.test(tutorial), !english);
      await doc.locator('#help-close').click();
      await start.click();
      await doc.waitForFunction(seconds => window.__SKIMMER_SCRAPER__.snapshot().runTime > seconds, smoke ? 0.7 : 4);
      report.flight = await doc.evaluate(() => {
        const game = window.__SKIMMER_SCRAPER__.snapshot();
        return { mode: game.mode, runTime: game.runTime, triangles: game.render.triangles,
          companions: game.companions.filter(agent => agent.deployed).length };
      });
      assert.equal(report.flight.mode, 'running');
      assert.equal(report.flight.companions, 3);
      assert(report.flight.triangles > 0);
      await page.screenshot({ path: path.join(output, locale + '-flight.png') });
      await page.keyboard.press('Escape');
      await doc.locator('#pause-resume').waitFor({ state: 'visible' });
      await doc.locator('#pause-resume').click();
      await doc.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running');
      report.pauseResume = true;
      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.failed, []);
      assert.deepEqual(report.remote, []);
      assert.deepEqual(report.outsideMount, []);
      report.passed = true;
    } catch (error) {
      report.failure = String(error);
      console.error(mode, locale, error);
      process.exitCode = 1;
    } finally {
      await writeFile(path.join(output, locale + '.json'), JSON.stringify(report, null, 2) + '\n');
      await context.close();
    }
  }
} finally {
  await browser?.close();
  if (embedding) await new Promise(resolve => parent.close(resolve));
}
