import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { collectFlight } from './streaming-flight-sample.mjs';

const [origin, suite='matrix', version='4'] = process.argv.slice(2);
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const output='acceptance/v0.7/gpu';
mkdirSync(output,{recursive:true});
const scenarios = suite==='soak' ? [[3,'balanced',1,905]] : suite==='voice' ? [[3,'high',1,44]]
  : [...[0,1,2,3].flatMap(count=>['balanced','high'].map(quality=>[count,quality,1,44])),[3,'balanced',4,44],[3,'balanced',4,14]];
const browser = await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=d3d11',
  '--disable-software-rasterizer','--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows','--enable-precise-memory-info']});
try{
  for(const [count,quality,rate,seconds] of scenarios){
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.addInitScript(count=>{
      localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count}));
      localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free',shield:true}));
    },count);
    await page.goto(new URL('?gen='+version+'&seed=334458',origin).href);
    await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready);
    await page.locator('#start-button').click();
    await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().mode==='running');
    if(quality==='high' || suite==='voice'){
      await page.keyboard.press('f');
      await page.locator('#advanced-flight-settings > summary').click();
      if(quality==='high'){
        await page.locator('#comfort-settings > summary').click();
        await page.locator('#quality-button').click();
      }
      if(suite==='voice'){
        await page.locator('.voice-settings > summary').click();
        await page.locator('#voice-output').selectOption('high-quality');
        await page.waitForFunction(()=>['ready','error'].includes(window.__SKIMMER_SCRAPER__.snapshot().voice.kokoro?.phase),null,{timeout:240000});
      }
      await page.locator('#rules-close').click();
    }
    const env=await page.evaluate(async()=>{
      const gl=document.querySelector('canvas').getContext('webgl2');
      return {renderer:gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),
        viewport:[innerWidth,innerHeight],build:await (await fetch('build-info.json')).json()};
    });
    assert(/Radeon.*780M/.test(env.renderer));
    if(rate>1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate});
    const result=await collectFlight(page,{seconds,altitude:410,cold:seconds===14});
    const state=await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot());
    const {samples,...measurement}=result;
    const ranges=Object.fromEntries(['drawCalls','triangles','renderGeometries','textures','jsHeap'].map(key=>{
      const values=samples.map(s=>s[key]);return [key,[Math.min(...values),Math.max(...values)]];
    }));
    const record={environment:env,browser:browser.version(),quality,gen:version,companions:count,cpuThrottle:rate,
      ...measurement,ranges,errors,voice:state.voice, samples:samples.filter((_,i)=>i%Math.max(1,Math.floor(samples.length/60))===0)};
    const path=output+'/'+[suite,'gen'+version,quality,count,rate,seconds].join('-')+'.json';
    writeFileSync(path,JSON.stringify(record,null,2)+'\n');
    console.log(JSON.stringify({path,fps:result.fps,frameMs:result.frameMs,incomplete:result.incompleteFrames,frames:result.visibleFrames}));
    if (suite === 'voice') {
      assert(state.voice.kokoro?.generated > 0 && state.voice.kokoro?.completed > 0,
        'A WebGPU Kokoro line must be generated and played during hardware acceptance');
    }
    assert.equal(state.generatorVersion,Number(version));
    assert.equal(result.mode,'running'); assert.equal(result.end.deployed,count);
    assert(result.end.elapsed>=seconds && result.distanceTraveled>seconds*45);
    assert.deepEqual(errors,[]);
    await page.close();
  }
}finally{await browser.close();}

