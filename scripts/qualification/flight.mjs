import assert from 'node:assert/strict';
import path from 'node:path';
import {rename,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

async function pose(page,position,pitch=0,armedAfter=null) {
  // Observe the idle world and pause in the same browser task. An inversion already in
  // flight must complete before its seed and index can become an approach baseline.
  const handle=await page.waitForFunction(armedAfter=>{
    const game=window.__SKIMMER_SCRAPER__,s=game.snapshot(),f=window.__qaFlight;
    if(f.error)throw Error(f.error);
    if(s.journey.active || s.journey.phase!=='ASCENT')return false;
    if(armedAfter!==null && (s.runTime<=armedAfter || s.position.y>=450))return false;
    const before={seed:s.seed,index:s.journey.worldIndex,crossings:s.journey.crossings,
      epoch:s.cooperation.epoch,charges:s.cooperation.relay.charges,runTime:s.runTime,phase:s.journey.phase};
    f.positioning=true;
    if(!game.pause()){f.positioning=false;throw Error('Cannot pause for scripted approach');}
    return before;
  },armedAfter,{timeout:60000});
  try {
    const before=await handle.jsonValue();
    assert(Number.isInteger(before.index) && Number.isFinite(before.runTime),'Incomplete approach baseline');
    await page.evaluate(async({position,pitch})=>{
      const game=window.__SKIMMER_SCRAPER__;
      try {
        await game.setPose(position,{yaw:0,roll:0,pitch});
        if(!game.resume())throw Error('Cannot resume after scripted approach');
      } finally {window.__qaFlight.positioning=false;}
    },{position,pitch});
    return before;
  } finally {await handle.dispose();}
}

function crossingCounts(start,total,transitions) {
  assert(Number.isInteger(start) && start>=0 && Number.isInteger(total) && total>=start);
  assert.equal(transitions.length,2);
  let previous=start;
  for(const {before,after} of transitions){
    assert(Number.isInteger(before.index) && before.index>=previous);
    assert.equal(before.crossings,before.index);
    assert.equal(after.index,before.index+1);
    assert.equal(after.crossings,after.index);
    assert(total>=after.index);
    previous=after.index;
  }
  return {scriptedCrossings:transitions.length,naturalCrossings:total-start-transitions.length};
}

const cruise={x:0,y:390,z:120};

export function controlledSchedule(seconds) {
  const third = Math.floor(seconds / 3);
  const inversions = [third, 2 * third];
  const circuits = [];
  for (let t = 12; t < seconds - 1; t += 12) if (!inversions.includes(t)) circuits.push(t);
  return { inversions, circuits, seeds: [334458, 479568308, 501763084] };
}

export function cpuSummary(samples) {
  const values = samples.map(sample => sample.busyPercent).sort((a,b) => a-b);
  assert(values.length && values.every(value => Number.isFinite(value) && value >= 0 && value <= 100));
  return { count: values.length, medianPercent: values[Math.ceil(values.length*0.5)-1], p95Percent: values[Math.ceil(values.length*0.95)-1] };
}

export function verifyKineticBudget(samples) {
  const measured = samples.filter(row => Number.isInteger(row.loadedChunks) && Number.isInteger(row.maxLoadedChunks));
  assert(measured.length > 0 && measured.every(row => row.loadedChunks <= row.maxLoadedChunks),
    'Kinetic City exceeded its resident chunk budget');
  assert(samples.every(row => Number.isInteger(row.loadedChunks) || row.phase !== 'ASCENT' || row.buffering),
    'Missing active city resource counters');
  assert(measured.some(row => row.retiredTotal > 0), 'The flight did not retire streamed chunks');
  assert(measured.every(row => row.missionRecords <= 24 + row.deployed && row.runningMissionTargets <= row.deployed && row.staleMissionTargets === 0),
    'Mission records or active targets exceeded the team and world lifetime bounds');
  assert(measured.every(row => row.queuedSpeech <= 3 && row.playbackEvents <= 32),
    'Voice queue or playback history exceeded its shipping limit');
}

export async function prepareFlight(page,output,world) {
  await page.bringToFront();
  if(world==='kinetic-city'){
    await page.keyboard.press('g');
    assert.equal(await page.locator('#world-theme').inputValue(),'kinetic-city','The running world selector must confirm Kinetic City');
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('f');
  const rules=page.locator('#run-mode'), count=page.locator('#companion-count');
  const initial={mode:await rules.inputValue(),wingmates:await count.inputValue()};
  await rules.selectOption('free');
  await count.selectOption('3');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('#run-shield').check();
  await page.locator('#comfort-settings > summary').click();
  const quality=page.locator('#quality-button');
  if(/平衡|balanced/i.test(await quality.textContent()))await quality.click();
  assert.match(await quality.textContent(),/高|high/i);
  await writeFile(path.join(output,'setup.json'),JSON.stringify({initial,mode:await rules.inputValue(),wingmates:await count.inputValue(),shield:await page.locator('#run-shield').isChecked()},null,2));
  await page.locator('#rules-close').click();
  await page.locator('#start-button').click();
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().runTime>2);
  await page.evaluate(()=>{window.__qaFlight={};});
  if(world==='city')await pose(page,cruise);
  await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().companions.filter(a=>a.deployed&&!a.uncovered).length===3);
}

