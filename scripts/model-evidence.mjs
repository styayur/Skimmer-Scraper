// Opt-in genuine paid inference. No traces/videos or request headers are recorded.
import {chromium} from '@playwright/test';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const prefix=process.env.EVIDENCE_PREFIX??'phase-4';
const secret=process.env.DEEPSEEK_API_KEY;if(!secret)throw Error('DEEPSEEK_API_KEY is required');
const proxyUrl=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer'],...(proxyUrl?{proxy:{server:proxyUrl.origin,bypass:'127.0.0.1,localhost',...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}}:{})});
let stage='new context';let lastPage;
try{
 const runs=[];
 for(const model of ['deepseek-flash','deepseek-v4-pro']){
  const context=await browser.newContext({viewport:{width:1920,height:1080}});const page=await context.newPage();lastPage=page;const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
  page.on('response',r=>{if(r.url()==='https://api.deepseek.com/chat/completions')console.log(JSON.stringify({model,httpStatus:r.status()}));});
  page.on('requestfailed',r=>{if(r.url()==='https://api.deepseek.com/chat/completions')console.log(JSON.stringify({model,networkError:r.failure()?.errorText}));});
  await page.addInitScript(()=>{localStorage.setItem('skimmer-scraper.rules.v3',JSON.stringify({mode:'free'}));localStorage.setItem('skimmer-scraper.companions.v3',JSON.stringify({count:3,behavior:'lead'}));});
  stage='game boot';await page.goto(process.env.SKIMMER_URL??'http://127.0.0.1:4174/?autostart=1&seed=334458');await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().mode==='running',null,{timeout:120000});
  // Different real geometry: default rooftop flight vs open air, same base seed.
  if(model==='deepseek-v4-pro')await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;const s=g.snapshot();await g.setPose({...s.position,y:450});});
  stage='configuration';await page.keyboard.press('f');await page.locator('.model-settings summary').click();await page.locator('#ai-model').fill(model);await page.locator('#ai-budget').fill('2');await page.locator('#ai-timeout').fill('20000');await page.locator('#ai-interval').fill('8');
  try{await page.locator('#ai-key').fill(secret);}catch{throw Error('Could not enter memory credential');}
  await page.locator('#ai-connect').click();await page.locator('#rules-close').click();
  stage='inference';await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().cooperation.model.requests>=2&&!window.__SKIMMER_SCRAPER__.snapshot().cooperation.model.pending,null,{timeout:80000});
  const result=await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;const before=g.snapshot();const after=await g.advance(3);const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return{before,after,gpu:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent};});
  result.model=model;result.errors=errors;result.kind='genuine browser HTTPS model inference and actual local physics, no mocked responses';
  const script=await page.locator('script[type="module"]').getAttribute('src');result.testedAsset=script;
  if(script?.startsWith('./assets/'))result.assetSha256=createHash('sha256').update(readFileSync(`dist/${script.slice(2)}`)).digest('hex');
  if(JSON.stringify(result).includes(secret))throw Error('Sensitive evidence refused');
  writeFileSync(`evidence/v0.3/${prefix}-real-${model}.json`,JSON.stringify(result,null,2));await page.screenshot({path:`evidence/v0.3/${prefix}-real-${model}.png`});
  await page.evaluate(()=>window.__SKIMMER_SCRAPER__.pause());
  console.log(JSON.stringify({model,requests:result.after.cooperation.model.requests,successes:result.after.cooperation.model.successes,decisions:result.after.cooperation.trace.filter(t=>t.event==='decision').map(t=>({validation:t.data.validation,decision:t.data.decision,latencyMs:t.data.latencyMs,usage:t.data.usage})),trust:result.after.cooperation.trust.value,errors}));runs.push(result);await context.close();
 }
 if(!runs.every(r=>r.after.cooperation.trace.some(t=>t.event==='execution')&&r.after.cooperation.trace.some(t=>t.event==='outcome')))process.exitCode=2;
}catch(error){console.error(JSON.stringify({status:'real-model-incomplete',stage,errorType:error?.name}));if(lastPage){const state=await lastPage.evaluate(()=>window.__SKIMMER_SCRAPER__?.snapshot()).catch(()=>null);if(state&&!JSON.stringify(state).includes(secret))writeFileSync(`evidence/v0.3/${prefix}-real-incomplete.json`,JSON.stringify({stage,state},null,2));}process.exitCode=1;}finally{await browser.close();}
