import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { chromium } from '@playwright/test';
import { collectFlight } from './streaming-flight-sample.mjs';

const [base, output, duration = '45'] = process.argv.slice(2);
const seconds = Number(duration);
if (!base || !output || !Number.isFinite(seconds) || seconds <= 0) throw Error('Pass a preview URL, new report path and duration in seconds.');
const browser = await chromium.launch({channel:'chromium', headless:true,
  args:['--enable-gpu','--use-angle=d3d11','--disable-software-rasterizer']});
try {
  const page = await browser.newPage({viewport:{width:1280,height:720}, deviceScaleFactor:1});
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  const build = await (await page.request.get(new URL('build-info.json',base).href)).json();
  const started = performance.now();
  const url = new URL('?theme=kinetic-city&seed=334458&gen=4&world=stable&autostart=1',base);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running',null,{timeout:90000});
  const loadMs = performance.now() - started;
  const environment = await page.evaluate(() => {
    const gl = document.querySelector('#game-canvas').getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL), browser:navigator.userAgent,
      viewport:[innerWidth,innerHeight], devicePixelRatio, visibility:document.visibilityState};
  });
  assert.ok(environment.renderer && !/swiftshader|llvmpipe|software|basic render/i.test(environment.renderer));
  // The generic cold staging coordinate is a corner lot. Start above its highest possible tower.
  const altitude = 265;
  const sample = await collectFlight(page,{seconds,altitude,cold:true});
  assert.equal(sample.mode,'running');
  assert.ok(sample.collisionCellEntries >= Math.min(3, Math.floor(seconds/4)), 'Flight did not traverse the streaming grid');
  const state = await page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot());
  const result = {build,environment:{...environment,os:platform()+' '+release(),driver:process.env.GPU_DRIVER ?? null},
    method:'Fresh headless Chromium profile, hardware ANGLE D3D11, 1280 × 720. Cold relocation and real-time throttle/bank inputs from streaming-flight-sample.mjs. Durations and percentiles include snapshot instrumentation.',
    route:{theme:'kinetic-city',seed:334458,mode:'stable',altitude,requestedFlightSeconds:seconds},
    navigationToRunningMs:loadMs, ...sample, endStreaming:state.streaming, world:state.world, companions:state.companions.length,
    music:state.music, errors};
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({frameMs:sample.frameMs,fps:sample.fps,buffering:sample.bufferingMs,
    distance:sample.distanceTraveled,renderer:environment.renderer}));
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
