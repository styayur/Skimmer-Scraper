import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const prefix=process.env.EVIDENCE_PREFIX??'phase-5';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:3}));});
 await page.goto('http://127.0.0.1:4174/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running',null,{timeout:120000});
 const cdp=await page.context().newCDPSession(page);const samples=[];
 const sample=async label=>{
  await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;g.pause();await g.setPose({x:0,y:24,z:120});});
  await page.waitForFunction(()=>{const s=window.__SKIMMER_SCRAPER__.snapshot().streaming;return s.queuedChunks===0&&s.generatingChunks===0;},null,{timeout:120000});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');const dom=await cdp.send('Memory.getDOMCounters');const state=await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot());samples.push({label,heap,dom,state});
 };
 await sample('initial-base-city');
 for(let cycle=1;cycle<=3;cycle++){
  for(let world=1;world<=5;world++){
   const s=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;g.pause();await g.setPose({x:0,y:519,z:120},{pitch:1.15});g.resume();return await g.advance(5);});
   if(s.journey.crossings!==world||s.mode!=='running')throw Error('Memory flight fixture did not cross');
  }
  await page.evaluate(()=>window.__SKIMMER_SCRAPER__.retry());await sample(`after-${cycle*5}-world-exchanges-and-base-restore`);
 }
 const result={method:'Three accelerated five-world journeys with actual browser/WebGL resources, normalized to the same base seed/spawn/settled chunks and forced CDP GC. Not an FPS benchmark or a guarantee of indefinite leak freedom.',samples,errors,testedAsset:await page.locator('script[type="module"]').getAttribute('src')};
 writeFileSync(`evidence/v0.3/${prefix}-memory.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({asset:result.testedAsset,samples:samples.map(s=>({label:s.label,heap:s.heap,dom:s.dom,geometries:s.state.render.geometries,textures:s.state.render.textures,bvh:s.state.streaming.bvhCount,releases:s.state.worldReleases.length})),errors}));
}finally{await browser.close();}
