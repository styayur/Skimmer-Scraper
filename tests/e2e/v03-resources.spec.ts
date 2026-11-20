import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('repeated journeys release shadow-map texture references at the same normalized base view',async({page})=>{
 test.setTimeout(300000);
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:3}));});
 await page.goto('/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
 const samples=[];
 for(let cycle=0;cycle<2;cycle++){
  for(let index=1;index<=5;index++){
   const s=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__!;g.pause();await g.setPose({x:0,y:519,z:120},{pitch:1.15});g.resume();return g.advance(5);});
   expect(s.journey.crossings).toBe(index);expect(s.mode).toBe('running');
  }
  await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__!;await g.retry();g.pause();await g.setPose({x:0,y:24,z:120});});
  await page.waitForFunction(()=>{const s=window.__SKIMMER_SCRAPER__!.snapshot().streaming!;return s.queuedChunks===0&&s.generatingChunks===0;});
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  samples.push(await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.snapshot()));
 }
 expect(samples[1].render.textures).toBe(samples[0].render.textures);
 expect(samples[1].render.geometries).toBe(samples[0].render.geometries);
 expect(samples[1].streaming!.bvhCount).toBe(samples[0].streaming!.bvhCount);
 expect(samples[1].worldReleases.every(r=>r.bvhAfter===0&&r.rootChildrenAfter===0)).toBe(true);
 writeFileSync('evidence/v0.3/phase-5-resource-regression.json',JSON.stringify({method:'Two five-world journeys, same base seed/spawn/camera and settled chunks; compare warm GPU allocations. Software-browser correctness, not a real-GPU FPS claim.',samples},null,2));
});
