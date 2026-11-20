import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
test('earned Trust and a real nearby surface partner provide only a finite challenge rescue',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'challenge',graceSeconds:10,shield:true}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:1,behavior:'lead'}));});
 await page.goto('/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
 const result=await page.evaluate(async()=>{
  const g=window.__SKIMMER_SCRAPER__!;await g.retry();let earned=await g.advance(2.2);
  // Controlled geometric fixture, not a claim about unaided human survival.
  g.pause();await g.setPose({x:0,y:24,z:120});
  const partner=g.snapshot().companions[0];const surface=g.surface(partner.position,40);
  if(!surface)throw Error('Fixture lacks a real surface');
  const anchor={...partner.position};
  let detached:{x:number;y:number;z:number}|null=null;
  for(const dy of [35,45])for(const dx of [0,20,-20,35,-35])for(const dz of [0,20,-20]){
    const candidate={x:anchor.x+dx,y:anchor.y+dy,z:anchor.z+dz};
    if(Math.hypot(dx,dy,dz)>58||g.surface(candidate,42))continue;
    let clear=true;for(let i=1;i<10;i++){const t=i/10;const p={x:anchor.x+dx*t,y:anchor.y+dy*t,z:anchor.z+dz*t};if(g.surface(p,7))clear=false;}
    if(clear&&!detached)detached=candidate;
  }
  if(!detached)throw Error('Fixture lacks a detached line-of-sight rescue position');
  await g.setPose(detached,{pitch:0,preserveCompanions:true});g.resume();await g.advance(.01,{holdPosition:true});
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
