import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const matrixMethod = 'Scripted boosted yaw, one initial pose per scenario, 12 seconds per scenario. WorldForge uses straight boosted flight. Frame intervals use rAF and renderer task duration uses CDP Performance.';
const runnerSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const sampling = {
  durationMs: 12000, telemetryIntervalMs: 1000, warmUp: 'runTime > 1s before setting pose; wait for realm residency and requested music',
  fps: '1000 * rAF interval count / elapsed ms',
  p95: 'sorted rAF intervals at floor(0.95 * (n - 1))',
  cpu: '1000 * change in CDP Performance.TaskDuration / rAF interval count',
};

async function saveJson(file, value) {
  const pending = file + '.tmp-' + randomUUID();
  await writeFile(pending, JSON.stringify(value, null, 2) + '\n');
  await rename(pending, file);
}

export function matrixScenarios({ expanded, cityComparison, glideComparison, realm }) {
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
  return scenarios;
}

// Select using original zero-based indices. Always visit them in catalog order.
export function selectIndices(raw, size) {
  if (raw === undefined) return Array.from({ length: size }, (_, i) => i);
  assert.match(raw, /^(0|[1-9]\d*)(,(0|[1-9]\d*))*$/, 'Use comma-separated zero-based scenario indices');
  const indices = raw.split(',').map(Number);
  assert.equal(new Set(indices).size, indices.length, 'Duplicate scenario index');
  assert(indices.every(i => Number.isSafeInteger(i) && i < size), 'Scenario index outside this catalog');
  return indices.sort((a, b) => a - b);
}

export async function withMatrixPack(page, id, directory, measure) {
  // WebView profiles can share one native pack database. Hold this local OS
  // endpoint across setup, measurement and cleanup, including reuse of a pack.
  const lock = createServer(socket => socket.destroy());
  const endpoint = process.platform === 'win32' ? String.raw`\\.\pipe\skimmer-qa-world-pack` :
    path.join(tmpdir(), 'skimmer-qa-world-pack.sock');
  await new Promise((resolve, reject) => {
    lock.once('error', reject);
    lock.listen(endpoint, resolve);
  });
  try {
    return await measureWithPack(page, id, directory, measure);
  } finally {
    await new Promise((resolve, reject) => lock.close(error => error ? reject(error) : resolve()));
  }
}

async function measureWithPack(page, id, directory, measure) {
  const lookup = () => page.evaluate(async id =>
    (await window.__TAURI__.core.invoke('pack_list')).find(pack => pack.id === id) ?? null, id);
  const key = 'skimmer-scraper.active-pack';
  const previous = await page.evaluate(key => localStorage.getItem(key), key);
  const present = await lookup();
  let installing;
  let settled = false;
  let activated = false;
  try {
    const manifest = directory ? JSON.parse(await readFile(path.join(directory, 'world-pack.json'), 'utf8')) : null;
    if (manifest) {
      assert.equal(manifest.id, id, 'Pack manifest does not match the requested realm');
      if (present) assert.deepEqual(present, manifest, 'Installed native pack differs from the supplied pack; preserving it');
    }
    if (!present) {
      assert(manifest, 'Supply the native pack directory for the selected realm');
      await page.keyboard.press('g');
      const panel = page.locator('#world-packs');
      if (!await panel.evaluate(el => el.open)) await panel.locator(':scope > summary').click();
      assert.equal(await lookup(), null, 'Pack appeared before import; retry to reuse it');
      installing = manifest;
      await panel.locator('input[type=file]').setInputFiles(path.resolve(directory));
      await page.waitForFunction(() => {
        const input = document.querySelector('#world-packs input[type=file]');
        return input && !input.disabled && !input.files.length;
      }, null, { timeout: 180000 });
      settled = true;
      assert.deepEqual(await lookup(), manifest, 'Native import did not install the expected manifest');
    }
    activated = true;
    await page.evaluate(({key, id}) => localStorage.setItem(key, id), {key, id});
    return await measure({ id, preinstalled: !!present, manifest: present ?? installing });
  } finally {
    try {
      if (activated) await page.evaluate(({key, id, previous}) => {
        if (localStorage.getItem(key) !== id) return;
        if (previous === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous);
      }, {key, id, previous});
    } finally {
      if (installing) {
        const cancel = page.locator('#world-packs [data-pack-cancel]');
        if (!settled && await cancel.isVisible()) {
          await cancel.click();
          await cancel.waitFor({ state: 'hidden', timeout: 180000 });
        }
        const installed = await lookup();
        if (installed) {
          assert(isDeepStrictEqual(installed, installing), 'A different native pack now owns this ID; preserving it');
          await page.evaluate(id => window.__TAURI__.core.invoke('pack_remove', { id }), id);
        }
      }
    }
  }
}

