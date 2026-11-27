// Opt-in, single-attempt DeepSeek Flash smoke against a frozen local client.
// The page gets a synthetic credential. Only the pinned HTTPS transport gets the real secret.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const endpoint = 'https://api.deepseek.com/chat/completions';
const model = 'deepseek-flash';
const message = 'Mission: KITE-2 escort me';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function providerPost(key, body, report) {
  return new Promise(resolve => {
    let timer;
    const finish = result => { clearTimeout(timer); resolve(result); };
    // A single new TLS socket. Node https.request neither follows redirects nor retries.
    const request = https.request(endpoint, {
      method: 'POST', agent: false, rejectUnauthorized: true,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    }, response => {
      report.httpStatus = response.statusCode;
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 65536) { request.destroy(); finish(null); return; }
        chunks.push(chunk);
      });
      response.on('error', () => finish(null));
      response.on('aborted', () => finish(null));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          finish({ status: response.statusCode, body: '{}' });
          return;
        }
        try {
          const provider = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const usage = provider.usage ?? {};
          report.providerUsage = {
            input: integer(usage.prompt_tokens), output: integer(usage.completion_tokens),
            total: integer(usage.total_tokens), cached: integer(usage.prompt_cache_hit_tokens),
          };
          // No pricing lookup or guessed tariff. Only a provider-reported monetary amount is usable.
          if (typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0 &&
              typeof usage.currency === 'string' && /^[A-Z]{3}$/.test(usage.currency)) {
            report.providerCost = { amount: usage.cost, currency: usage.currency };
          }
          const content = provider.choices?.[0]?.message?.content;
          if (typeof content !== 'string' || content.includes(key)) { finish(null); return; }
          const safeBody = { choices: [{ finish_reason: provider.choices[0].finish_reason === 'content_filter'
            ? 'content_filter' : 'stop', message: { content } }],
            usage: { prompt_tokens: report.providerUsage.input, completion_tokens: report.providerUsage.output,
              total_tokens: report.providerUsage.total, prompt_cache_hit_tokens: report.providerUsage.cached } };
          finish({ status: 200, body: JSON.stringify(safeBody) });
        } catch { finish(null); }
      });
    });
    request.on('error', () => finish(null));
    timer = setTimeout(() => { request.destroy(); finish(null); }, 14000);
    request.end(JSON.stringify(body));
  });
}

