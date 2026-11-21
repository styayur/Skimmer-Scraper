import { chromium, firefox } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const results=[];
for(const name of ['chrome','edge','firefox']){
 let browser; const errors=[];
 try{
  browser=name==='firefox'?await firefox.launch({headless:true}):await chromium.launch({channel:name==='edge'?'msedge':'chrome',headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));const external=[];page.on('request',r=>{if(!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))external.push(new URL(r.url()).hostname);});
  const ready=async()=>{await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready,null,{timeout:120000});await page.waitForFunction(()=>{const s=window.__SKIMMER_SCRAPER__.snapshot().streaming;return s.queuedChunks===0&&s.generatingChunks===0;},null,{timeout:120000});};
  await page.goto('http://127.0.0.1:4176/Skimmer-Scraper/?seed=334458');await ready();const fingerprint=(await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot())).worldFingerprint;
  await page.keyboard.press('m');await page.locator('#model-file').setInputFiles('tests/fixtures/test-aircraft.glb');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().localModelCount===1);await page.locator('#library-close').click();
  await page.evaluate(async()=>{const game=window.__SKIMMER_SCRAPER__;await game.start();game.setCameraMode('cockpit');await game.setPose({x:0,y:500,z:0});await game.advance(5.2,{holdPosition:true});});
  const legacy=await page.evaluate(()=>({snapshot:window.__SKIMMER_SCRAPER__.snapshot(),storage:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('.best.')))}));assert.equal(legacy.snapshot.mode,'failed');assert(legacy.snapshot.best>=5);
  await page.goto('http://127.0.0.1:4176/candidate/?seed=334458');await ready();const legacyLifecycleErrors=errors.splice(0);const next=await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot());assert.equal(next.selectedAircraft,legacy.snapshot.selectedAircraft);assert.equal(next.localModelCount,1);assert.equal(next.best,legacy.snapshot.best);assert.equal(next.cameraMode,'cockpit');assert.equal(next.worldFingerprint,fingerprint);
  await page.keyboard.press('f');await page.locator('#run-mode').selectOption('free');await page.locator('#advanced-flight-settings > summary').click();await page.locator('#run-grace').fill('7.3');await page.locator('#run-grace').dispatchEvent('change');
  await page.locator('#rules-panel summary').filter({hasText:'操控与手柄'}).click();await page.locator('[data-control="profile"]').selectOption('classic');await page.locator('[data-control="invertPitch"]').check();
  await page.locator('#camera-anchor-settings > summary').click();await page.locator('#anchor-preset').selectOption('custom');await page.locator('#anchor-y').fill('1.2');await page.locator('#anchor-save').click();await page.locator('#rules-close').click();
  await page.reload();await ready();await page.locator('#start-button').click();await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().mode==='running');
  const final=await page.evaluate(()=>({snapshot:window.__SKIMMER_SCRAPER__.snapshot(),controls:JSON.parse(localStorage.getItem('skimmer-scraper.controls.v3')),anchors:JSON.parse(localStorage.getItem('skimmer-scraper.camera-anchors.v3')),storage:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('.best.')))}));assert.equal(final.snapshot.rules.mode,'free');assert.equal(final.snapshot.rules.graceSeconds,7.3);assert.equal(final.controls.profile,'classic');assert.equal(final.controls.invertPitch,true);assert.equal(final.anchors[legacy.snapshot.selectedAircraft].y,1.2);assert.deepEqual(final.storage,legacy.storage);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  await page.keyboard.press('Escape');await page.locator('#pause-menu').click();await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().mode==='title');
  results.push({browser:name,status:'passed',legacyBest:legacy.snapshot.best,seedFingerprint:fingerprint,indexedDbModelPreserved:true,standardScorePreserved:true,rulesControlsAnchorPersisted:true,subpathReload:true,pauseMenu:true,externalRequests:external,legacyLifecycleErrors,errors});
 }catch(e){results.push({browser:name,status:'failed',error:String(e),errors});}finally{await browser?.close();}
}
writeFileSync('evidence/v0.3/phase-6-migration.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));if(results.some(r=>r.status!=='passed'))process.exitCode=2;