export async function foregroundFlight(page,seconds,output,world,controlled=false) {
  await page.evaluate(world=>{
    const f=window.__qaFlight, g=window.__SKIMMER_SCRAPER__, start=g.snapshot();
    if(start.rules.mode!=='free' || !start.rules.shield || start.companionSettings.count!==3 || start.debugInput)
      throw Error('Expected normal shielded Free Flight with three wingmates');
    if(document.hidden || !document.hasFocus())throw Error('Flight page is not foreground');
    if(!start.music.enabled)throw Error('Expected the default enabled music setting');
    const gl=document.querySelector('canvas').getContext('webgl2');
    f.settings={mode:start.rules.mode,shield:start.rules.shield,companions:start.companionSettings.count,
      camera:start.cameraMode,aircraft:start.selectedAircraft,worldMode:start.worldMode,preset:start.worldPreset,
      generator:start.generatorVersion,language:document.documentElement.lang,musicEnabled:start.music.enabled,
      viewport:[innerWidth,innerHeight],buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],dpr:devicePixelRatio};
    if(world==='kinetic-city')f.kineticStart={selectedTheme:document.querySelector('#world-theme').value,fingerprint:start.worldFingerprint};
    f.samples=[];f.frames=[];f.error=null;f.start=start.runTime;f.seed=start.seed;
    f.initialBuffer=start.bufferingEvents;f.startCrossings=start.journey.crossings;f.startWall=performance.now();
    f.loss=()=>{f.error='Document lost foreground focus or visibility';};
    window.addEventListener('blur',f.loss);document.addEventListener('visibilitychange',f.loss);
    let next=f.startWall,last=f.startWall;
    const frame=now=>{
      if(now>last)f.frames.push(now-last);
      last=now;
      if(now>=next){
        next=now+1000;
        const s=g.snapshot();
        if(s.mode!=='running'&&!f.positioning)f.error='Unexpected flight mode '+s.mode;
        if(s.failureReason||s.companions.length!==3||s.cooperation.model.requests!==0)f.error='Flight, team or offline invariant failed';
        f.samples.push({wallMs:now-f.startWall,flightSeconds:s.runTime-f.start,position:s.position,
          seed:s.seed,phase:s.journey.phase,worldIndex:s.journey.worldIndex,crossings:s.journey.crossings,epoch:s.cooperation.epoch,
          deployed:s.companions.filter(a=>a.deployed).length,covered:s.companions.filter(a=>a.deployed&&!a.uncovered).length,
          music:s.music,voice:{played:s.voice?.played,completed:s.voice?.completed},glide:s.glide?.phase,
          buffering:s.buffering,loadedChunks:s.streaming?.loadedChunks,activeChunks:s.streaming?.activeChunks,
          maxLoadedChunks:s.streaming?.maxLoadedChunks,renderObjects:s.streaming?.renderObjectCount,
          collisionTriangles:s.world.collisionTriangles,geometries:s.render.geometries,textures:s.render.textures,
          disposedGeometry:s.streaming?.disposedGeometryCount,
          bvh:s.streaming?.bvhCount,dynamic:s.streaming?.dynamicBvhCount,
          residentGeometry:s.streaming?.estimatedCpuGeometryBytes,triangles:s.render.triangles,calls:s.render.calls,
          gpuMs:s.render.gpuMs,heap:performance.memory?.usedJSHeapSize});
        if(world==='kinetic-city' && s.streaming){
          const {generatedTotal,retiredTotal,rebaseCount}=s.streaming;
          const missions=s.cooperation.missions;
          const targets=missions.filter(mission=>mission.outcome==='running' && mission.targetId!==null);
          Object.assign(f.samples.at(-1),{generatedTotal,retiredTotal,rebaseCount,
            missionRecords:missions.length,runningMissionTargets:targets.length,
            staleMissionTargets:targets.filter(mission=>mission.epoch!==s.cooperation.epoch).length,
            queuedSpeech:s.voice.queuedSpeech,
            playbackEvents:s.voice.playbackEvents.length});
        }
      }
      f.raf=requestAnimationFrame(frame);
    };
    f.raf=requestAnimationFrame(frame);
  },world);
  const crossings=[],checkpointSamples=[];
  const schedule=controlled ? controlledSchedule(seconds) : null;
  const circuits=[];
  let attempt=null;
  const checkpoint=async(reason=null)=>{
    const snapshot=await page.evaluate(offset=>{
      const f=window.__qaFlight,s=window.__SKIMMER_SCRAPER__.snapshot();
      return {samples:f.samples.slice(offset),startCrossings:f.startCrossings,crossings:s.journey.crossings,
        seed:s.seed,journey:s.journey,epoch:s.cooperation.epoch,charges:s.cooperation.relay.charges,
        elapsedMs:performance.now()-f.startWall,error:f.error};
    },checkpointSamples.length);
    checkpointSamples.push(...snapshot.samples);
    const file=path.join(output,'flight-partial.json');
    await writeFile(file+'.tmp',JSON.stringify({...snapshot,samples:checkpointSamples,
      status:reason?'failed':'in-progress',reason,scriptedCrossings:crossings.length,transitions:crossings,circuits,attempt},null,2));
    await rename(file+'.tmp',file);
  };
  const hold=async()=>{if(world==='city')await page.keyboard.down('q');await page.keyboard.down('Shift');};
  const release=async()=>{await page.keyboard.up('Shift');if(world==='city')await page.keyboard.up('q');};
  const deadline=Date.now()+(seconds+180)*1000;
  let nextHeartbeat=0;
  try {
    await hold();
    while(Date.now()<deadline){
      await delay(1000);
      const {row,error}=await page.evaluate(()=>({row:window.__qaFlight.samples.at(-1),error:window.__qaFlight.error}));
      assert(!error,error);
      if(!row)continue;
      if(controlled)assert(row.crossings<=crossings.length,'Unscheduled inversion on the controlled route');
      if(row.wallMs>=nextHeartbeat){
        nextHeartbeat=row.wallMs+15000;
        await writeFile(path.join(output,'progress.json'),JSON.stringify(row,null,2));
        await checkpoint();
      }
      const inversionAt=schedule ? schedule.inversions[crossings.length] : seconds*(crossings.length+1)/3;
      if(crossings.length<2 && row.flightSeconds>=inversionAt) {
        await release();
        attempt={number:crossings.length+1,stage:'waiting for idle world'};
        // A natural crossing may just have finished. Fly below the rearm height for
        // a shipping fixed step before setting up the scripted threshold approach.
        const approach=world==='city'?cruise:{x:row.position.x,y:390,z:row.position.z};
        const staging=await pose(page,approach);
        const before=await pose(page,{...approach,y:519},1.15,staging.runTime+0.05);
        attempt={...attempt,stage:'awaiting arrival',before};
        assert.equal(before.index,before.crossings);
        await checkpoint();
        const arrived=await page.waitForFunction(index=>{
          const s=window.__SKIMMER_SCRAPER__.snapshot();
          if(window.__qaFlight.error)throw Error(window.__qaFlight.error);
          if(s.journey.crossings>index)throw Error('Missed the scripted arrival');
          if(s.journey.crossings!==index || s.journey.active ||
              s.companions.filter(a=>a.deployed&&!a.uncovered).length!==3)return false;
          return {seed:s.seed,index:s.journey.worldIndex,crossings:s.journey.crossings,epoch:s.cooperation.epoch,
            charges:s.cooperation.relay.charges,phase:s.journey.phase,release:s.worldReleases.at(-1),
            deployed:s.companions.filter(a=>a.deployed).length,covered:s.companions.filter(a=>a.deployed&&!a.uncovered).length,
            phases:s.journey.history.slice(-6).map(h=>h.phase)};
        },before.index+1,{timeout:60000});
        let after;
        try {after=await arrived.jsonValue();} finally {await arrived.dispose();}
        attempt={...attempt,stage:'verifying arrival',after};
        assert.notEqual(after.seed,before.seed);
        assert(after.epoch>before.epoch);
        assert.equal(after.index,before.index+1);
        assert.equal(after.charges,before.charges);
        assert.equal(after.release.seed,before.seed);
        for(const field of ['bvhAfter','dynamicBvhAfter','rootChildrenAfter'])assert.equal(after.release[field],0);
        assert.deepEqual(after.phases,['THRESHOLD','INVERSION','WORLD_SWAP','DIVE','RECOVERY','ASCENT']);
        crossings.push({before,after});
        attempt=null;
        await checkpoint();
        if(world==='city')await pose(page,cruise);
        await hold();
      } else if(schedule && row.flightSeconds>=schedule.circuits[circuits.length]) {
        const before=await pose(page,cruise);
        assert.equal(before.index,crossings.length,'Circuit entered an unscheduled world');
        circuits.push({scheduled:schedule.circuits[circuits.length],observed:row.flightSeconds,worldIndex:before.index,seed:before.seed});
      }
      if(row.flightSeconds>=seconds && row.wallMs>=seconds*1000 && crossings.length===2 && row.phase==='ASCENT')break;
    }
    const finished=await page.waitForFunction(()=>{
      const f=window.__qaFlight,s=window.__SKIMMER_SCRAPER__.snapshot();
      if(f.error)throw Error(f.error);
      if(s.journey.active || s.journey.phase!=='ASCENT')return false;
      cancelAnimationFrame(f.raf);
      window.removeEventListener('blur',f.loss);document.removeEventListener('visibilitychange',f.loss);
      const frames=[...f.frames].sort((a,b)=>a-b),total=frames.reduce((sum,v)=>sum+v,0);
      const percentile=q=>frames[Math.ceil(frames.length*q)-1];
      return {samples:f.samples,settings:f.settings,kineticStart:f.kineticStart,startSeed:f.seed,startCrossings:f.startCrossings,flightSeconds:s.runTime-f.start,wallMs:performance.now()-f.startWall,
        frameIntervalsMs:f.frames,frames:frames.length,meanFps:1000*frames.length/total,frameMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),worst:frames.at(-1)},
        bufferEntries:s.bufferingEvents.entries-f.initialBuffer.entries,bufferMs:s.bufferingEvents.totalMs-f.initialBuffer.totalMs,
        finalAgents:s.companions.map(a=>({id:a.id,deployed:a.deployed,uncovered:a.uncovered})),
        finalWorldIndex:s.journey.worldIndex,finalPhase:s.journey.phase,crossings:s.journey.crossings,error:f.error};
    },null,{timeout:60000});
    let result;
    try {result=await finished.jsonValue();} finally {await finished.dispose();}
    assert(!result.error,result.error);
    assert(result.flightSeconds>=seconds && result.wallMs>=seconds*1000,'Endurance deadline missed');
    assert.deepEqual(result.finalAgents.map(a=>a.id),[1,2,3]);
    assert(result.finalAgents.every(a=>a.deployed&&!a.uncovered));
    assert(result.samples.every(row=>row.deployed===3),'Wingmate lost during flight');
    assert.equal(result.finalWorldIndex,result.crossings);
    assert(result.samples.every(row=>row.music.enabled),'Music preference changed during flight');
    assert(result.samples.filter(row=>row.music.playing && row.music.mediaTime>0).length>result.samples.length/2,'Default music did not play through the flight');
    const counts=crossingCounts(result.startCrossings,result.crossings,crossings);
    if(schedule){
      assert.equal(counts.naturalCrossings,0);
      assert.deepEqual([result.startSeed,...crossings.map(item=>item.after.seed)],schedule.seeds);
      assert.deepEqual(circuits.map(item=>item.scheduled),schedule.circuits);
      assert(circuits.every(item=>item.seed===schedule.seeds[item.worldIndex]));
    }
    if(world==='kinetic-city')verifyKineticBudget(result.samples);
    const route=controlled?'Sakura 12-second circuits with two scheduled Sky Inversions':world==='city'?'Sakura city with two scripted Sky Inversions':'Kinetic City boosted traversal with two scripted Sky Inversions';
    return {route,quality:'high',seconds,
      method:'Wall-clock foreground animation frames and shipping fixed steps. Scripted keyboard and repeatable approach poses.',...result,
      ...counts,transitions:crossings,controlledRoute:schedule?{schedule,circuits}:undefined};
  } catch(error) {
    await checkpoint(String(error.message)).catch(()=>{});
    throw error;
  } finally {await release();}
}
