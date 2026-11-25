import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [base, output] = process.argv.slice(2);
await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:false,
  args:['--use-angle=d3d11','--disable-software-rasterizer']});
try {
  const page = await browser.newPage({viewport:{width:1920,height:1080}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => {if(e.type()==='error') errors.push(e.text());});
  const url = new URL(base);
  url.search = '?theme=dragonspine&gen=4&seed=334458&debug=1';
  await page.goto(url.href);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().dynamicStructures.some(x=>x.id==='crownback'));
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  });
  assert.match(gpu,/780M/);
  const samples = [];
  for (const [label, distance, altitude, lateral, seconds] of [
    ['silhouette',820,35,0,0],['chase',330,42,0,2],['underwing',165,-22,60,1.7],
    ['downstroke',165,-22,60,2.4],['glide',165,-22,60,2.2],
  ]) {
    const sample = await page.evaluate(async ({distance,altitude,lateral,seconds}) => {
      const g = window.__SKIMMER_SCRAPER__;
      g.resume();
      if (seconds) await g.advance(seconds,{holdPosition:true});
      const dragon = g.snapshot().dynamicStructures.find(s=>s.id==='crownback');
      await g.setPose({x:dragon.position.x+lateral,y:dragon.position.y+altitude,z:dragon.position.z+distance},
        {yaw:0,pitch:-Math.atan2(altitude,distance),roll:0});
      await new Promise(requestAnimationFrame);
      const state=g.snapshot();
      return {dragon,position:state.position,origin:state.renderOrigin,mode:state.mode,
        render:state.render,buffering:state.buffering};
    },{distance,altitude,lateral,seconds});
    const file=label+'.jpg';
    await page.screenshot({path:path.join(output,file),quality:87});
    samples.push({label,file,...sample});
  }
  assert(samples.every(x=>!x.buffering && x.mode==='running'));
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(path.join(output,'flight.json'),JSON.stringify({gpu,viewport:[1920,1080],seed:334458,samples,errors},null,2));
} finally { await browser.close(); }
