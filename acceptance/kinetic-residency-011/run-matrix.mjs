import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {openSession,relocate,residentCell,retiredCell} from './observe.mjs';

const [candidate,base,seedText,mode,output]=process.argv.slice(2);
const seed=Number(seedText);
assert.ok([17,334458,4294967295].includes(seed) && ['stable','ephemeral'].includes(mode) && output);
const source='c4bc8eac5425197ebb08c937316de415e75b89b1';
const catalog='02d807f0ae74a011c45043d0fa0144260c5e36236c2d1695b912e839f9d9dabd';
const cells=[{x:-10,z:-7},{x:11,z:-8},{x:9,z:10},{x:-12,z:9}];
const park={x:96,z:-96};
const key=c=>c.x+':'+c.z;
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',['-C',candidate,...args],{encoding:'utf8'}).trim();
const report={schema:'kinetic-residency-evidence-1',source,catalog,seed,mode,cells,park,
  workflowRun:process.env.GITHUB_RUN_ID,workflowAttempt:process.env.GITHUB_RUN_ATTEMPT,observer:process.env.GITHUB_SHA,
  method:'Shipping production browser at the title screen. setPose drives normal coverage, scheduling, worker generation and retirement. Chromium inspector reads the active world closed over by glideSurface. The hashed typed arrays belong to the indexed live MeshBVH.geometry. Coordinate and index bytes are concatenated in that order, including their actual view offsets and lengths. All relocation, alignment and eviction data is retained.',
  startedUtc:new Date().toISOString(),stage:'initialization',orders:{},crossOrder:[],checks:0,failures:[]};
