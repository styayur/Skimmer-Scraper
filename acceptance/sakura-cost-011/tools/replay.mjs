import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {installProbe} from './browser-probe.mjs';
const {chromium}=createRequire(path.resolve('final/package.json'))('@playwright/test');
const lane=process.env.LANE;
const graphics=lane==='graphics';
const labels=lane==='relay' ? ['final','fixed','fixed','final'] : ['stock','final','final','stock'];
const seeds=[334458,479568308,501763084];
const sha=s=>createHash('sha256').update(s).digest('hex');
const out=(file,value)=>fs.writeFileSync('out/'+file,JSON.stringify(value,null,2));
const zip=(file,value)=>fs.writeFileSync('out/'+file,gzipSync(JSON.stringify(value),{level:9}));
const servers=[];
const refs=[...new Set(labels)];
for (const [idx,ref] of refs.entries()) {
  const port=4173+idx;
  const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],
    {cwd:path.resolve(ref),stdio:'inherit'});
  servers.push(child);
}
let browser;
try {
  for(const [i,ref] of refs.entries()) {
    const url='http://127.0.0.1:'+(4173+i);
    let response;
    for(let n=0;n<60;n++) {
      try { response=await fetch(url+'/build-info.json'); if(response.ok)break; } catch {}
      await sleep(150);
    }
    assert(response?.ok,'preview unavailable '+ref);
    const info=await response.json();
    assert.equal(info.sourceCommit,fs.readFileSync('out/'+ref+'.commit','utf8').trim());
    assert.equal(info.dirty,!graphics);
    out(ref+'.build.json',info);
  }
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  const jobs=[];
  // A/B/B/A on the same VM; each record has its own clean browser context.
  for(const [round,ref] of labels.entries()) for(const seed of seeds) {
    const prefix=[lane,round,ref,seed].join('-');
    console.log('Starting '+prefix);
    const context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:1,locale:'en-US'});
    await context.addInitScript(installProbe,{graphics});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>{errors.push(String(e.stack||e)); console.error(String(e));});
    const url='http://127.0.0.1:'+(4173+refs.indexOf(ref))+'/?preset=city&world=stable&gen=4&seed='+seeds[0];
    try {
      await page.goto(url,{waitUntil:'load'});
      await page.waitForFunction(()=>!!window.__SKIMMER_SCRAPER__?.snapshot().ready,undefined,{polling:100,timeout:65000});
      await page.keyboard.press('f');
      await page.locator('#advanced-flight-settings > summary').click();
      await page.locator('#comfort-settings > summary').click();
      const quality=page.locator('#quality-button');
      if (/balanced/i.test(await quality.textContent())) await quality.click();
      assert.match(await quality.textContent(),/high/i);
      await page.locator('#rules-close').click();
      const arrivals=await page.evaluate(async({index,seeds})=>{
        window.__delivery.hold();
        const g=window.__SKIMMER_SCRAPER__;
        const cruise={x:0,y:390,z:120},pose={yaw:0,roll:0,pitch:0},arrivals=[];
        await g.start();
        for(let n=1;n<=index;n++) {
          await g.setPose(cruise,pose);
          await g.advance(.15);
          await g.setPose({...cruise,y:519},{...pose,pitch:1.15});
          let s=g.snapshot();
          for(let i=0;i<100 && s.journey.crossings<n;i++) s=await g.advance(.1);
          const phases=s.journey.history.slice(-6).map(p=>p.phase);
          if(s.seed!==seeds[n] || s.journey.worldIndex!==n || s.journey.crossings!==n ||
             phases.join(',')!=='THRESHOLD,INVERSION,WORLD_SWAP,DIVE,RECOVERY,ASCENT')
            throw Error('incorrect journey arrival '+JSON.stringify({n,seed:s.seed,journey:s.journey}));
          arrivals.push({seed:s.seed,worldIndex:n,phases,release:s.worldReleases.at(-1)});
        }
        await g.setPose(cruise,pose);
        await g.advance(2);
        if(!g.pause()) throw Error('start did not enter Free Flight');
        await g.setPose(cruise,pose);
        return arrivals;
      },{index:seeds.indexOf(seed),seeds});
      // Paused streaming requests use the shipping fixed visual limit. At a fixed pose this
      // removes the adaptive worker-latency budget from this particular graphics control.
      const settle=async()=>page.evaluate(async()=>{
        const g=window.__SKIMMER_SCRAPER__;
        let stable=0,previous='';
        const until=performance.now()+45000;
        while(performance.now()<until) {
          window.__delivery.pulse(1);
          await new Promise(r=>setTimeout(r,70));
          const s=g.snapshot(), st=s.streaming, key=JSON.stringify(s.chunkStates.map(c=>[c.key,c.state,c.revision,c.fingerprint]).sort());
          if(!st.queuedChunks&&!st.generatingChunks&&key===previous) stable++; else stable=0;
          if(stable>=3)return;
          previous=key;
        }
        throw Error('streamer did not settle '+JSON.stringify(g.snapshot().streaming));
      });
      const sample=async(tag)=>page.evaluate(({tag,graphics})=>{
        const g=window.__SKIMMER_SCRAPER__;
        if(graphics)window.__webgl.begin();
        // Fixed animation timestamp and zero free-running catch-up. advance() owns all physical ticks.
        const rafCallbacks=window.__delivery.pulse(1);
        const draw=graphics?window.__webgl.end():null, s=g.snapshot();
        return {tag,rafCallbacks,runTime:s.runTime,mode:s.mode,seed:s.seed,index:s.journey.worldIndex,phase:s.journey.phase,rules:s.rules,settings:s.companionSettings,
          camera:s.cameraMode,cameraPosition:s.cameraPosition,position:s.position,attitude:s.attitude,velocity:s.velocity,
          speed:s.speed,shieldImpacts:s.shieldImpacts,glide:s.glide.phase,usedGlide:s.surfaceGlideAssisted,
          debugInput:s.debugInput,agents:s.companions.map(a=>[a.id,a.deployed,a.uncovered,a.task,a.decisions,a.impacts,a.position]),
          active:s.streaming.activeChunks,loaded:s.streaming.loadedChunks,bvh:s.streaming.bvhCount,world:s.world,
          objects:s.streaming.renderObjectCount,fingerprint:s.worldFingerprint,chunks:s.chunkStates.map(c=>[c.key,c.state,c.revision,c.fingerprint]).sort(),
          render:{calls:s.render.calls,triangles:s.render.triangles},music:s.music.enabled,requests:s.cooperation.model.requests,
          missions:s.cooperation.missions?.length??0,relay:s.cooperation.relay,draw};
      },{tag,graphics});
      const rows=[];
      await settle();
      rows.push(await sample('fixed-start'));
      await page.evaluate(()=>window.__SKIMMER_SCRAPER__.resume());
      await page.keyboard.down('q'); await page.keyboard.down('Shift');
      await page.evaluate(()=>window.__meter.reset());
      for(let sec=1;sec<=12;sec++) {
        await page.evaluate(async()=>{
          const g=window.__SKIMMER_SCRAPER__;
          await g.advance(1);
          const until=performance.now()+25000;
          while(performance.now()<until) {
            const st=g.snapshot().streaming;
            if(!st.queuedChunks && !st.generatingChunks) return;
            await new Promise(r=>setTimeout(r,50));
          }
          throw Error('workers did not drain after physical step');
        });
        rows.push(await sample('flight-'+sec));
      }
      const workload=await page.evaluate(()=>window.__meter.take());
      const positive=await page.evaluate(()=>{
        window.__meter.reset();
        const pic=window.__SKIMMER_SCRAPER__.aiPerception();
        return {targets:pic?.targets.length??null,...window.__meter.take()};
      });
      await page.keyboard.up('Shift'); await page.keyboard.up('q');
      await page.evaluate(()=>window.__SKIMMER_SCRAPER__.pause());
      await settle(); rows.push(await sample('fixed-end'));
      let gl=null;
      if(graphics) {
        gl=await page.evaluate(()=>window.__webgl.inventory());
        const programs=gl.programs.map(pair=>pair.map(([type,source])=>[type,sha(source)]).sort((a,b)=>a[0]-b[0]));
        const programKeys=programs.map(v=>sha(JSON.stringify(v)));
        zip(prefix+'.shader-sources.json.gz',gl.programs);
        gl={...gl,programs,programKeys};
        for(const row of rows) {
          for(const cmd of row.draw.draws) {
            assert(programKeys[cmd[0]],'unidentified active program');
            cmd[0]=programKeys[cmd[0]];
          }
          assert.equal(row.draw.draws.length,row.render.calls,'WebGL interception misses a draw at '+row.tag);
        }
      }
      zip(prefix+'.json.gz',{seed,ref,round,url,arrivals,graphics,gl,workload,positive,rows,errors});
      for(const row of rows) {
        assert.equal(row.seed,seed); assert.equal(row.settings.count,3); assert.equal(row.settings.formation,'wedge');
        assert.equal(row.index,seeds.indexOf(seed)); assert.equal(row.phase,'ASCENT');
        assert.equal(row.settings.behavior,'formation'); assert.equal(row.rules.mode,'free'); assert.equal(row.rules.shield,true);
        assert.equal(row.debugInput,false); assert.equal(row.glide,'FLIGHT'); assert.equal(row.usedGlide,false);
        assert.equal(row.requests,0); assert.equal(row.missions,0); assert.equal(row.music,true);
        assert(row.render.calls>10 && row.render.triangles>1000);
      }
      assert.deepEqual(errors,[]);
      assert(Math.abs(rows[12].runTime-rows[0].runTime-12)<1e-6,'unexpected natural physics ticks');
      assert(rows[12].agents.every(a=>a[1] && !a[2]));
      assert(rows[12].speed>rows[0].speed+1,'boost input was not delivered');
      if(!graphics) {
        assert.equal(workload.calls['ai/SymbiosisRuntime.step'],1440);
        assert.equal(workload.calls['companions/AgentController.step'],1440);
        assert(workload.calls['MeshBVH.closestPointToPoint']>0);
        assert.equal(positive.calls['ai/SymbiosisRuntime.perception'],1);
      }
      jobs.push({prefix,round,ref,seed,ticks:1440,errors});
      out('completed.json',jobs);
      console.log('Complete '+prefix);
    } catch(err) {
      out(prefix+'.failure.json',{error:String(err.stack||err),errors,
        state:await page.evaluate(()=>{const s=window.__SKIMMER_SCRAPER__?.snapshot();return s&&{mode:s.mode,rules:s.rules,step:s.runTime,world:s.streaming,glide:s.glide,agents:s.companions};}).catch(()=>null)});
      throw err;
    } finally { await context.close(); }
  }
  out('host.json',{browser:browser.version(),node:process.version,labels,seeds,lane,run:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA});
} finally {
  await browser?.close();
  for(const child of servers)child.kill();
}
