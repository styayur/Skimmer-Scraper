import {chromium} from '@playwright/test';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const prefix=process.env.EVIDENCE_PREFIX??'phase-5';
const browser=await chromium.launch({channel:process.env.BENCHMARK_CHANNEL??'chrome',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:3}));});
 await page.goto(process.env.SKIMMER_URL??'http://127.0.0.1:4174/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running',null,{timeout:120000});
 await page.evaluate(()=>{
  window.journeyCapture={frames:[],resources:[],longTasks:[],stages:[],active:true,last:null,lastSample:0};
  const c=window.journeyCapture;c.observer=new PerformanceObserver(list=>c.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));c.observer.observe({type:'longtask',buffered:false});
  const tick=now=>{
   if(!c.active)return;const s=window.__SKIMMER_SCRAPER__.snapshot();
   if(s.mode==='running'){
    if(c.last!==null)c.frames.push(now-c.last);c.last=now;
    if(!c.stages.includes(s.journey.phase))c.stages.push(s.journey.phase);
    if(now-c.lastSample>200){c.resources.push({time:now,world:s.journey.worldIndex,phase:s.journey.phase,chunks:s.streaming?.activeChunks??0,bvh:s.streaming?.bvhCount??0,render:s.render,runTime:s.runTime,journeyTime:s.journey.history.at(-1)?.time??0});c.lastSample=now;}
   }else c.last=null;
   requestAnimationFrame(tick);
  };requestAnimationFrame(tick);
 });
 const worlds=[];
 for(let index=1;index<=5;index++){
  await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;g.pause();await g.setPose({x:0,y:519,z:120},{pitch:1.15});g.resume();});
  await page.keyboard.down('s');await page.keyboard.down('Shift');
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().journey.active,null,{timeout:15000});await page.keyboard.up('s');await page.keyboard.up('Shift');
  await page.waitForFunction(i=>window.__SKIMMER_SCRAPER__.snapshot().journey.crossings===i,index,{timeout:60000});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  worlds.push(await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot()));
  await page.screenshot({path:`evidence/v0.3/${prefix}-real-world-${index}.png`});
 }
 const result=await page.evaluate(()=>{
  const c=window.journeyCapture;c.active=false;c.observer.disconnect();
  const sorted=[...c.frames].sort((a,b)=>a-b);const p=q=>sorted[Math.floor((sorted.length-1)*q)];
  const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return{gpu:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent,frames:c.frames.length,averageFps:1000/(c.frames.reduce((a,b)=>a+b,0)/c.frames.length),p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),maxFrameMs:Math.max(...c.frames),stages:c.stages,resources:c.resources,longTasks:c.longTasks};
 });
 result.worlds=worlds;result.errors=errors;result.viewport=[1920,1080];result.realHardware=/Radeon 780M/.test(result.gpu)&&!/SwiftShader/i.test(result.gpu);
 result.testedAsset=await page.locator('script[type="module"]').getAttribute('src');
 if(result.testedAsset?.startsWith('./assets/'))result.assetSha256=createHash('sha256').update(readFileSync(`dist/${result.testedAsset.slice(2)}`)).digest('hex');
 result.method='Actual running rAF flight and five transitions on real GPU. Paused fixture approach519m excluded from frame samples; actual climb crosses520m. Long-task capture includes fixture setup. No debug time advance; no model key or inference.';
 writeFileSync(`evidence/v0.3/${prefix}-real-gpu.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({gpu:result.gpu,realHardware:result.realHardware,averageFps:result.averageFps,p95Ms:result.p95Ms,p99Ms:result.p99Ms,maxFrameMs:result.maxFrameMs,stages:result.stages,worlds:worlds.map(s=>({index:s.journey.worldIndex,crossings:s.journey.crossings,seed:s.seed,companions:s.companions.length,bvh:s.streaming.bvhCount,releases:s.worldReleases,trust:s.cooperation.trust.value})),errors}));
}finally{await browser.close();}
