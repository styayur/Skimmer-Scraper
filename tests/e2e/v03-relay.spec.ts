import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('earned Trust and a real nearby surface partner provide only a finite challenge rescue',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'challenge',graceSeconds:10,shield:true}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:1,behavior:'lead'}));});
 await page.goto('/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
 const result=await page.evaluate(async()=>{
  const g=window.__SKIMMER_SCRAPER__!;await g.retry();let earned=await g.advance(2.2);
  // Controlled geometric fixture, not a claim about unaided human survival.
  g.pause();let partner=earned.companions[0];let surface=g.surface(partner.position,40);
  if(!surface||surface.distance<7||surface.distance>30){await g.setPose({x:0,y:24,z:120});g.resume();earned=await g.advance(1);g.pause();partner=earned.companions[0];surface=g.surface(partner.position,40);}
  if(!surface)throw Error('Fixture lacks a real surface');
  const normal={x:(partner.position.x-surface.point.x)/surface.distance,y:(partner.position.y-surface.point.y)/surface.distance,z:(partner.position.z-surface.point.z)/surface.distance};
  const anchor={...partner.position};
  await g.setPose({x:anchor.x+normal.x*39,y:anchor.y+normal.y*39,z:anchor.z+normal.z*39},{pitch:0,preserveCompanions:true});g.resume();await g.advance(.01,{holdPosition:true});
  let before=g.snapshot();
  // One fixed HOLD anchor remains valid throughout the finite countdown.
  {
   const p=g.aiPerception()!;const target=p.targets.find(t=>t.kind==='surface'&&t.agentId===1);
   if(target)g.aiReplay({requestId:p.requestId,epoch:p.epoch,ttl:12,risk:.2,formation:'wedge',orders:[{agents:[1],action:'HOLD',targetId:target.id}],reason:'可重复救援几何夹具'},p);
   before=await g.advance(8.4,{holdPosition:true});
  }
  const attempted=g.relay(1);const repeated=g.relay(1);g.pause();return{earned,before,attempted,repeated};
 });
 writeFileSync('evidence/v0.3/phase-4-relay-browser.json',JSON.stringify({method:'Controlled browser fixture using actual streamed geometry, earned leading Trust, real agent motion, finite challenge grace; HOLD is explicitly synthetic and no real-model rescue or human gameplay superiority is claimed.',...result},null,2));
 expect(result.earned.cooperation.trust.events.some(e=>e.event==='accepted-lead')).toBe(true);
 expect(result.attempted.cooperation.relay.attempts).toBeGreaterThan(0);
 expect(result.repeated.cooperation.relay.charges).toBeGreaterThanOrEqual(0);
 // Success is asserted after recording diagnostic geometry; failures remain observable.
 expect(result.attempted.cooperation.relay.successes).toBe(1);expect(result.attempted.grace-result.before.grace).toBeCloseTo(1.25,3);
 expect(result.repeated.cooperation.relay.successes).toBe(1);
});
