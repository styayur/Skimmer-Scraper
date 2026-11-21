import {describe,it,expect} from 'vitest';
import {Euler,Quaternion} from 'three';
import {SkyJourney,SKY_HEIGHT} from '../../src/game/skyJourney';
import {createFlightState} from '../../src/flight/flightModel';
import {createRunRules,updateRunRules} from '../../src/game/runRules';
import {journeyWorld,JOURNEY_PROFILES} from '../../src/world/journeyWorlds';
import {resolveWorldSettings} from '../../src/world/worldConfig';
import {bestStorageKey,defaultScoreContext} from '../../src/game/storage';
import {planSkyPassage,stepSkyDive,translateWingForSky} from '../../src/game/skyFlight';
import type {Attitude,Vec3} from '../../src/core/math';
const rising=()=>createFlightState({position:{x:0,y:SKY_HEIGHT+.1,z:0},yaw:0,pitch:1,speed:100});
const spawn={position:{x:0,y:24,z:120},yaw:0,pitch:-.015,speed:66};
const ground={queryNearest:(point:Vec3,range:number)=>point.y<=range
  ?{distance:point.y,point:{...point,y:0},chunkId:'city',surfaceId:'ground'}:null};
const rotation=({pitch,yaw,roll}:Attitude)=>new Quaternion().setFromEuler(new Euler(pitch,yaw,roll,'YXZ'));
describe('Sky Inversion sequence',()=>{
 it('turns the arrival away from a bridge blocking the first seconds of restored control',()=>{
  const world={queryNearest:(p:{x:number;y:number;z:number},r:number)=>{
    const wall=Math.abs(p.z-60);const ground=Math.abs(p.y);const d=Math.min(wall,ground);
    return d<=r?{distance:d,point:wall<ground?{...p,z:60}:{...p,y:0},chunkId:'city',surfaceId:'bridge'}:null;
  }};
  const passage=planSkyPassage(rising(),spawn,world)!;
  expect(passage.exitAttitude.yaw).toBeCloseTo(Math.PI);
  expect(passage.end).toEqual(spawn.position);
  expect(passage.adjustedHeading).toBe(true);
 });
 it('selects a lower curve under a bridge and rejects unloaded or blocked routes',()=>{
  const bridge={queryNearest:(p:Vec3,r:number)=>Math.abs(p.y-60)<=r
    ?{distance:Math.abs(p.y-60),point:{...p,y:60},chunkId:'city',surfaceId:'bridge'}:ground.queryNearest(p,r)};
  const entry=rising();
  const passage=planSkyPassage(entry,spawn,bridge)!;
  expect(passage.start.y).toBeLessThan(54);
  for(let i=0;i<=144;i++){
    const point=stepSkyDive(entry,passage,i/144,1/120).position;
    expect(bridge.queryNearest(point,6.5)).toBeNull();
  }
  expect(planSkyPassage(entry,spawn,{...ground,isCompanionCovered:()=>false})).toBeNull();
 });
 it.each([
  {pitch:0.4,yaw:-0.6,roll:0.2}, {pitch:1.15,yaw:2.4,roll:Math.PI-0.02},
  {pitch:1.75,yaw:-2.1,roll:-Math.PI/2},
 ])('carries attitude, speed, velocity and wing offsets from $pitch/$yaw/$roll',attitude=>{
  const approach=createFlightState({position:rising().position,speed:91,...attitude});
  const entry={...approach,attitude,throttle:.84,boosting:true};
  const passage=planSkyPassage(entry,spawn,ground)!;
  const first=stepSkyDive(entry,passage,0,1/120);
  const last=stepSkyDive(entry,passage,1,1/120);
  expect(first.attitude).toEqual(entry.attitude);
  expect(first.velocity).toEqual(entry.velocity);
  expect(last.velocity).toEqual(passage.exitVelocity);
  expect(last.attitude.roll).toBeCloseTo(attitude.roll);
  expect(last.speed).toBe(91);
  expect(last.throttle).toBe(.84);
  expect(last.boosting).toBe(true);
  let previous=rotation(first.attitude);
  for(let step=1;step<=144;step++){
    const next=rotation(stepSkyDive(entry,passage,step/144,1/120).attitude);
    expect(previous.angleTo(next)).toBeLessThan(.045);
    previous=next;
  }
  const wing={...entry,position:{x:entry.position.x+8,y:entry.position.y-4,z:entry.position.z+15}};
  expect(translateWingForSky(wing,passage)).toEqual({...wing,position:{x:passage.start.x+8,y:passage.start.y-4,z:passage.start.z+15}});
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
