import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('BYOK validates real game state, executes a synthetic test response, forgets the key and falls back',async({page})=>{
 test.setTimeout(120000);
 const sentinel='test-only-not-a-real-key-34567';const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:3}));});
 await page.route('https://api.deepseek.com/chat/completions',async route=>{
   const body=route.request().postDataJSON();const perception=JSON.parse(body.messages[1].content);expect(JSON.stringify(body)).not.toContain(sentinel);
   const target=perception.targets.find((t:{kind:string})=>t.kind==='route');
   await route.fulfill({json:{choices:[{message:{content:JSON.stringify({requestId:perception.requestId,epoch:perception.epoch,ttl:12,risk:.25,formation:'spread',orders:[{agents:[1],action:target?'SCOUT':'FOLLOW',targetId:target?.id??null}],reason:'自动化合成响应'})}}],usage:{prompt_tokens:100,completion_tokens:60,total_tokens:160}}});
 });
 await page.goto('/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
 await page.locator('#rules-open').click();await page.locator('.model-settings summary').click();await page.locator('#ai-key').fill(sentinel);await page.locator('#ai-connect').click();expect(await page.locator('#ai-key').inputValue()).toBe('');await page.locator('#rules-close').click();
 await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__!.snapshot().cooperation.trace.some(t=>t.event==='execution'),null,{timeout:20000});
 const before=await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.snapshot());const after=await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.advance(2));expect(after.companions[0].position).not.toEqual(before.companions[0].position);
 const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},state:window.__SKIMMER_SCRAPER__!.snapshot()}));expect(JSON.stringify(stored)).not.toContain(sentinel);expect(after.cooperation.model.usage.total).toBe(160);
 await page.locator('#rules-open').click();await page.locator('#ai-disconnect').click();await page.locator('#rules-close').click();
 const disconnected=await page.evaluate(()=>window.__SKIMMER_SCRAPER__!.snapshot());expect(disconnected.cooperation.model.connected).toBe(false);expect(disconnected.cooperation.planner).toBe('Local Autonomous Controller');expect(errors).toEqual([]);
 writeFileSync('evidence/v0.3/phase-4-synthetic-browser.json',JSON.stringify({method:'Synthetic mocked response for boundary testing; NOT real model evidence',before,after,disconnected,errors},null,2));
 await page.screenshot({path:'evidence/v0.3/phase-4-browser.png'});
});

test('pause cancels an in-flight plan synchronously and rejects its late response',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:1}));});
 let release!:()=>void;let received=false;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('https://api.deepseek.com/chat/completions',async route=>{
  const p=JSON.parse(route.request().postDataJSON().messages[1].content);received=true;await gate;
  await route.fulfill({json:{choices:[{message:{content:JSON.stringify({requestId:p.requestId,epoch:p.epoch,ttl:10,risk:.2,formation:'line',orders:[{agents:[1],action:'FOLLOW',targetId:null}],reason:'Synthetic late response'})}}]}}).catch(()=>{});
 });
 await page.goto('/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
 await page.locator('#rules-open').click();await page.locator('.model-settings summary').click();await page.locator('#ai-budget').fill('1');await page.locator('#ai-key').fill('synthetic-cancellation-key');await page.locator('#ai-connect').click();await page.locator('#rules-close').click();
 await expect.poll(()=>received,{timeout:20000}).toBe(true);
 const suspended=await page.evaluate(()=>{const g=window.__SKIMMER_SCRAPER__!;const before=g.snapshot();g.pause();return{before,after:g.snapshot(),perception:g.aiPerception()};});
 expect(suspended.after.cooperation.epoch).toBeGreaterThan(suspended.before.cooperation.epoch);expect(suspended.perception).toBeNull();
 release();await expect.poll(()=>page.evaluate(()=>window.__SKIMMER_SCRAPER__!.snapshot().cooperation.model.pending)).toBe(false);
 const final=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__!;g.resume();const s=await g.advance(.2);g.pause();return s;});
 expect(final.cooperation.trace.some(t=>t.event==='execution')).toBe(false);expect(final.cooperation.model.cancellations).toBe(1);
 expect(final.cooperation.trust.value).toBe(suspended.before.cooperation.trust.value);
 writeFileSync('evidence/v0.3/phase-6-late-plan.json',JSON.stringify({method:'Synthetic delayed transport boundary test; not real inference evidence.',suspended,final},null,2));
});