export async function qualityMatrix(
  page,
  output,
  packDirectory,
  cityComparison = false,
  glideComparison = false,
  options = {},
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
      userAgent: navigator.userAgent,
      build: await (await fetch('./build-info.json')).json(),
    };
  });
  assert.match(device.renderer, /780M/);
  assert.equal(device.build.dirty, false);
  let session;
  const taskSeconds = async () => {
    const { metrics } = await session.send('Performance.getMetrics');
    return metrics.find(metric => metric.name === 'TaskDuration').value;
  };
  const [major, minor] = device.build.version.split('.').map(Number);
  const expanded = (major > 0 || minor >= 9) && !cityComparison;
  const realm = process.env.SKIMMER_QA_REALM ?? 'dragonspine';
  const scenarios = matrixScenarios({ expanded, cityComparison, glideComparison, realm });
  const indices = selectIndices(options.indices ?? process.env.SKIMMER_QA_INDICES, scenarios.length);
  const rows = [];
  const run = {
    id: randomUUID(), startedUtc: new Date().toISOString(), baseUrl: base.href,
    runnerSha256, sampling, requestedUrl: options.requestedUrl ?? base.href, profile: process.env.SKIMMER_QA_PROFILE === '1',
    catalogSize: scenarios.length, indices, indexBase: 0, viewport: [1920, 1080], deviceScaleFactor: 1,
    pair: options.pair ?? null, side: options.side ?? null, status: 'running',
  };
  const report = () => saveJson(output, { device, seed: 334458, method: matrixMethod, run, rows });
  // Refuse to replace an original measurement with a subset or a repeated attempt.
  if (options.pair || options.indices !== undefined || process.env.SKIMMER_QA_INDICES !== undefined) {
    await writeFile(output, '{}\n', { flag: 'wx' });
  }
  let current;
  try {
    await report();
    session = await page.context().newCDPSession(page);
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false,
    });
    await session.send('Performance.enable');
    const measure = async (nativePack = null) => {
      run.nativePack = nativePack;
      for (const scenarioIndex of indices) {
        const {theme, quality, count, voice, music, glide} = scenarios[scenarioIndex];
        current = { scenarioIndex, ...scenarios[scenarioIndex], status: 'running' };
        rows.push(current);
        await report();
        const url = new URL(base);
        if (run.profile) url.searchParams.set('profile','flight');
        url.searchParams.set('seed', '334458');
        url.searchParams.set('gen', glide === undefined ? '4' : '2');
        if (theme !== 'city') url.searchParams.set('theme', theme);
        const pose = glide !== undefined ? {x:0,y:6,z:34} : theme === 'worldforge' ? {x:0,y:132,z:120} :
          theme === 'dragonspine' && expanded && device.native ? {x:420,y:555,z:-940} :
          theme === 'dragon' ? {x:-100,y:290,z:-440} : {x:340,y:410,z:125};
        const heldKeys = glide !== undefined ? [] : theme === 'worldforge' ? ['Shift'] : ['Shift', 'q'];
        current.route = { url: url.href, pose, yaw: 0, pitch: 0, roll: 0, heldKeys, pressSpace: glide === true };
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
        if (expanded) await page.locator('#bgm-enabled').evaluate((control, requested) => {
          if (control.checked !== requested) control.click();
        }, music);
        const qualityLabel = await page.locator('#quality-button').textContent();
        if (/高|high/i.test(qualityLabel) !== (quality === 'high'))
          await page.locator('#quality-button').evaluate((b) => b.click());
        await page.locator('#start-button').click();
        await page.waitForFunction(
          () => window.__SKIMMER_SCRAPER__.snapshot().runTime > 1,
        );
        await page.evaluate(async pose => {
          const g = window.__SKIMMER_SCRAPER__;
          g.pause();
          await g.setPose(pose, { yaw: 0, pitch: 0, roll: 0 });
          g.resume();
        }, pose);
        if (glide) await page.keyboard.press('Space');
        for (const key of heldKeys) await page.keyboard.down(key);
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
          const longTasks=[];
          const observer=new PerformanceObserver(list=>{
            for(const task of list.getEntries()) longTasks.push({start:task.startTime,duration:task.duration});
          });
          observer.observe({type:'longtask'});
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
          for(const task of observer.takeRecords()) longTasks.push({start:task.startTime,duration:task.duration});
          observer.disconnect();
          return {
            longTasks, cpuAtStart:start.cpuTimings, cpuAtEnd:end.cpuTimings,
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
        Object.assign(current, { rendererTaskMsPerFrame, ...result });
        assert.equal(result.mode, 'running');
        assert.equal(result.companions, count);
        assert.ok(result.elapsedSimulation > 0);
        assert.equal(!!result.detail, theme === realm);
        if (expanded) {
          assert.equal(/高|high/i.test(result.qualityLabel), quality === 'high', 'Requested quality was not active');
          assert.equal(result.audio.music.enabled, music, 'Requested music setting was not active');
          assert.equal(result.audio.voice, voice ? 'local' : 'off', 'Requested voice setting was not active');
        }
        if (glide !== undefined) {
          assert.equal(result.shieldImpacts, 0);
          const phase = glide ? 'GLIDING' : 'FLIGHT';
          assert(result.samples.slice(1).every(s => s.glidePhase === phase), 'Matched ground flight lost its intended state');
        }
        current.status = 'passed';
        await report();
        current = undefined;
        console.log(scenarioIndex, theme, quality, count, result.averageFps.toFixed(1));
      }
    };
    if (options.pair) assert.equal(scenarios.length, 35, 'The selected build does not implement the expanded matrix');
    if (device.native && indices.some(index => scenarios[index].theme === realm)) {
      await withMatrixPack(page, realm === 'dragon' ? 'dragonspine-high-1' : 'ascendant-high-2-334458', packDirectory, measure);
    } else await measure();
    run.status = 'passed';
  } catch (error) {
    run.status = 'failed';
    run.error = String(error);
    if (current) Object.assign(current, { status: 'failed', error: run.error });
    throw error;
  } finally {
    run.finishedUtc = new Date().toISOString();
    try {
      await report();
    } finally {
      try {
        await page.keyboard.up('q');
        await page.keyboard.up('Shift');
      } finally {
        await session?.detach();
      }
    }
  }
}
// Both URLs are driven by this checkout. Each side uses a fresh Edge process/profile.
async function runWeb(url, output, mode, options) {
  const browser = await chromium.launch({
    channel: 'msedge', headless: false, args: ['--use-angle=d3d11', '--disable-software-rasterizer'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__);
    await qualityMatrix(page, output, undefined, mode === 'city-comparison', mode === 'glide-comparison', options);
  } finally {
    await browser.close();
  }
}

export async function pairedMatrix(baseline, candidate, directory, indices, pairs, measure = runWeb) {
  assert(Number.isSafeInteger(pairs) && pairs > 0, 'Specify a fixed positive --pairs count');
  assert(indices !== undefined, 'Select explicit --indices');
  // Both supported SHIFT comparison clients use the 35-row expanded catalog.
  const realm = process.env.SKIMMER_QA_REALM ?? 'dragonspine';
  const catalog = matrixScenarios({ expanded: true, realm });
  const selected = selectIndices(indices, catalog.length);
  const urls = { baseline: new URL(baseline).href, candidate: new URL(candidate).href };
  assert.notEqual(urls.baseline, urls.candidate, 'The two build URLs must differ');
  const manifest = {
    schema: 1, urls, seed: 334458, method: matrixMethod, sampling, runnerSha256, realm,
    profile: process.env.SKIMMER_QA_PROFILE === '1', pairs, indexBase: 0, indices: selected,
    catalogSize: catalog.length, scenarios: selected.map(index => ({ scenarioIndex: index, ...catalog[index] })),
    order: 'Alternating AB/BA by pair, selected rows in original catalog order, fresh Edge profile per side',
    attempts: [],
  };
  for (let pair = 1; pair <= pairs; pair++) {
    const order = pair % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    for (const side of order) manifest.attempts.push({
      pair, side, file: `pair-${pair}-${side}.json`, status: 'pending',
    });
  }
  await mkdir(directory); // Exclusive destination. Preserve every earlier campaign.
  const file = path.join(directory, 'paired-reruns.json');
  await saveJson(file, manifest);
  for (const attempt of manifest.attempts) {
    const { pair, side } = attempt;
    attempt.status = 'running';
    attempt.startedUtc = new Date().toISOString();
    await saveJson(file, manifest);
    try {
      await measure(urls[side], path.join(directory, attempt.file), undefined, { indices, pair, side, requestedUrl: urls[side] });
      attempt.status = 'passed';
    } catch (error) {
      attempt.status = 'failed';
      attempt.error = String(error);
    }
    attempt.finishedUtc = new Date().toISOString();
    await saveJson(file, manifest);
  }
  assert(manifest.attempts.every(a => a.status === 'passed'), 'Incomplete paired rerun; inspect paired-reruns.json');
}

const usage = `Usage (run from the v0.9.1 checkout)
  node scripts/realm-quality-matrix.mjs URL OUTPUT.json [city-comparison|glide-comparison] [--indices 0,3]
  node scripts/realm-quality-matrix.mjs paired BASELINE_URL CANDIDATE_URL NEW_DIRECTORY --indices 0,3 --pairs 2

Indices are zero-based original row positions. A full 0.9.x web matrix contains 35 rows.
Paired mode fixes the count in advance, alternates version order and retains failures.
For a native desktop-smoke matrix, SKIMMER_QA_INDICES selects rows in the same way.
Supply the high pack directory when a selected native realm has no installed pack.
Compare the originals and repeats using scripts/compare-flight-matrices.py --help.`;

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { indices: { type: 'string' }, pairs: { type: 'string' }, help: { type: 'boolean' } },
  });
  if (values.help) console.log(usage);
  else if (positionals[0] === 'paired') {
    assert.equal(positionals.length, 4, usage);
    await pairedMatrix(positionals[1], positionals[2], positionals[3], values.indices, Number(values.pairs));
  } else {
    const [url, output, mode] = positionals;
    assert(url && output && positionals.length <= 3 && !values.pairs &&
      (!mode || ['city-comparison', 'glide-comparison'].includes(mode)), usage);
    await runWeb(url, output, mode, { indices: values.indices });
  }
}
