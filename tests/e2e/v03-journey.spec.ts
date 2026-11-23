import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('five valid sky crossings exchange worlds, preserve the team and unlock the original fifth-sky signature',async({page})=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'challenge'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:3,behavior:'lead'}));});
 await page.goto('/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
 const initial=await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.advance(2.2));const worlds=[];
 expect(initial.cooperation.trust.events.some(e=>e.event==='accepted-lead')).toBe(true);
 for(let index=1;index<=5;index++){
  const result=await page.evaluate(async(index)=>{
   const g=window.__SKIMMER_SCRAPER__!;g.pause();await g.setPose({x:0,y:519,z:120},{pitch:1.15});g.resume();
   const before=g.snapshot();let after=await g.advance(5);
   if(after.journey.crossings<index)after=await g.advance(3);
   return{before,after};
  },index);
  expect(result.after.mode).toBe('running');expect(result.after.journey.crossings).toBe(index);expect(result.after.journey.worldIndex).toBe(index);
  expect(result.after.companions).toHaveLength(3);expect(result.after.companions.every(a=>a.deployed&&!a.uncovered)).toBe(true);
  expect(result.after.cooperation.relay.charges).toBe(result.before.cooperation.relay.charges);
  expect(result.after.cooperation.trust.events[0]).toEqual(initial.cooperation.trust.events[0]);
  expect(result.after.worldReleases.every(r=>r.bvhAfter===0&&r.rootChildrenAfter===0)).toBe(true);
  expect(result.after.streaming!.bvhCount).toBeLessThanOrEqual(41);expect(result.after.failureReason).toBeNull();
  expect(result.after.runTime-result.before.runTime).toBeLessThan(2);worlds.push(result);
  await page.screenshot({path:`evidence/v0.3/phase-5-world-${index}.png`});
 }
 const fifth=worlds.at(-1)!.after;expect(fifth.journey.easterEggUnlocked).toBe(true);expect(fifth.journey.easterEggTriggers).toBe(1);
 await expect(page.locator('#journey-easter-egg')).toBeVisible();await expect(page.locator('#journey-skip')).toHaveCount(0);
 expect(new Set(worlds.map(w=>w.after.seed)).size).toBe(5);
 await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.retry());const retry=await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.snapshot());
 expect(retry.journey.worldIndex).toBe(0);expect(retry.seed).toBe(initial.seed);expect(retry.cooperation.relay.charges).toBe(2);
 await page.reload();await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready);
 const refreshed=await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.snapshot());expect(refreshed.journey.easterEggUnlocked).toBe(true);expect(refreshed.journey.worldIndex).toBe(0);expect(errors).toEqual([]);
 writeFileSync('evidence/v0.3/phase-5-five-worlds.json',JSON.stringify({method:'Controlled browser approach at519m, then real fixed-step climbing through520m; full transition and physics, no direct world increment. Not a manual feel assessment or an FPS benchmark.',initial,worlds,retry,refreshed,errors},null,2));
});
for(const count of [1,2])test(`${count} companions survive a challenge crossing, skip, and a cancelled retry`,async({page})=>{
 test.setTimeout(180000);
 await page.emulateMedia({reducedMotion:count===1?'reduce':'no-preference'});
 await page.addInitScript(n=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'challenge',graceSeconds:5}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:n}));},count);
 await page.goto('/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
 const result=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__!;g.pause();await g.setPose({x:0,y:519,z:120},{pitch:1.15});g.resume();const entered=await g.advance(.7);await new Promise(r=>requestAnimationFrame(r));const rotation=g.snapshot().render.inversionAngle;g.skipJourney();const after=await g.advance(3);return{entered,rotation,after};});
 expect(result.entered.journey.active).toBe(true);expect(result.after.journey.crossings).toBe(1);expect(result.after.mode).toBe('running');expect(result.after.companions).toHaveLength(count);
 if(count===1)expect(result.rotation).toBe(0);else expect(result.rotation).toBeGreaterThan(0);
 const restart=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__!;g.pause();await g.setPose({x:0,y:519,z:120},{pitch:1.15});g.resume();await g.advance(.1);g.skipJourney();const pending=g.advance(2);await new Promise(r=>setTimeout(r,0));await g.retry();await pending;return g.snapshot();});
 expect(restart.journey.worldIndex).toBe(0);expect(restart.seed).toBe(334458);expect(restart.mode).toBe('running');expect(restart.streaming!.bvhCount).toBeLessThanOrEqual(41);
 expect(restart.runTime).toBeLessThan(.5);
 writeFileSync(`evidence/v0.3/phase-5-${count}-companions.json`,JSON.stringify({result,restart},null,2));
});
