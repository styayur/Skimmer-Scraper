import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { identifyRunningBuild, measureMenus } from './observe.mjs';

const { values } = parseArgs({options:{ inputs:{type:'string'}, output:{type:'string'},
  'tool-root':{type:'string'}, 'slot-clearance':{type:'string'}, help:{type:'boolean'} }});
if (values.help) {
  console.log('node launch.mjs --inputs STAGED_DIR --output NEW_DIR --tool-root CHECKOUT_WITH_PLAYWRIGHT --slot-clearance "Parent clearance reference and UTC"');
  process.exit(0);
}
assert.equal(process.platform,'win32');
assert(values.inputs && values.output && values['tool-root'] && values['slot-clearance']?.trim(),
  'The native run requires staged inputs and the parent’s explicit exclusive desktop clearance');
const subprocess = promisify(execFile);
const ps = (args, env=process.env, timeout=5000) => subprocess('powershell.exe',
  ['-NoProfile','-NonInteractive',...args],{env,timeout,windowsHide:true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonFile = async name => JSON.parse((await readFile(name,'utf8')).replace(/^\uFEFF/,''));
const staged = await realpath(values.inputs);
const identity = await jsonFile(path.join(staged,'inputs.json'));
const local = await jsonFile(path.join(staged,'local-launch.json'));
assert(/^[a-f0-9]{40}$/.test(identity.pr97Merge) && /^[a-f0-9]{64}$/.test(identity.archiveSha256));
assert(identity.build.dirty===false && identity.build.toolchain.platform==='win32');
const exe = await realpath(local.exe), info = await stat(exe,{bigint:true});
assert.equal(info.mtimeNs.toString(),local.mtimeNs);
assert.equal(Number(info.size),identity.executable.bytes);
assert.equal(path.basename(exe),identity.executable.name);
const tools = await realpath(values['tool-root']);
const {chromium} = createRequire(path.join(tools,'package.json'))('@playwright/test');
const knownFolders=path.join(tools,'scripts','qualification','verify-native-profile.ps1');
const output=path.resolve(values.output);
await mkdir(path.dirname(output),{recursive:true});
await mkdir(output);   // Preserve every attempt, including a failed admission.
const scratchParent=await realpath(path.dirname(output));
const scratch=await mkdtemp(path.join(scratchParent,'.kinetic-startup-profile-'));
const marker=randomUUID(), markerFile=path.join(scratch,'.owned-profile');
await writeFile(markerFile,marker);
const profile=path.join(scratch,'User'), appData=path.join(profile,'AppData');
const webview=path.join(scratch,'WebView'), temp=path.join(scratch,'Temp');
const env={...process.env,USERPROFILE:profile,APPDATA:path.join(appData,'Roaming'),LOCALAPPDATA:path.join(appData,'Local'),
  TMP:temp,TEMP:temp,WEBVIEW2_USER_DATA_FOLDER:webview,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-address=127.0.0.1 --remote-debugging-port=0'};
for(const dir of [env.APPDATA,env.LOCALAPPDATA,webview,temp]) await mkdir(dir,{recursive:true});
const report={schema:'kinetic-native-cold-start-1',source:identity.build.sourceCommit,identity,
  slotClearance:values['slot-clearance'], launches:0, stage:'admission', status:'pending',
  method:'One normal process launch with empty app, temp and WebView2 directories. The host monotonic clock starts immediately before spawn. Main-frame clocks are correlated independently per document. No OS cache flush or reboot. Default native graphics and window settings.',
  observerFiles:{}};
for(const name of ['observe.mjs','launch.mjs','window-owner.py']) {
  report.observerFiles[name]=hash(await readFile(fileURLToPath(new URL(name,import.meta.url))));
}
const save=()=>writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
let client, page, browser, t0, killswitch, expired=false;
const clock=()=>Number(process.hrtime.bigint()-t0)/1e6;
const exited=()=>client?.exitCode!==null || client?.signalCode!==null;
const owner=async(activate=false)=>{
  const args=['-B',fileURLToPath(new URL('window-owner.py',import.meta.url)),String(client.pid)];
  if(activate)args.push('--activate');
  return JSON.parse((await subprocess('python',args,{windowsHide:true,timeout:3500})).stdout);
};
try {
  await save();
  await ps(['-File',knownFolders],env,12000);
  const counts=await ps(['-Command',"@(Get-Process -Name 'skimmer-scraper' -ErrorAction SilentlyContinue).Count"]);
  assert.equal(counts.stdout.trim(),'0','Another Skimmer client owns the desktop');
  report.profile={new:true,knownLocalAndRoamingVerified:true,webViewWasEmpty:true, otherClientCount:0};
  report.stage='launch';
  const utcBefore=new Date().toISOString();
  t0=process.hrtime.bigint();
  client=spawn(exe,[],{env,stdio:'ignore',windowsHide:false});
  report.launches=1;
  report.launch={utcBeforeSpawn:utcBefore, monotonicNs:t0.toString(), returnedFromSpawnMs:clock(),
    returnedFromSpawnUtc:new Date().toISOString()};
  // Bound even a blocked CDP call. Only the process handle created above can be stopped.
  killswitch=setTimeout(()=>{expired=true; if(!exited()) client.kill();},75000);
  await once(client,'spawn');
  report.launch.pid=client.pid;
  report.launch.spawnAcknowledgedMs=clock();
  await save();
  let port;
  while(clock()<25000 && !port){
    assert(!exited(),'Client exited before its private WebView2 endpoint appeared');
    for(const file of ['EBWebView/DevToolsActivePort','DevToolsActivePort']){
      const data=await readFile(path.join(webview,file),'utf8').catch(()=>'');
      const value=Number(data.split('\n')[0]);
      if(Number.isInteger(value) && value>0 && value<=65535){port=value;break;}
    }
    if(!port) await delay(30);
  }
  assert(port,'No private WebView2 endpoint');
  report.launch.privateEndpointMs=clock();
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:10000});
  const context=browser.contexts()[0];
  page=context.pages()[0] ?? await context.waitForEvent('page',{timeout:7000});
  await page.waitForURL(/^https?:\/\/tauri\.localhost\//,{timeout:15000,waitUntil:'commit'});
  report.stage='title, world selection and frame';
  await measureMenus(page,report,clock,async()=>{
    const focused=await owner(true);
    if(!focused.owned) await page.bringToFront();
    const verified=focused.owned ? focused : await owner();
    assert(verified.owned,'The measured native window does not own the desktop');
    return {initial:focused,verified,dom:await page.evaluate(()=>document.hasFocus())};
  });
  report.endpointHostReceiptUtc=report.events.find(e=>e.event==='runningCoveredFrame').hostReceivedUtc;
  report.endpointEstimatedMonotonicNs=(t0+BigInt(Math.round(report.timing.launchToFrameMs*1e6))).toString();
  report.endpointEstimatedUtc=new Date(Date.parse(utcBefore)+report.timing.launchToFrameMs).toISOString();
  report.endpointWindow=await owner();
  assert(report.endpointWindow.owned,'Foreground ownership lost after the measured frame');
  await save();
  report.stage='post-endpoint identity';
  report.running=await identifyRunningBuild(page);
  assert.deepEqual(report.running.build,identity.build);
  assert.equal(report.running.meta.sourceCommit,identity.build.sourceCommit);
  assert.equal(report.running.meta.dirty,false);
  assert.match(report.running.renderer,/Radeon.*780M/i);
  assert.doesNotMatch(report.running.renderer,/swiftshader|software|warp|llvmpipe|basic render/i);
  assert.match(report.running.url,/^https?:\/\/tauri\.localhost\//);
  const native=await page.evaluate(async()=>{
    const w=window.__TAURI__.window.getCurrentWindow();
    const platform=await window.__TAURI__.core.invoke('desktop_environment');
    return {library:platform.directory,webview2:platform.webview2,fullscreen:await w.isFullscreen(),focused:document.hasFocus()};
  });
  assert.equal(path.resolve(native.library).toLowerCase(),
    path.join(env.LOCALAPPDATA,'io.github.styayur.skimmer-scraper','world-library-v1').toLowerCase());
  report.profile.runtimeLibraryInsideIsolatedLocal=true;
  report.window={webview2:native.webview2,fullscreen:native.fullscreen,focused:native.focused};
  assert(native.fullscreen && native.focused);
  const image=await page.screenshot({type:'jpeg',quality:78,timeout:4000});
  await writeFile(path.join(output,'first-flight.jpg'),image);
  report.screenshot={file:'first-flight.jpg',bytes:image.length,sha256:hash(image),afterEndpoint:true};
  report.stage='exit';
} catch(error){
  report.failure={stage:report.stage,message:String(error.stack??error)};
} finally {
  if(client){
    try {
      if(!exited()) await ps(['-Command','(Get-Process -Id '+client.pid+').CloseMainWindow()']);
      const end=Date.now()+4500;
      while(!exited() && Date.now()<end) await delay(40);
      if(!exited()) {client.kill(); throw Error('Owned test client did not exit after its normal window close');}
      report.shutdown={exitCode:client.exitCode,signal:client.signalCode,hostMs:clock(),utc:new Date().toISOString()};
      assert(!expired && client.exitCode===0,'The bounded client did not exit normally');
    } catch(error){report.exitFailure=String(error);}
  }
  clearTimeout(killswitch);
  await browser?.close().catch(()=>{});
  if(client && !report.failure){
    try{assert.equal(hash(await readFile(exe)),identity.executable.sha256);report.executedFileHashRechecked=true;}
    catch(error){report.binaryFailure=String(error);}
  }
  try{
    const owned=await realpath(scratch);
    assert(path.dirname(owned)===scratchParent && path.basename(owned).startsWith('.kinetic-startup-profile-'));
    assert.equal(await readFile(markerFile,'utf8'),marker);
    await rm(owned,{recursive:true,maxRetries:3,retryDelay:150});
    report.profileRemoved=true;
  }catch(error){report.cleanupFailure=String(error);}
  report.status=report.failure || report.exitFailure || report.binaryFailure || report.cleanupFailure ? 'failed':'passed';
  await save();
}
console.log(report.status,report.failure?.message ?? report.timing);
if(report.status!=='passed')process.exitCode=1;