async function main() {
  const { values } = parseArgs({ options: { source: {type:'string'}, sha: {type:'string'},
    url: {type:'string'}, out: {type:'string'}, 'allow-real': {type:'boolean'} } });
  if (!values['allow-real'] || process.env.SKIMMER_REAL_MODEL !== '1' || !process.env.DEEPSEEK_API_KEY)
    throw Error('explicit-opt-in-and-key-required');
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG || process.env.SSLKEYLOGFILE ||
      /--(?:tls-keylog|inspect)/.test([process.env.NODE_OPTIONS,...process.execArgv].join(' ')))
    throw Error('disable-protocol-and-tls-debugging');
  if (!values.out || !values.source || !values.url || !/^[a-f0-9]{40}$/.test(values.sha ?? ''))
    throw Error('missing-source-sha-url-or-output-directory');
  const base = new URL(values.url);
  if (base.protocol !== 'http:' || !['127.0.0.1','[::1]'].includes(base.hostname) || base.username ||
      base.password || base.search || base.hash || !base.pathname.endsWith('/')) throw Error('loopback-directory-url-required');
  const source = path.resolve(values.source);
  const git = (...args) => execFileSync('git',['-C',source,...args],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if (git('rev-parse','HEAD') !== values.sha || git('status','--porcelain','--untracked-files=no')) throw Error('frozen-source-mismatch');
  const dist = path.join(source,'dist');
  const meta = JSON.parse(await readFile(path.join(dist,'build-info.json'),'utf8'));
  if (meta.sourceCommit !== values.sha || meta.version !== JSON.parse(await readFile(path.join(source,'package.json'),'utf8')).version || meta.dirty !== false) throw Error('frozen-build-mismatch');
  const html = await readFile(path.join(dist,'index.html'),'utf8');
  const entry = /<script\b[^>]*\btype="module"[^>]*\bsrc="\.\/(assets\/[\w.-]+\.js)"/.exec(html)?.[1];
  if (!entry) throw Error('frozen-module-missing');
  const expectedHash = digest(await readFile(path.join(dist,entry)));
  const entryURL = new URL(entry,base).href;
  await mkdir(values.out,{recursive:true});
  const resultFile = path.join(values.out,`live-mission-${values.sha}.json`);
  // Exclusive, persistent reservation survives a crash or an uncertain network outcome.
  const file = await open(resultFile,'wx',0o600).catch(()=>{throw Error('output-exists-or-unwritable');});
  const report = { sourceCommit:values.sha, version:meta.version, expectedEntrySha256:expectedHash,
    loadedEntrySha256:null, loadedSourceCommit:null, provider:'DeepSeek', model, maxPlayerRequests:1,
    transport:'One official HTTPS POST bridged to the isolated browser; direct browser CORS is outside this smoke.',
    attempts:0, blockedExternal:0, duplicatePosts:0, httpStatus:null, providerUsage:null, providerCost:null,
    outcome:'reserved', phase:'preflight', mission:null };
  async function saveReceipt() {
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
    await file.write(bytes, 0, bytes.length, 0);
    await file.truncate(bytes.length);
    await file.sync();
  }
  await saveReceipt();
  let browser;
  try {
    report.phase='launch';
    const browserEnv={...process.env};
    delete browserEnv.DEEPSEEK_API_KEY;
    browser = await chromium.launch({headless:true,env:browserEnv,args:['--disable-background-networking','--disable-sync',
      '--disable-quic','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});
    const context = await browser.newContext({locale:'en-US',serviceWorkers:'block',acceptDownloads:false});
    await context.routeWebSocket('**/*',ws=>{report.blockedExternal++;ws.close();});
    let armed=false;
    await context.route('**/*',async route=>{
      const request = route.request(), dest = new URL(request.url());
      if (dest.origin === base.origin && dest.pathname.startsWith(base.pathname) && request.method()==='GET') {
        // Fetch only this literal loopback URL. A local redirect must never cause a second request.
        try {
          const relative=decodeURIComponent(dest.pathname.slice(base.pathname.length))||'index.html';
          const full=path.resolve(dist,relative);
          if(!full.startsWith(dist+path.sep))throw Error();
          const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:20000});
          try {
            if(response.status()!==200) return await route.fulfill({status:404,body:''});
            const bytes=await response.body();
            if(digest(bytes)!==digest(await readFile(full))) throw Error();
            return await route.fulfill({status:200,contentType:response.headers()['content-type'],body:bytes});
          } finally {await response.dispose();}
        } catch {return route.abort().catch(()=>{});}
      }
      if (request.url() !== endpoint) { report.blockedExternal++;return route.abort(); }
      const cors = {'Access-Control-Allow-Origin':base.origin,'Access-Control-Allow-Headers':'authorization, content-type',
        'Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
      if(!armed || request.method()!=='POST' || report.attempts) { report.duplicatePosts++;return route.abort(); }
      try {
        const body=request.postDataJSON(), input=JSON.parse(body.messages[1].content);
        const suggested=input.suggestedMissions;
        if(request.postDataBuffer().length>12000 || body.model!==model || body.stream!==false ||
            body.messages.length!==2 || body.messages[0].role!=='system' || body.messages[1].role!=='user' ||
            input.message!==message || input.replyLanguage!=='en-US' || input.turns?.length!==0 ||
            suggested?.length!==1 || suggested[0].type!=='ESCORT' || suggested[0].agentIds?.join(',')!=='2' ||
            suggested[0].targetId!==null || input.perception.seed!==334458)throw Error();
        armed=false;
        report.attempts++;
        report.phase='dispatch-reserved';
        await saveReceipt();
        const result=await providerPost(process.env.DEEPSEEK_API_KEY,{model,messages:body.messages,
          max_tokens:192,temperature:0.2,stream:false,thinking:{type:'disabled'},safety_check:{level:'high'}},report);
        if (!result) return route.abort();
        return route.fulfill({...result,headers:cors});
      } catch {return route.abort().catch(()=>{});}
    });
    const page=await context.newPage();
    report.phase='verify-loaded-source';
    const url=new URL(base);url.search='?seed=334458&gen=4';
    const [entryResponse]=await Promise.all([page.waitForResponse(r=>r.url()===entryURL&&r.ok()&&r.request().resourceType()==='script'),
      page.goto(url.href)]);
    report.loadedEntrySha256=digest(await entryResponse.body());
    assert.equal(report.loadedEntrySha256,expectedHash);
    await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready,null,{timeout:60000});
    const identity=await page.evaluate(async()=>({meta:await(await fetch('./build-info.json',{cache:'no-store'})).json(),
      link:document.querySelector('#guide-source-links a')?.href,locale:document.documentElement.lang}));
    assert.deepEqual(identity.meta,meta);assert.equal(identity.link,meta.sourceUrl);assert.equal(identity.locale,'en-US');
    report.loadedSourceCommit=identity.meta.sourceCommit;
    report.phase='configure';
    await page.locator('#start-button').click();
    await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().runTime>1);
    await page.evaluate(async()=>{
      const game=window.__SKIMMER_SCRAPER__;game.pause();
      await game.setPose({x:0,y:390,z:120},{yaw:0,pitch:0,roll:0});game.resume();
    });
    await page.keyboard.press('f');
    await page.locator('#advanced-flight-settings > summary').click();
    await page.locator('.model-settings summary').click();
    assert.equal(await page.locator('#ai-provider').inputValue(),'deepseek');
    assert.equal(await page.locator('#ai-endpoint').inputValue(),endpoint);
    await page.locator('#ai-model').fill(model);
    await page.locator('#ai-budget').fill('1');
    await page.locator('#ai-tokens').fill('16000');
    await page.locator('#ai-timeout').fill('18000');
    await page.locator('#ai-interval').fill('60');
    await page.locator('#ai-key').fill('synthetic-single-flight-placeholder');
    await page.locator('#ai-connect').click();
    const budget=await page.evaluate(()=>{const c=window.__SKIMMER_SCRAPER__.snapshot().cooperation;
      return {max:c.config.maxRequests,requests:c.model.requests,connected:c.model.connected};});
    assert.deepEqual(budget,{max:1,requests:0,connected:true});
    report.phase='player-mission';
    await page.keyboard.press('t');
    await page.locator('#radio-input').fill(message);
    armed=true;
    await page.locator('#radio-input').press('Enter');
    await page.waitForFunction(()=>{
      const c=window.__SKIMMER_SCRAPER__.snapshot().cooperation;
      return !c.radio.pending && c.trace.some(t=>t.event==='mission-validation');
    },null,{timeout:30000});
    const result=await page.evaluate(()=>{
      const c=window.__SKIMMER_SCRAPER__.snapshot().cooperation;
      const mission=c.missions.find(m=>m.type==='ESCORT'&&m.agentId===2);
      const accepted=c.trace.filter(e=>e.event==='mission-validation'&&e.data.result==='accepted').at(-1)?.data;
      return {source:accepted?.source??null,mission:mission?{type:mission.type,agentId:mission.agentId,
        phase:mission.phase,outcome:mission.outcome}:null,requests:c.model.requests,lanes:c.model.lanes,
        validation:c.trace.filter(e=>e.event==='mission-validation').map(e=>({source:e.data.source,result:e.data.result})),
        error:c.model.error};
    });
    assert(result.requests<=1 && result.lanes.background===0 && result.lanes.asr===0 && result.lanes.tts===0);
    assert.equal(report.blockedExternal,0);assert.equal(report.duplicatePosts,0);
    report.mission=result.mission;report.lanes=result.lanes;
    const reasons=new Set(['accepted','intent-mismatch','schema','mission-schema','stale-epoch','expired','agents',
      'agent-unavailable','resource-conflict','target','target-kind','target-unloaded','target-unavailable','unreachable','dialogue']);
    report.validation=result.validation.map(row=>({source:row.source==='model'?'model':'local',
      result:reasons.has(row.result)?row.result:'other-validation-failure'}));
    report.clientError=/^(?:http-\d{3}|timeout|request-size|token-budget|invalid-or-network-response|filtered-response)$/.test(result.error??'')?result.error:null;
    report.outcome=result.mission && result.source==='model' && report.httpStatus===200 && report.attempts===1
      ? 'validated-model-mission' : result.mission && result.source==='local' ? 'local-fallback' : 'no-accepted-mission';
    report.phase='complete';
    if(report.outcome!=='validated-model-mission')process.exitCode=2;
  } catch {
    report.outcome='incomplete';process.exitCode=1;
  } finally {
    await browser?.close().catch(()=>{});
    await saveReceipt();
    await file.close();
  }
  console.log(report.outcome,resultFile);
}

main().catch(error=>{
  const allowed=['explicit-opt-in-and-key-required','missing-source-sha-url-or-output-directory','loopback-directory-url-required',
    'frozen-source-mismatch','frozen-build-mismatch','frozen-module-missing','output-exists-or-unwritable','disable-protocol-and-tls-debugging'];
  console.error(allowed.includes(error.message)?error.message:'Live mission preflight failed');
  process.exitCode=1;
});
