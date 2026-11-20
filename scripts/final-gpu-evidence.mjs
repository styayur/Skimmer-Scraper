import {chromium} from '@playwright/test';
import {writeFileSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const url=process.env.SKIMMER_URL??'http://127.0.0.1:4174/?autostart=1&seed=334458';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
const results=[];
async function run(mode,count,seconds,soak=false){
 const context=await browser.newContext({viewport:{width:1920,height:1080}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({mode,count})=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count}));},{mode,count});
 await page.goto(url);await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running',null,{timeout:120000});
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');const cpuBefore=await cdp.send('Performance.getMetrics');
 const capture=page.evaluate(async seconds=>{
  const g=window.__SKIMMER_SCRAPER__;const before=g.snapshot();const frames=[],states=[],longTasks=[];const modes={};let moving=0,buffering=0,previousPosition=before.position;
  const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({startMs:e.startTime,durationMs:e.duration}))));observer.observe({type:'longtask',buffered:false});
  const start=performance.now();let previous=start;const peaks={chunks:0,bvh:0,drawCalls:0,triangles:0,geometries:0,textures:0};
  await new Promise(resolve=>{const tick=now=>{
   const s=g.snapshot();frames.push(now-previous);previous=now;modes[s.mode]=(modes[s.mode]??0)+1;
   if(s.buffering)buffering++;if(Math.hypot(s.position.x-previousPosition.x,s.position.y-previousPosition.y,s.position.z-previousPosition.z)>1e-6)moving++;previousPosition=s.position;
   for(const [key,value]of Object.entries({chunks:s.streaming.activeChunks,bvh:s.streaming.bvhCount,drawCalls:s.render.calls,triangles:s.render.triangles,geometries:s.render.geometries,textures:s.render.textures}))peaks[key]=Math.max(peaks[key],value);
   if(states.length===0||now-start>=states.length*1000)states.push({wallMs:now-start,mode:s.mode,runTime:s.runTime,journeyTime:s.journey.time,position:s.position,companions:s.companions,shieldImpacts:s.shieldImpacts,streaming:s.streaming,render:s.render,heap:performance.memory?.usedJSHeapSize??null});
   if(now-start>=seconds*1000)resolve();else requestAnimationFrame(tick);
  };requestAnimationFrame(tick);});
  observer.disconnect();const after=g.snapshot();const sorted=[...frames].sort((a,b)=>a-b);const p=q=>sorted[Math.floor((sorted.length-1)*q)];
  const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return{gpu:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent,before,after,states,frameCount:frames.length,averageFps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),maxFrameMs:Math.max(...frames),modes,movingFrames:moving,bufferingFrames:buffering,peaks,longTasks,wallSeconds:(performance.now()-start)/1000};
 },seconds);
 if(soak){
  await page.keyboard.down('Shift');
  for(let i=0;i<16;i++){
   await page.waitForTimeout(6500);const key=i%2?'d':'a';await page.keyboard.down(key);await page.waitForTimeout(220);await page.keyboard.up(key);
   if(i%4===0){await page.keyboard.down('w');await page.waitForTimeout(180);await page.keyboard.up('w');}
  }
  await page.keyboard.up('Shift');
 }
 const result=await capture;const cpuAfter=await cdp.send('Performance.getMetrics');
 const metric=(r,n)=>r.metrics.find(m=>m.name===n)?.value??0;
 result.mainThread={taskMs:(metric(cpuAfter,'TaskDuration')-metric(cpuBefore,'TaskDuration'))*1000,scriptMs:(metric(cpuAfter,'ScriptDuration')-metric(cpuBefore,'ScriptDuration'))*1000,layoutMs:(metric(cpuAfter,'LayoutDuration')-metric(cpuBefore,'LayoutDuration'))*1000,method:'CDP cumulative CPU metrics; not GPU execution time'};
 result.mode=mode;result.count=count;result.requestedSeconds=seconds;result.soak=soak;result.errors=errors;result.realHardware=/Radeon 780M/.test(result.gpu)&&!/SwiftShader|llvmpipe/i.test(result.gpu);result.viewport=[1920,1080];
 result.allFramesRunning=Object.keys(result.modes).every(m=>m==='running');result.testedAsset=await page.locator('script[type="module"]').getAttribute('src');
 result.assetSha256=createHash('sha256').update(readFileSync(`dist/${result.testedAsset.replace(/^\.\//,'')}`)).digest('hex');
 result.method=soak?'Actual120s boosted free flight, alternating bank inputs and periodic downward pitch; no debug advance or pause. Includes collision/streaming frames.':'Actual12s default-spawn straight flight, same seed334458 as v0.2 baseline; no debug advance, pose fixture or pause. Includes streaming and startup shader frames.';
 if(!result.realHardware||!result.allFramesRunning||result.errors.length||result.movingFrames<result.frameCount*.5)process.exitCode=2;
 if(soak){await page.screenshot({path:'evidence/v0.3/phase-6-soak.png'});writeFileSync('evidence/v0.3/phase-6-soak.json',JSON.stringify(result,null,2));}
 console.log(JSON.stringify({mode,count,soak,realHardware:result.realHardware,averageFps:result.averageFps,p95Ms:result.p95Ms,p99Ms:result.p99Ms,maxFrameMs:result.maxFrameMs,allFramesRunning:result.allFramesRunning,moving:result.movingFrames,frames:result.frameCount,peaks:result.peaks,shieldImpacts:result.after.shieldImpacts,errors}));
 await context.close();return result;
}
try{
 for(const mode of ['challenge','free'])for(const count of [0,1,2,3])results.push(await run(mode,count,12));
 writeFileSync('evidence/v0.3/phase-6-gpu-matrix.json',JSON.stringify({method:'Sequential isolated real-GPU scenarios, models disconnected. CI rendering is excluded.',results},null,2));
 await run('free',3,120,true);
}finally{await browser.close();}
