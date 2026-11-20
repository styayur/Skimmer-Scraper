import {chromium} from '@playwright/test';
import {writeFileSync,readFileSync} from 'node:fs';
const prefix=process.env.EVIDENCE_PREFIX??'phase-4';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
try{
 const comparison=[];
 const recording=JSON.parse(readFileSync(`evidence/v0.3/${prefix}-real-deepseek-flash.json`,'utf8')).after.cooperation.trace.find(t=>t.event==='decision'&&t.data.validation==='accepted').data.decision;
 for(const kind of ['none','fixed-script','recorded-model']){
  const context=await browser.newContext({viewport:{width:1280,height:720}});const page=await context.newPage();
  await page.addInitScript(count=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count}));},kind==='none'?0:3);
  await page.goto('http://127.0.0.1:4174/?debug=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running');
  const result=await page.evaluate(async({kind,recording})=>{
   const game=window.__SKIMMER_SCRAPER__;await game.retry();const start=game.snapshot();const segments=[];
   for(let i=0;i<3;i++){
    if(kind!=='none'){
     const p=game.aiPerception();if(p){const decision=kind==='fixed-script'?{ttl:10,risk:.3,formation:'line',orders:[{agents:[1,2,3],action:'FOLLOW',targetId:null}],reason:'固定对照策略'}:recording;
      game.aiReplay({...decision,requestId:p.requestId,epoch:p.epoch},p);}
    }
    segments.push(await game.advance(6));
   }
   game.pause();return{kind,start,segments,end:segments.at(-1)};
  },{kind,recording});comparison.push(result);await context.close();
 }
 writeFileSync(`evidence/v0.3/${prefix}-comparison.json`,JSON.stringify({method:'Same seed 334458, same deterministic demo input, 18 simulation seconds. Model variant replays an actual sanitized Flash decision with fresh request IDs; no new inference or superiority claim. Fixed-script is a fixed high-level FOLLOW policy with the same collision controller.',comparison},null,2));
 console.log(JSON.stringify(comparison.map(r=>({kind:r.kind,runTime:r.end.runTime,trust:r.end.cooperation.trust.value,rescues:r.end.cooperation.relay.successes,impacts:r.end.companions.reduce((n,a)=>n+a.impacts,0),positions:r.end.companions.map(a=>a.position)}))));
}finally{await browser.close();}