await mkdir(output,{recursive:true});
const destination=path.join(output,seed+'-'+mode+'.json');
const save=()=>writeFile(destination,JSON.stringify(report,null,2)+'\n');
function check(name,pass,detail) {
  report.checks++;
  if (!pass) report.failures.push({stage:report.stage,name,detail});
}
async function history(session,cell) {
  return session.page.evaluate(k=>window.__SKIMMER_SCRAPER__.snapshot().revisionHistory?.entries.find(e=>e.key===k)??null,key(cell));
}
async function trip(session,cell,list) {
  const row={requested:key(cell)}; list.push(row);
  await relocate(session.page,cell);
  const active=await session.world.read(residentCell,cell); row.active=active;
  check('public ACTIVE fingerprint matches the live generated chunk',active.publicState?.state==='ACTIVE'
    && active.publicState?.revision===active.revision && active.publicState?.fingerprint===active.chunkFingerprint,active.publicState);
  check('real worker and registered collider',Number.isFinite(active.workerBuildMs) && active.triangles>0
    && active.contact.chunkId===active.id && active.contact.logicalSurfaceId===['kinetic-grid-1-r2',seed,'spine',cell.x].join('.'),active.contact);
  check('production resident budget',active.bvhs>0 && active.bvhs===active.active && active.active<=active.cap && active.cap===41,active.cell);
  await relocate(session.page,park);
  await session.page.waitForFunction(k=>!window.__SKIMMER_SCRAPER__.snapshot().chunkStates.some(c=>c.key===k),
    active.cell,{polling:100,timeout:30000});
  const gone=await session.world.read(retiredCell,{cell:active.cell,id:active.id,socket:active.socket});
  row.evicted=gone;
  check('real retirement removed record, BVH, socket and old lease',!gone.managed && !gone.indexed
    && !gone.socketStillExposed && !gone.leaseStillExposed && gone.retiredTotal>active.retiredTotal
    && gone.disposedGeometryCount>active.disposedGeometryCount,gone);
  if (mode==='ephemeral') {
    check('bounded history records exactly one retirement',gone.history?.revision===active.revision+1
      && gone.history.retireCount===active.history?.retireCount+1 && gone.historySize<=gone.historyCap,gone);
  } else check('stable uses revision zero and no ephemeral history',active.revision===0 && !active.history && !gone.history,active.cell);
  return row;
}
function comparePair(a,b) {
  const before=a.active, after=b.active;
  const stable=mode==='stable';
  const result={cell:before.cell,expectedReloadRevision:stable?0:a.evicted.history?.revision,
    beforeRevision:before.revision,afterRevision:after.revision,shaEqual:before.collisionSha256===after.collisionSha256,
    fingerprintEqual:before.chunkFingerprint===after.chunkFingerprint,chunkIdEqual:before.id===after.id,
    leaseChanged:before.socket.lease!==after.socket.lease,geometryInstanceChanged:before.geometryUuid!==after.geometryUuid,
    socketEqual:before.socket.id===after.socket.id && isDeepStrictEqual(before.socket.position,after.socket.position),
    logicalSurfaceEqual:before.contact.logicalSurfaceId===after.contact.logicalSurfaceId};
  check('reload revision follows the observed retirement',after.revision===result.expectedReloadRevision
    && after.id==='chunk:'+before.cell+':r'+after.revision,result);
  check('collision bytes, chunk ID and fingerprint follow world mode',result.shaEqual===stable
    && result.fingerprintEqual===stable && result.chunkIdEqual===stable,result);
  check('fresh activation and fixed boundary',result.leaseChanged && result.geometryInstanceChanged && result.socketEqual
    && result.logicalSurfaceEqual && before.worldFingerprint===after.worldFingerprint,result);
  return result;
}
const activeSessions=[];
let browser;
try {
  assert.equal(git('rev-parse','HEAD'),source);
  report.build=await (await fetch(new URL('build-info.json',base))).json();
  assert.equal(report.build.sourceCommit,source); assert.equal(report.build.dirty,false);
  report.gitTree=git('rev-parse','HEAD^{tree}');
  report.sourceFiles={};
  for(const f of ['src/world/worldStreamer.ts','src/world/chunkedWorldAdapter.ts','src/world/chunkSource.ts',
    'src/world/cityChunk.worker.ts','src/world/chunkRevisionHistory.ts','src/world/kinetic/kinetic-flight-modules.r2.json']) {
    report.sourceFiles[f]=sha(await readFile(path.join(candidate,f)));
  }
  assert.equal(report.sourceFiles['src/world/kinetic/kinetic-flight-modules.r2.json'],catalog);
  report.servedScripts={};
  for(const f of (await readdir(path.join(candidate,'dist/assets'))).filter(f=>/^(index-|cityChunk\.worker-|kinetic-flight-modules).*\.js$/.test(f))) {
    const res=await fetch(new URL('assets/'+f,base));
    assert.ok(res.ok);
    const bytes=Buffer.from(await res.arrayBuffer());
    assert.equal(sha(bytes),sha(await readFile(path.join(candidate,'dist/assets',f))));
    report.servedScripts['/assets/'+f]={bytes:bytes.length,sha256:sha(bytes)};
  }
  const {chromium}=createRequire(path.resolve(candidate,'package.json'))('@playwright/test');
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--mute-audio']});
  for(const name of ['forward','reverse']) {
    report.stage=name+' open';
    const session=await openSession(browser,base,seed,mode);
    activeSessions.push(session);
    const row={initial:session.initial,workers:session.workers,browserErrors:session.errors,
      warm:[],alignment:[],before:[],after:[],pairs:[]}; report.orders[name]=row;
    // Seed the real, bounded history in identical order. Each measured cell is
    // absent from residency before the experimental order begins.
    for(const c of cells) {
      report.stage=name+' warm '+key(c);
      await trip(session,c,row.warm);
    }
    await save();
  }
  if (mode==='ephemeral') {
    // New history entries inherit the current retirement epoch. If timing led to
    // different starting epochs, add real visits to the lagging context only.
    for(const c of cells) {
      const entries=await Promise.all(activeSessions.map(s=>history(s,c)));
      assert.ok(entries.every(Boolean),'Warm history entry disappeared for '+key(c));
      const target=Math.max(...entries.map(e=>e.revision));
      for(const [n,session] of activeSessions.entries()) {
        const name=n===0?'forward':'reverse';
        let revision=entries[n].revision;
        if (target-revision>8) throw Error('Unexpected initial revision spread for '+key(c)+': '+JSON.stringify(entries));
        while(revision<target) {
          report.stage=name+' align '+key(c);
          const row=await trip(session,c,report.orders[name].alignment);
          assert.equal(row.evicted.history.revision,revision+1);
          revision=row.evicted.history.revision;
        }
      }
    }
  }
  for(const [n,session] of activeSessions.entries()) {
    const name=n===0?'forward':'reverse', order=n===0?cells:[...cells].reverse(), record=report.orders[name];
    for(const [phase,route] of [['before',order],['after',[...order].reverse()]]) {
      for(const c of route) {
        report.stage=name+' '+phase+' '+key(c);
        await trip(session,c,record[phase]);
        await save();
      }
    }
    for(const before of record.before) record.pairs.push(comparePair(before,record.after.find(r=>r.requested===before.requested)));
    check('city worker used by the shipping page',record.workers.some(url=>/cityChunk\.worker/.test(url)),record.workers);
    check('no browser errors',record.browserErrors.length===0,record.browserErrors);
  }
  for(const phase of ['before','after']) for(const c of cells) {
    const lookup=name=>report.orders[name][phase].find(row=>row.requested===key(c)).active;
    const f=lookup('forward'), r=lookup('reverse');
    const fields=['id','revision','worldFingerprint','chunkFingerprint','layout','collisionSha256','positionSha256',
      'indexSha256','positionBytes','indexBytes','positionType','indexType','triangles'];
    const mismatch=fields.filter(k=>f[k]!==r[k]);
    if(f.socket.id!==r.socket.id || !isDeepStrictEqual(f.socket.position,r.socket.position)) mismatch.push('boundary socket');
    const result={phase,cell:key(c),forwardRevision:f.revision,reverseRevision:r.revision,
      forwardSha256:f.collisionSha256,reverseSha256:r.collisionSha256,mismatch};
    report.crossOrder.push(result);
    check('opposite orders reproduce identical geometry at equal revision',mismatch.length===0,result);
  }
} catch (error) {
  report.failures.push({stage:report.stage,error:String(error.stack??error)});
  for(const [n,s] of activeSessions.entries()) {
    const data=await s.page.evaluate(()=>{
      const snapshot=window.__SKIMMER_SCRAPER__.snapshot();
      return {seed:snapshot.seed,mode:snapshot.worldMode,position:snapshot.position,streaming:snapshot.streaming,
        chunkStates:snapshot.chunkStates,history:snapshot.revisionHistory};
    }).catch(e=>({error:String(e)}));
    report['diagnostic'+n]=data;
  }
} finally {
  for(const s of activeSessions) {await s.world.close().catch(()=>{});await s.context.close().catch(()=>{});}
  await browser?.close();
  report.finishedUtc=new Date().toISOString();
  report.status=report.failures.length?'failed':'passed';
  await save();
}
console.log(JSON.stringify({seed,mode,status:report.status,checks:report.checks,failures:report.failures.slice(0,4)}));
if(report.failures.length)process.exitCode=1;
