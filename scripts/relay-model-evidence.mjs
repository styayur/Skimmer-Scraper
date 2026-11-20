// Opt-in paid official inference; simulation is paused during the external call.
// This is an explicitly labelled recorded-plan causal experiment, not a live-latency rescue.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const secret=process.env.DEEPSEEK_API_KEY;if(!secret)throw Error('DEEPSEEK_API_KEY required');
const prompt=readFileSync('src/ai/modelClient.ts','utf8').match(/const PROMPT = `([\s\S]*?)`;/)?.[1];if(!prompt)throw Error('Cannot find reviewed game planner prompt');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
const evidence={method:'Controlled actual-geometry fixture. Earned leading Trust; synthetic HOLD solely prepares a repeatable partner. Genuine official model receives the actual low-grace perception while simulation is paused. Original reply is retained and explicitly replayed with fresh requestId/epoch. No real-time latency rescue or human superiority is claimed.',runs:[]};
try{
 for(const kind of ['none','recorded-model']){
  const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
  await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'challenge',graceSeconds:10,shield:true}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:1,behavior:'lead'}));});
  await page.goto('http://127.0.0.1:4174/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running',null,{timeout:120000});
  const fixture=await page.evaluate(async()=>{
   const g=window.__SKIMMER_SCRAPER__;await g.retry();const earned=await g.advance(2.2);g.pause();await g.setPose({x:0,y:24,z:120});
   const anchor={...g.snapshot().companions[0].position};let detached=null;
   for(const dy of [35,45])for(const dx of [0,20,-20,35,-35])for(const dz of [0,20,-20]){
    const p={x:anchor.x+dx,y:anchor.y+dy,z:anchor.z+dz};if(Math.hypot(dx,dy,dz)>58||g.surface(p,42))continue;
    let clear=true;for(let i=1;i<10;i++){const t=i/10;if(g.surface({x:anchor.x+dx*t,y:anchor.y+dy*t,z:anchor.z+dz*t},7))clear=false;}
    if(clear&&!detached)detached=p;
   }
   if(!detached)throw Error('No rescue fixture position');await g.setPose(detached,{pitch:0,preserveCompanions:true});g.resume();await g.advance(.01,{holdPosition:true});
   const p=g.aiPerception();const target=p.targets.find(t=>t.kind==='surface'&&t.agentId===1);if(!target)throw Error('No surface partner');
   g.aiReplay({requestId:p.requestId,epoch:p.epoch,ttl:12,risk:.2,formation:'wedge',orders:[{agents:[1],action:'HOLD',targetId:target.id}],reason:'Explicit synthetic fixture anchor'},p);
   const before=await g.advance(8.4,{holdPosition:true});const perception=g.aiPerception();g.pause();return{earned,before,perception};
  });
  let inference=null;
  if(kind==='recorded-model'){
   const started=performance.now();const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(fixture.perception)}],response_format:{type:'json_object'},max_tokens:512,temperature:.2,stream:false,thinking:{type:'disabled'}}),signal:AbortSignal.timeout(20000),redirect:'error'});
   if(!response.ok)throw Error(`Official inference HTTP${response.status}`);const data=await response.json();
   if(JSON.stringify(data).includes(secret))throw Error('Sensitive reply refused');
   inference={model:'deepseek-flash',endpointOrigin:'https://api.deepseek.com',latencyMs:performance.now()-started,usage:data.usage,originalDecision:JSON.parse(data.choices[0].message.content)};
  }
  const outcome=await page.evaluate(async inference=>{
   const g=window.__SKIMMER_SCRAPER__;g.resume();await g.advance(.01,{holdPosition:true});const current=g.aiPerception();let accepted=null,replayedDecision=null;
   if(inference){replayedDecision={...inference.originalDecision,requestId:current.requestId,epoch:current.epoch};accepted=g.aiReplay(replayedDecision,current);}
   const immediate=await g.advance(.05,{holdPosition:true});const after=await g.advance(2,{holdPosition:true});g.pause();return{current,replayedDecision,accepted,immediate,after};
  },inference);
  evidence.runs.push({kind,fixture,inference,outcome});await context.close();
 }
 const json=JSON.stringify(evidence,null,2);if(json.includes(secret))throw Error('Sensitive evidence refused');
 writeFileSync('evidence/v0.3/phase-6-model-relay-causal.json',json);
 console.log(JSON.stringify(evidence.runs.map(r=>({kind:r.kind,trust:r.fixture.before.cooperation.trust.value,grace:r.fixture.before.grace,actions:r.inference?.originalDecision.orders,accepted:r.outcome.accepted,relaySuccesses:r.outcome.after.cooperation.relay.successes,finalMode:r.outcome.after.mode,finalGrace:r.outcome.after.grace,latencyMs:r.inference?.latencyMs}))));
}catch(error){console.error(JSON.stringify({status:'incomplete',errorType:error?.name}));process.exitCode=1;}finally{await browser.close();}
