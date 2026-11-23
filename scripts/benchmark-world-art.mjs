import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { collectFlight } from './streaming-flight-sample.mjs';

const [origin, suite='matrix', version='4'] = process.argv.slice(2);
assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const output='acceptance/v0.7/gpu';
mkdirSync(output,{recursive:true});
const scenarios = suite==='soak' ? [[3,'balanced',1,905]] : suite==='voice' ? [[3,'high',1,44]]
  : suite==='reference' ? [[3,'balanced',1,44],[3,'high',1,44],[3,'balanced',4,44],[3,'balanced',4,14]]
  : [...[0,1,2,3].flatMap(count=>['balanced','high'].map(quality=>[count,quality,1,44])),[3,'balanced',4,44],[3,'balanced',4,14]];
const proxy = suite === 'voice' && process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const browser = await chromium.launch({channel:'chrome',headless:false,
  ...(proxy ? {proxy:{server:proxy.origin,bypass:'localhost,127.0.0.1',
    username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password)}} : {}),
  args:['--use-angle=d3d11',
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
    let weightDigest = null;
    if (suite === 'voice' && process.env.SKIMMER_KOKORO_WEIGHTS) {
      const weights = process.env.SKIMMER_KOKORO_WEIGHTS;
      const server = createServer((request,response) => {
        if (request.url !== '/weights') { response.writeHead(404).end(); return; }
        response.writeHead(200,{'Access-Control-Allow-Origin':new URL(origin).origin,
          'Content-Type':'application/octet-stream','Content-Length':statSync(weights).size});
        createReadStream(weights).pipe(response);
      });
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      try {
      weightDigest = await page.evaluate(async url=>{
        const bytes = await (await fetch(url)).arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
        if (digest !== '165c7c730c7d75ef0b563f3af690eda32d385eb7386eb613f3b5e6fe02dcc60d') throw Error('Unexpected Kokoro model digest');
        const cache=await caches.open('skimmer-kokoro-zh-mixed-v1');
        await cache.put('https://huggingface.co/hsc666/Kokoro-82M-v1.1-zh-ONNX-webgpu/resolve/cf37b65bbce28544e5cecc6ab826b05548c590d8/onnx/model_fp16.onnx',
          new Response(bytes,{headers:{'Content-Length':String(bytes.byteLength)}}));
        return digest;
      }, 'http://127.0.0.1:'+server.address().port+'/weights');
      } finally { server.close(); }
    }
    if(quality==='high' || suite==='voice'){
      await page.keyboard.press('f');
      await page.locator('#advanced-flight-settings > summary').click();
      if(quality==='high'){
        await page.locator('#comfort-settings > summary').click();
        await page.locator('#quality-button').click();
        assert.match(await page.locator('#quality-button').innerText(), /高/);
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
    const exerciseRadio = async () => {
      if (suite !== 'voice') return;
      await page.waitForFunction(()=>Number.isFinite(window.flightSampleStart) &&
        window.__SKIMMER_SCRAPER__.snapshot().runTime > window.flightSampleStart + 5);
      await page.keyboard.press('t');
      await page.locator('#radio-input').fill('二号，你是谁？');
      await page.locator('#radio-input').press('Enter');
    };
    if (suite === 'voice') await page.evaluate(() => window.addEventListener('skimmer-flight-sample-start',
      event => { window.flightSampleStart = event.detail; }, { once: true }));
    const [result] = await Promise.all([collectFlight(page,{seconds,altitude:410,cold:seconds===14,allowRadioPause:suite==='voice'}),exerciseRadio()]);
    const state=await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot());
    const {samples,...measurement}=result;
    const ranges=Object.fromEntries(['drawCalls','triangles','renderGeometries','textures','jsHeap'].map(key=>{
      const values=samples.map(s=>s[key]);return [key,[Math.min(...values),Math.max(...values)]];
    }));
    const record={environment:env,browser:browser.version(),quality,gen:version,companions:count,cpuThrottle:rate,weightDigest,
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

