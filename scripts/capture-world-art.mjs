import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [origin, genArg, name] = process.argv.slice(2);
const gen = Number(genArg);
assert([3,4].includes(gen) && /^[a-z0-9-]+$/.test(name));
const dir = 'evidence/v0.7/' + name;
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
const errors=[], records=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  // Freeze only the RAF timestamp while framing a shot. Resource loading keeps running.
  await page.addInitScript(()=>{
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=cb=>raf(t=>cb(window.reviewFrame ?? t));
  });
  await page.goto(new URL('?seed=334458&gen='+gen,origin).href);
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready);
  const capture=async(label)=>{
    await page.waitForFunction(()=>{
      const s=window.__SKIMMER_SCRAPER__.snapshot().streaming;
      return !s.queuedChunks && !s.generatingChunks;
    },null,{timeout:60000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:dir+'/'+label+'.jpg',quality:86});
    const record=await page.evaluate(()=>{
      const s=window.__SKIMMER_SCRAPER__.snapshot();
      return {world:s.journey.worldIndex,gen:s.generatorVersion, position:s.position,camera:s.cameraPosition,
        quaternion:s.cameraOrientation,mode:s.cameraMode,stream:s.streaming,stats:s.world,frame:s.render};
    });
    assert.equal(record.gen,gen);
    records.push({label,...record});
  };
  await page.evaluate(()=>{window.reviewFrame=4000;});
  await capture('title');
  await page.evaluate(()=>{delete window.reviewFrame;});
  await page.locator('#start-button').click();
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
  const pose=async(label,x,y,z,yaw,pitch,mode='chase')=>{
    await page.evaluate(async ({x,y,z,yaw,pitch,mode})=>{
      const g=window.__SKIMMER_SCRAPER__;
      g.setCameraMode(mode);
      // Let one frame consume the timestamp before taking the measurement pose.
      window.reviewFrame=performance.now();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      await g.setPose({x,y,z},{yaw,pitch,roll:0});
    },{x,y,z,yaw,pitch,mode});
    await capture(label);
  };
  await pose('canyon',110,31,40,0,.14);
  await pose('bridges',110,42,60,.28,.31);
  await pose('floating-garden',352,379,415,.12,-.21);
  await pose('moving-station',220,296,310,0,.04);
  await pose('inverted',0,286,120,0,1.13);
  await pose('dusk',112,194,110,.66,-.14);
  await pose('chase',0,26,100,0,.05);
  await pose('cockpit',0,26,100,0,.05,'cockpit');
  for(let world=1;world<=5;world++){
    await page.evaluate(async()=>{
      delete window.reviewFrame;
      const g=window.__SKIMMER_SCRAPER__;
      g.pause();
      await g.setPose({x:0,y:519,z:120},{pitch:1.15,yaw:0,roll:0});
      g.resume();
      await g.advance(5);
    });
    await page.waitForFunction(n=>window.__SKIMMER_SCRAPER__.snapshot().journey.worldIndex===n,world);
    await pose('world-'+world,110,114,120,.24,-.05);
  }
  assert.deepEqual(errors,[]);
  writeFileSync('acceptance/v0.7/'+name+'.json',JSON.stringify({seed:334458,browser:browser.version(),records,errors},null,2)+'\n');
} finally {await browser.close();}

