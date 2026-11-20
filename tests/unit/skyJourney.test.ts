import {describe,it,expect} from 'vitest';
import {SkyJourney,SKY_HEIGHT} from '../../src/game/skyJourney';
import {createFlightState} from '../../src/flight/flightModel';
import {createRunRules,updateRunRules} from '../../src/game/runRules';
import {journeyWorld,JOURNEY_PROFILES} from '../../src/world/journeyWorlds';
import {resolveWorldSettings} from '../../src/world/worldConfig';
import {bestStorageKey,defaultScoreContext} from '../../src/game/storage';
import {chooseSkyEntry,stepSkyDive} from '../../src/game/skyFlight';
const rising=()=>createFlightState({position:{x:0,y:SKY_HEIGHT+.1,z:0},yaw:0,pitch:1,speed:100});
describe('Sky Inversion sequence',()=>{
 it('checks the whole dive column, chooses a lower entry under a bridge and rejects a blocked spawn',()=>{
  const spawn={x:0,y:24,z:120};const bridge={queryNearest:(p:typeof spawn,r:number)=>Math.abs(p.y-60)<=r?{distance:Math.abs(p.y-60),point:{...p,y:60},chunkId:'bridge',surfaceId:'bridge'}:null};
  expect(chooseSkyEntry(spawn,bridge)?.y).toBe(48);
  const blocked={queryNearest:()=>({distance:0,point:spawn,chunkId:'wall',surfaceId:'wall'})};expect(chooseSkyEntry(spawn,blocked)).toBeNull();
  const start={...spawn,y:48};let flight=createFlightState({position:start,yaw:0});
  for(let i=1;i<=144;i++){flight=stepSkyDive(flight,start,spawn,i/144,1/120);expect(flight.position.y).toBeGreaterThanOrEqual(24);expect(flight.position.y).toBeLessThanOrEqual(48);}
  expect(flight.position).toEqual(spawn);expect(flight.attitude.pitch).toBeCloseTo(0);
 });
 it('does not freeze rules below threshold, while falling, when teleported above it or after grace failure',()=>{
  const sky=new SkyJourney();const rules=createRunRules();
  expect(sky.observe(500,{...rising(),position:{x:0,y:501,z:0}},rules,.1)).toBe(false);
  expect(sky.observe(519,{...rising(),velocity:{x:0,y:-90,z:0}},rules,.1)).toBe(false);
  expect(sky.observe(600,{...rising(),position:{x:0,y:601,z:0}},rules,.1)).toBe(false);
  expect(sky.observe(519,rising(),updateRunRules(rules,{distance:null},5),.1)).toBe(false);expect(sky.active).toBe(false);
 });
 it('crosses all phases once with a 3.6-second fixed animation plus an acknowledged async swap',()=>{
  const sky=new SkyJourney();expect(sky.observe(519,rising(),createRunRules(),1/120)).toBe(true);
  for(let i=0;i<192;i++)sky.step(1/120);expect(sky.phase).toBe('WORLD_SWAP');expect(sky.worldIndex).toBe(0);
  sky.step(60);expect(sky.phase).toBe('WORLD_SWAP');sky.worldReady();
  for(let i=0;i<240;i++)sky.step(1/120);expect(sky.crossings).toBe(1);expect(sky.phase).toBe('ASCENT');
  expect(sky.history.map(h=>h.phase)).toEqual(['THRESHOLD','INVERSION','WORLD_SWAP','DIVE','RECOVERY','ASCENT']);
  expect(sky.observe(519,rising(),createRunRules(),1/120)).toBe(false);
 });
 it.each(['THRESHOLD','INVERSION','DIVE','RECOVERY'] as const)('skips %s without skipping the resource exchange or double counting',phase=>{
  const sky=new SkyJourney();sky.observe(519,rising(),createRunRules(),.01);
  if(phase!=='THRESHOLD')sky.step(.4);
  if(phase==='DIVE'||phase==='RECOVERY'){sky.step(1.2);sky.worldReady();}
  if(phase==='RECOVERY')sky.step(1.2);
  sky.skip();sky.step(.01);
  if(sky.phase==='WORLD_SWAP')sky.worldReady();
  for(let i=0;i<500;i++)sky.step(1/120);expect(sky.crossings).toBe(1);expect(sky.phase).toBe('ASCENT');
  sky.reset();expect(sky.worldIndex).toBe(0);expect(sky.history).toHaveLength(0);
 });
 it('reproduces five new worlds without mutating the historical generator settings',()=>{
  const base=resolveWorldSettings({seed:'334458'});const original=JSON.stringify(base);
  expect(journeyWorld(base,0)).toEqual(base);
  const sequence=Array.from({length:5},(_,i)=>journeyWorld(base,i+1));
  expect(sequence).toEqual(Array.from({length:5},(_,i)=>journeyWorld(base,i+1)));
  expect(new Set(sequence.map(w=>w.seed)).size).toBe(5);expect(new Set(JOURNEY_PROFILES.map(p=>p.horizon)).size).toBe(5);
  expect(JSON.stringify(base)).toBe(original);expect(sequence.every(w=>w.generatorVersion===base.generatorVersion)).toBe(true);
  expect(bestStorageKey({...defaultScoreContext,journey:true})).not.toBe(bestStorageKey(defaultScoreContext));
 });
});
