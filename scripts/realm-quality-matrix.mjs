import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

export async function qualityMatrix(
  page,
  output,
  packDirectory,
  cityComparison = false,
  glideComparison = false,
) {
  const base = new URL(page.url());
  base.search = '';
  const device = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    return {
      renderer: gl.getParameter(
        gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL,
      ),
      native: !!window.__TAURI__,
      build: await (await fetch('./build-info.json')).json(),
    };
  });
  assert.match(device.renderer, /780M/);
  assert.equal(device.build.dirty, false);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.send('Performance.enable');
  const taskSeconds = async () => {
    const { metrics } = await session.send('Performance.getMetrics');
    return metrics.find(metric => metric.name === 'TaskDuration').value;
  };
  const expanded = device.build.version === '0.9.0' && !cityComparison;
  const rows = [];
  const report = () =>
    writeFile(
      output,
      JSON.stringify(
        {
          device,
          seed: 334458,
          method:
            'Scripted boosted yaw, one initial pose per scenario, 12 seconds per scenario. WorldForge uses straight boosted flight. Frame intervals use rAF and renderer task duration uses CDP Performance.',
          rows,
        },
        null,
        2,
      ) + '\n',
    );
  const realm=process.env.SKIMMER_QA_REALM ?? 'dragonspine';
  const id=realm==='dragon'?'dragonspine-high-1':'ascendant-high-2-334458';
  let installedHere = false;
  try {
    if (device.native && !cityComparison && !glideComparison) {
      const present = await page.evaluate(
        async (id) =>
          (await window.__TAURI__.core.invoke('pack_list')).some(
            (p) => p.id === id,
          ),
        id,
      );
      if (!present) {
        await page.keyboard.press('g');
        const pack = page.locator('#world-packs');
        await pack.locator('summary').click();
        await pack.locator('input').setInputFiles(path.resolve(packDirectory));
        await page.waitForFunction(
          (id) => document.querySelector('#world-packs select')?.value === id,
          id,
          { timeout: 180000 },
        );
        installedHere = true;
      }
      await page.evaluate(
        (id) => localStorage.setItem('skimmer-scraper.active-pack', id),
        id,
      );
    }
    const scenarios = [];
    const themes = glideComparison ? [] : cityComparison ? ['city'] : expanded ? ['city', realm, 'worldforge'] : ['city', realm];
    for (const theme of themes) {
      for (const quality of cityComparison ? ['balanced'] : ['balanced', 'high']) {
        for (const count of cityComparison ? [3] : [0, 1, 2, 3]) {
          scenarios.push({theme, quality, count, voice: false, music: false});
          if (expanded && quality === 'balanced' && count === 3) {
            for (const [voice, music] of [[true, false], [false, true], [true, true]]) {
              scenarios.push({theme, quality, count, voice, music});
            }
          }
        }
      }
    }
    if (expanded) {
      for (const glide of [false, true]) {
        scenarios.push({theme:'city', quality:'balanced', count:0, voice:false, music:false, glide});
      }
    }
    for (const {theme, quality, count, voice, music, glide} of scenarios) {
          const url = new URL(base);
          url.searchParams.set('seed', '334458');
          url.searchParams.set('gen', glide === undefined ? '4' : '2');
          if (theme !== 'city') url.searchParams.set('theme', theme);
          await page.evaluate(({count, voice}) => {
            localStorage.setItem('skimmer-scraper.voice.v1', JSON.stringify({output: voice ? 'local' : 'off'}));
            localStorage.setItem(
              'skimmer-scraper.companions.v3',
              JSON.stringify({ count }),
            );
            localStorage.setItem(
              'skimmer-scraper.rules.v3',
              JSON.stringify({ mode: 'free', shield: true }),
            );
          }, {count, voice});
          await page.goto(url.href);
          await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__);
          if (music) await page.locator('#bgm-enabled').evaluate(control => control.click());
          const qualityLabel = await page.locator('#quality-button').textContent();
          if (qualityLabel.includes('高') !== (quality === 'high'))
            await page.locator('#quality-button').evaluate((b) => b.click());
          await page.locator('#start-button').click();
          await page.waitForFunction(
            () => window.__SKIMMER_SCRAPER__.snapshot().runTime > 1,
          );
          await page.evaluate(async ({theme, expandedRoute, compareGlide}) => {
            const g = window.__SKIMMER_SCRAPER__;
            g.pause();
            await g.setPose(
              compareGlide ? {x:0,y:6,z:34} : theme === 'worldforge' ? {x:0,y:132,z:120} : theme === 'dragonspine' && expandedRoute ? {x:420,y:555,z:-940} : theme === 'dragon' ? {x:-100,y:290,z:-440} : {x:340,y:410,z:125},
              { yaw: 0, pitch: 0, roll: 0 },
            );
            g.resume();
          },{theme, expandedRoute: expanded && device.native, compareGlide:glide !== undefined});
          if (glide) await page.keyboard.press('Space');
          if (glide === undefined) {
            await page.keyboard.down('Shift');
            if (theme !== 'worldforge') await page.keyboard.down('q');
          }
          if (theme === realm)
            await page.waitForFunction(
              (native) => {
                const d =
                  window.__SKIMMER_SCRAPER__.snapshot().streaming.realmDetail;
                return native ? d?.high > 0 : d?.resident > 0;
              },
              device.native,
              { timeout: 20000 },
            );
          if (music) await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().music.playing);
          const cpuStart = await taskSeconds();
          const result = await page.evaluate(async () => {
            const g = window.__SKIMMER_SCRAPER__;
            const start = g.snapshot();
            const frames = [];
            let previous = await new Promise(requestAnimationFrame);
            const origin = previous;
            const samples=[];
            let nextSample=0;
            while (previous - origin < 12000) {
              const now = await new Promise(requestAnimationFrame);
              frames.push(now - previous);
              if(now-origin>=nextSample){
                const s=g.snapshot();
                samples.push({ms:now-origin,position:s.position,glidePhase:s.glide?.phase,buffering:s.buffering,heap:performance.memory?.usedJSHeapSize??null,
                  streaming:s.streaming,entities:s.dynamicStructures.length,gpu:s.render.gpuMs,geometries:s.render.geometries,textures:s.render.textures});
                nextSample+=1000;
              }
              previous = now;
            }
            const end = g.snapshot(),
              sorted = [...frames].sort((a, b) => a - b);
            const p = (q) => sorted[Math.floor(q * (sorted.length - 1))];
            const canvas = document.querySelector('canvas');
            return {
              canvas: [canvas.width, canvas.height],
              qualityLabel:
                document.querySelector('#quality-button').textContent,
              frames: frames.length,
              bufferingEvents: end.bufferingEvents && {
                entries: end.bufferingEvents.entries - start.bufferingEvents.entries,
                ms: end.bufferingEvents.totalMs - start.bufferingEvents.totalMs,
              },
              audio: {music: end.music, voice: end.voice?.output, played: end.voice?.played, completed: end.voice?.completed},
              samples,
              averageFps: (1000 * frames.length) / (previous - origin),
              p50Ms: p(0.5),
              p95Ms: p(0.95),
              p99Ms: p(0.99),
              worstMs: p(1),
              elapsedSimulation: end.runTime - start.runTime,
              shieldImpacts: end.shieldImpacts - start.shieldImpacts,
              mode: end.mode,
              companions: end.companions.filter((w) => w.deployed).length,
              detail: end.streaming.realmDetail,
              render: end.render,
              startPosition: start.position,
              endPosition: end.position,
            };
          });
          const rendererTaskMsPerFrame = 1000 * ((await taskSeconds()) - cpuStart) / result.frames;
          if (theme !== 'worldforge') await page.keyboard.up('q');
          await page.keyboard.up('Shift');
          assert.equal(result.mode, 'running');
          assert.equal(result.companions, count);
          assert.ok(result.elapsedSimulation > 0);
          assert.equal(!!result.detail, theme === realm);
          rows.push({ theme, quality, count, voice, music, glide, rendererTaskMsPerFrame, ...result });
          await report();
          if (glide !== undefined) {
            assert.equal(result.shieldImpacts, 0);
            const phase = glide ? 'GLIDING' : 'FLIGHT';
            assert(result.samples.slice(1).every(s => s.glidePhase === phase), 'Matched ground flight lost its intended state');
          }
          console.log(theme, quality, count, result.averageFps.toFixed(1));
        }
  } finally {
    if (installedHere)
      await page.evaluate(
        (id) => window.__TAURI__.core.invoke('pack_remove', { id }),
        id,
      );
  }
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const [url, output] = process.argv.slice(2);
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--use-angle=d3d11', '--disable-software-rasterizer'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__);
    await qualityMatrix(
      page,
      output,
      undefined,
      process.argv[4] === 'city-comparison',
      process.argv[4] === 'glide-comparison',
    );
  } finally {
    await browser.close();
  }
}
