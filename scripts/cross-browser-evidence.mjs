import {chromium,firefox} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const results=[];
for(const name of ['edge','firefox']){
 let browser;const errors=[];
 try{
  browser=name==='edge'?await chromium.launch({channel:'msedge',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']}):await firefox.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  const count=name==='edge'?1:2;const mode=name==='edge'?'challenge':'free';
  await page.addInitScript(({count,mode})=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count,behavior:'lead'}));},{count,mode});
  await page.goto('http://127.0.0.1:4174/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running',null,{timeout:120000});
  const initial=await page.evaluate(()=>window.__SKIMMER_SCRAPER__.advance(2.2));const worlds=[];
  for(let index=1;index<=5;index++){
   const s=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;g.pause();await g.setPose({x:0,y:519,z:120},{pitch:1.15});g.resume();return await g.advance(5);});
   worlds.push(s);if(s.mode!=='running'||s.journey.crossings!==index||s.companions.length!==count||s.streaming.bvhCount>41)throw Error('Journey compatibility assertion failed');
  }
  const fifth=worlds.at(-1);await page.screenshot({path:`evidence/v0.3/phase-6-${name}.png`});
  const views=[];for(const view of ['chase','cockpit'])views.push(await page.evaluate(v=>window.__SKIMMER_SCRAPER__.setCameraMode(v),view));
  const restored=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;await g.title();return g.snapshot();});
  if(restored.journey.worldIndex!==0||restored.mode!=='title'||!fifth.journey.easterEggUnlocked||errors.length)throw Error('Restore or lifecycle assertion failed');
  results.push({name,count,mode,status:'passed',initial,worlds,views,restored,errors,userAgent:await page.evaluate(()=>navigator.userAgent),method:'Fixed-time browser compatibility, 519m approach fixture and valid climbing; not an FPS or manual experience assessment.'});
 }catch(error){results.push({name,status:'failed',error:String(error),errors});}finally{await browser?.close();}
}
writeFileSync('evidence/v0.3/phase-6-cross-browser.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({name:r.name,count:r.count,mode:r.mode,status:r.status,crossings:r.worlds?.at(-1).journey.crossings,trustBefore:r.initial?.cooperation.trust.value,trustAfter:r.worlds?.at(-1).cooperation.trust.value,error:r.error,errors:r.errors}))));


if(results.some(r=>r.status!=="passed"))process.exitCode=2;
