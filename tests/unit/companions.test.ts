import { describe, expect, it } from 'vitest';
import { CompanionTeam, type CompanionWorld } from '../../src/companions/AgentController';
import { normalizeCompanions } from '../../src/companions/settings';
import { createFlightState, stepFlight, type FlightState } from '../../src/flight/flightModel';
import { distance } from '../../src/core/math';

const ground: CompanionWorld = { isCollisionCovered: () => true, queryNearest: (p, radius) => p.y <= radius
  ? { distance: Math.abs(p.y), point: { x: p.x, y: 0, z: p.z }, chunkId: 'ground', surfaceId: 'ground' } : null };
const player = (): FlightState => createFlightState({ position: { x: 0, y: 24, z: 120 }, yaw: 0 });

describe('local autonomous companion team', () => {
  it.each([1,2,3])('keeps %s independent agents following through boost and a reversal', count => {
    const team = new CompanionTeam(); team.configure(normalizeCompanions({ count })); let pilot = player(); team.reset(pilot, ground);
    const start = team.agents.map(a => ({ ...a.flight.position }));
    let minimumSeparation = Infinity;
    for (let step = 0; step < 2400; step++) {
      const t = step / 120;
      pilot = stepFlight(pilot, { pitch: t > 8 && t < 10 ? 0.2 : 0, roll: t > 5 && t < 8 ? 0.7 : 0, yaw: 0, boost: t < 4 }, 1 / 120);
      team.step(pilot, ground, 1 / 120);
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
        minimumSeparation = Math.min(minimumSeparation, distance(team.agents[a].flight.position, team.agents[b].flight.position));
      }
    }
    expect(team.agents).toHaveLength(count);
    expect(minimumSeparation).toBeGreaterThan(6.4);
    for (const [index, agent] of team.agents.entries()) {
      expect(agent.flight.position).not.toEqual(start[index]);
      expect(agent.decisions).toBeGreaterThan(90);
      expect(distance(agent.flight.position, pilot.position)).toBeLessThan(150);
      expect(Object.values(agent.flight.position).every(Number.isFinite)).toBe(true);
    }
  });
  it('avoids a thin wall using shared spatial queries and never crosses it', () => {
    const wall: CompanionWorld = { queryNearest: (p, radius) => Math.abs(p.z) <= radius
      ? { distance: Math.abs(p.z), point: { x: p.x, y: p.y, z: 0 }, chunkId: 'wall', surfaceId: 'wall' } : null };
    const team = new CompanionTeam();team.configure(normalizeCompanions({ count: 3 }));
    const pilot = player();team.reset(pilot, wall);
    let minimum = Infinity;
    for (let step = 0; step < 1200; step++) {
      const moving = { ...pilot, position: { ...pilot.position, z: 50 - step / 5 } };
      team.step(moving, wall, 1 / 120);
      for (const agent of team.agents) minimum = Math.min(minimum, agent.flight.position.z);
    }
    expect(minimum).toBeGreaterThanOrEqual(3.2);
    expect(team.events.some(event => event.task === 'AVOID' || event.event === 'impact')).toBe(true);
  });
  it('bounds memory and resets exactly once across a 15-minute flight and rapid retries', () => {
    const team = new CompanionTeam();team.configure(normalizeCompanions({ count: 3 }));let pilot = player();team.reset(pilot, ground);
    for (let step = 0; step < 900 * 120; step++) {
      pilot = { ...pilot, position: { x: Math.sin(step / 4000) * 500, y: 24, z: 120 - step * 0.55 },
        velocity: { x: 0, y: 0, z: -66 } };
      team.step(pilot, ground, 1 / 120);
    }
    expect(team.agents).toHaveLength(3);expect(team.events.length).toBeLessThanOrEqual(256);
    for (let retry = 0; retry < 30; retry++) team.reset(player(), ground);
    expect(team.agents.map(agent => agent.id)).toEqual([1,2,3]);
    expect(team.events).toHaveLength(3);team.dispose();expect(team.agents).toHaveLength(0);
  });
  it('supports independent, leader, formation switches and coordinate relocation', () => {
    const team = new CompanionTeam();team.configure(normalizeCompanions({ count: 3, behavior: 'lead' }));const pilot = player();team.reset(pilot, ground);
    team.step(pilot, ground, 1 / 120);expect(team.agents[0].task).toBe('LEAD');
    const before = team.agents.map(agent => ({ ...agent.flight.position }));
    team.relocate({ x: 13000, y: 0, z: -15000 });
    expect(team.agents[0].flight.position.x - before[0].x).toBe(13000);
    team.configure(normalizeCompanions({ count: 3, behavior: 'independent', formation: 'spread' }));
    team.step({ ...pilot, position: { x: 13000, y: 24, z: -14880 } }, ground, 1 / 120);
    expect(team.agents.every(agent => agent.task === 'INDEPENDENT_FOLLOW')).toBe(true);
  });
  it('suspends safely outside loaded collision coverage and limits expensive leader planning', () => {
    let queries = 0;
    const world: CompanionWorld = { isCollisionCovered: () => true, queryNearest: (p,r) => { queries++;return ground.queryNearest(p,r); } };
    const team=new CompanionTeam();team.configure(normalizeCompanions({ count: 1, behavior: 'lead' }));const pilot=player();team.reset(pilot,world);queries=0;
    for(let i=0;i<120;i++)team.step(pilot,world,1/120);
    expect(queries).toBeLessThan(600);
    const before={...team.agents[0].flight.position};
    team.step(pilot,{...world,isCollisionCovered:()=>false},1/120);
    expect(team.agents[0].flight.position).toEqual(before);expect(team.agents[0].task).toBe('RECOVER');
  });
  it('deploys without overlapping the pilot or teammates in a narrow corridor', () => {
    const corridor: CompanionWorld = { queryNearest: (p,radius) => {
      const x=p.x<0?-9:9;const gap=Math.abs(p.x-x);
      return gap<=radius?{distance:gap,point:{x,y:p.y,z:p.z},chunkId:'corridor',surfaceId:'wall'}:null;
    } };
    const pilot=player();const team=new CompanionTeam();team.configure(normalizeCompanions({count:3,formation:'spread'}));team.reset(pilot,corridor);
    for(const agent of team.agents) expect(distance(agent.flight.position,pilot.position)).toBeGreaterThanOrEqual(11);
    for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)expect(distance(team.agents[a].flight.position,team.agents[b].flight.position)).toBeGreaterThanOrEqual(11);
  });
  it('defers deployment while there is no safe geometric slot', () => {
    const team = new CompanionTeam();team.configure(normalizeCompanions({count:3}));const pilot=player();
    team.reset(pilot,{queryNearest:p=>({distance:0,point:p,chunkId:'solid',surfaceId:'solid'})});
    expect(team.agents.every(agent=>!agent.deployed)).toBe(true);
    team.step(pilot,ground,0.2);expect(team.agents.every(agent=>agent.deployed)).toBe(true);
  });
});
