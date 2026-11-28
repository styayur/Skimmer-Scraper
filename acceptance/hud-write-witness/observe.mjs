import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(path.resolve('after/package.json'));
const { chromium } = require('@playwright/test');
const commits = {
  before: 'ac943acd6a2c6d21431aa138327bc3e64ed8552f',
  after: 'b1582db7a1b1f88ec48435e0c3edf3b904cbda03',
};
await mkdir('observations', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [name, revision] of Object.entries(commits)) {
    const server = spawn('python3', ['-m', 'http.server', '18765', '--bind', '127.0.0.1'], {
      cwd: path.resolve(name, 'dist'), stdio: 'ignore',
    });
    const exit = new Promise(resolve => server.once('exit', resolve));
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 800, height: 500 } });
    try {
      const endpoint = 'http://127.0.0.1:18765/';
      let build;
      for (let attempt = 0; attempt < 50 && !build; attempt++) {
        try { build = await (await fetch(endpoint + 'build-info.json')).json(); }
        catch { await delay(100); }
      }
      assert.equal(build?.sourceCommit, revision);
      assert.equal(build.dirty, false);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(endpoint + '?seed=334458&world=stable');
      await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, undefined, { timeout: 90000 });
      await page.locator('#start-button').click();
      await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().runTime > 0.5);
      const observation = await page.evaluate(async () => {
        const hud = document.getElementById('hud');
        const best = document.getElementById('hud-best');
        const meter = document.querySelector('.grace-meter');
        const halo = document.getElementById('journey-easter-egg');
        const timer = document.getElementById('hud-timer');
        const writes = { best: 0, graceMaximum: 0, haloVisibility: 0, hudChildren: 0, hudAttributes: 0 };
        const fixed = new MutationObserver(records => {
          for (const record of records) {
            if (record.target === best) writes.best++;
            if (record.target === meter) writes.graceMaximum++;
            if (record.target === halo) writes.haloVisibility++;
          }
        });
        const entire = new MutationObserver(records => {
          for (const record of records) {
            if (record.type === 'childList') writes.hudChildren++;
            if (record.type === 'attributes') writes.hudAttributes++;
          }
        });
        fixed.observe(best, { childList: true });
        fixed.observe(meter, { attributes: true, attributeFilter: ['aria-valuemax'] });
        fixed.observe(halo, { attributes: true, attributeFilter: ['hidden'] });
        entire.observe(hud, { subtree: true, childList: true, attributes: true });
        const snapshot = () => {
          const run = window.__SKIMMER_SCRAPER__.snapshot();
          return { best: best.textContent, graceMaximum: meter.getAttribute('aria-valuemax'),
            haloHidden: halo.hidden, displayedTime: timer.textContent, elapsed: run.runTime,
            mode: run.mode, companions: run.companions.length };
        };
        const start = snapshot();
        const frames = 48;
        for (let frame = 0; frame < frames; frame++) await new Promise(requestAnimationFrame);
        const end = snapshot();
        fixed.disconnect();
        entire.disconnect();
        return { frames, start, end, writes };
      });
      const receipt = { build, browser: browser.version(), softwareRendering: true, errors, observation };
      await writeFile('observations/' + name + '.json', JSON.stringify(receipt, null, 2) + '\n');
      assert.deepEqual(errors, []);
      const { start, end, writes } = observation;
      assert.equal(start.mode, 'running');
      assert.equal(end.mode, 'running');
      assert.equal(start.companions, 3);
      assert(end.elapsed > start.elapsed);
      assert.notEqual(start.displayedTime, end.displayedTime);
      for (const key of ['best', 'graceMaximum', 'haloHidden']) assert.deepEqual(start[key], end[key]);
      for (const key of ['best', 'graceMaximum', 'haloVisibility']) {
        if (name === 'before') assert(writes[key] >= observation.frames - 2, key + ' expected baseline writes');
        else assert.equal(writes[key], 0, key);
      }
    } finally {
      await context.close();
      server.kill();
      await exit;
    }
  }
} finally { await browser.close(); }
