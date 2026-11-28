import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh } from 'three';
import { writeFileSync } from 'node:fs';
import { ImportedWorldAdapter } from '../../src/world/imports/importedWorldAdapter';
import { analyzeWorldScene } from '../../src/world/imports/sceneAnalyzer';
import { defaultWorldImportOptions as options } from '../../src/world/imports/worldManifest';
import { readMotionSemantic, type MotionSemanticCandidate } from '../../src/world/motionSemantic';
import { SymbiosisRuntime } from '../../src/ai/SymbiosisRuntime';
import { CompanionTeam } from '../../src/companions/AgentController';
import { createFlightState } from '../../src/flight/flightModel';
import { createRunRules } from '../../src/game/runRules';
import { missionCommand } from '../../src/ai/missionCommands';
import { clearApproach } from '../../src/ai/flightClearance';
import { distance } from '../../src/core/math';
import { ChunkedWorldAdapter } from '../../src/world/chunkedWorldAdapter';
import type { CompanionWorld } from '../../src/companions/AgentController';

function district(wall = false) {
  const scene = new Group(), deck = new Mesh(new BoxGeometry(240, 2, 300));
  deck.position.y = -1;
  scene.add(deck);
  const mark = (id: string, kind: string, capabilities: string[], x: number, y: number, z: number) => {
    const node = new Group();
    node.position.set(x, y, z);
    node.userData.motionSemantic = { version: 1, id, kind, capabilities };
    scene.add(node);
  };
  mark('private-deck', 'surface', ['glide'], 0, 0, 30);
  mark('private-landing', 'landmark', ['guide', 'observe'], 0, 0, 30);
  mark('private-out', 'escape', ['release'], 14, 6, 28);
  mark('private-fork', 'socket', ['scout'], -14, 6, 28);
  mark('absent-geometry', 'landmark', ['observe'], 0, 120, 0);
  mark('duplicate', 'socket', ['guide'], 3, 33, 0);
  mark('duplicate', 'socket', ['guide'], 8, 33, 0);
  if (wall) {
    const obstacle = new Mesh(new BoxGeometry(235, 110, 0.15));
    obstacle.position.set(0, 44, 0);
    obstacle.userData.skimmerRole = 'OBSTACLE';
    scene.add(obstacle);
  }
  const analyzed = analyzeWorldScene(scene, options);
  const world = new ImportedWorldAdapter({ id: 'a'.repeat(64), name: 'Test deck', options,
    bytes: 100, nodes: analyzed.nodes, triangles: analyzed.triangles,
    collisionTriangles: analyzed.collisionTriangles, materials: 1, textures: 0, texturePixels: 0,
    bounds: { x: 240, y: 2, z: 300 }, animations: [], meshRoles: analyzed.meshRoles }, analyzed, [scene]);
  const player = createFlightState({ position: { x: 0, y: 35, z: 42 }, yaw: 0 });
  const team = new CompanionTeam();
  team.configure({ count: 3, formation: 'wedge', behavior: 'independent' });
  team.reset(player, world);
  const runtime = new SymbiosisRuntime(team), rules = createRunRules({ mode: 'free', assisted: true });
  const travelled = [0, 0, 0];
  const advance = (steps: number) => {
    for (let i = 0; i < steps; i++) {
      const previous = team.agents.map(a => a.flight.position);
      team.step(player, world, 1/120);
      team.agents.forEach((a, i) => { travelled[i] += distance(previous[i]!, a.flight.position); });
      runtime.step(player, rules, world, 42, 1/120);
    }
  };
  advance(1);
  return { world, team, runtime, player, advance, travelled };
}

describe('semantic mission registration and steering', () => {
  it('surveys across two real chunk BVHs and rechecks the full glide strip after eviction and regeneration', async () => {
    const bvh = new ChunkedWorldAdapter();
    const deck = (name: string, center: number, y: number) => {
      const mesh = new BoxGeometry(200, 2, 120).translate(0, y - 1, center);
      mesh.computeBoundingBox();
      bvh.addChunk({ id: name, chunkX: 0, chunkZ: center > 0 ? 0 : -1, origin: { x: 0, y: 0, z: 0 },
        bounds: mesh.boundingBox!, geometry: mesh });
      return mesh;
    };
    const home = deck('south', 60, 0), neighbor = deck('north', -60, 0);
    let lease = 'r1';
    const world: CompanionWorld = {
      queryNearest: bvh.queryNearest.bind(bvh), queryGlide: bvh.queryGlide.bind(bvh),
      isCollisionCovered: p => bvh.hasChunk(p.z < 0 ? 'north' : 'south'),
      semanticCandidates: () => [{ lease, semantic: { version: 1, id: 'seam-deck', kind: 'surface', capabilities: ['glide'] },
        position: { x: 0, y: 0, z: 8 } }],
    };
    const player = createFlightState({ position: { x: 0, y: 34, z: 42 }, yaw: 0 });
    const team = new CompanionTeam();
    team.configure({ count: 1, formation: 'wedge', behavior: 'formation' });
    team.reset(player, world);
    const runtime = new SymbiosisRuntime(team), rules = createRunRules({ mode: 'free' });
    let crossed = false;
    const fly = (seconds: number) => {
      for (let i = 0; i < seconds * 120; i++) {
        team.step(player, world, 1/120);
        runtime.step(player, rules, world, 42, 1/120);
        crossed ||= team.agents[0]!.flight.position.z < 0;
      }
    };
    fly(0.02);
    await runtime.sendDialogue('find a glide route', false);
    fly(24);
    expect(crossed).toBe(true);
    expect(runtime.snapshot().missions.at(-1)).toMatchObject({ outcome: 'completed', observed: 'glide-route' });
    await runtime.sendDialogue('find a glide route', false);
    bvh.removeChunk('north');
    fly(0.5);
    lease = 'r2';
    const rebuilt = deck('north', -60, -20);
    fly(3);
    expect(runtime.snapshot().missions.at(-1)).toMatchObject({ outcome: 'failed', reason: 'target-unloaded' });
    bvh.dispose();
    for (const mesh of [home, neighbor, rebuilt]) mesh.dispose();
  });

  it('projects the v1 contract, ignores ambiguous identities, and rejects unsupported or obstructed claims', () => {
    const valid = { version: 1, id: 'x', kind: 'surface', capabilities: ['glide'] };
    expect(readMotionSemantic({ ...valid, prompt: 'private' })).toEqual(valid);
    for (const patch of [{ version: 2 }, { kind: 'system' }, { id: 'do something!' }, { capabilities: ['fly'] }, { capabilities: ['glide', 'glide'] }])
      expect(readMotionSemantic({ ...valid, ...patch })).toBeUndefined();
    const { world, player, runtime } = district(true);
    expect(world.semanticCandidates(player.position).some(c => c.semantic.id === 'duplicate')).toBe(false);
    const p = runtime.perception()!;
    expect(JSON.stringify(p)).not.toMatch(/private-|absent-geometry|duplicate/);
    expect(p.targets.some(t => t.semanticKind === 'escape')).toBe(false);
    expect(p.targets.some(t => t.semanticKind === 'socket')).toBe(false);
    expect(clearApproach(world, { x: 0, y: 35, z: 5 }, { x: 0, y: 35, z: -5 })).toBe(false);
    world.dispose();
    expect(world.semanticCandidates(player.position)).toEqual([]);
  });

  it('flies independent Navigator, Guardian and Explorer assignments, returns and guides the pilot', async () => {
    const { world, runtime, advance, travelled, team } = district();
    const p = runtime.perception()!;
    const text = 'find a glide route; find escape space; scout a branch';
    const plan = missionCommand(text, p)!;
    expect(plan.missions.map(m => m.agentIds[0])).toEqual([1, 2, 3]);
    expect(plan.missions.map(m => p.targets.find(t => t.id === m.targetId)?.semanticKind)).toEqual(['surface', 'escape', 'socket']);
    await runtime.sendDialogue(text, false);
    advance(120 * 32);
    const result = runtime.snapshot().missions;
    expect([...result].sort((a,b) => a.agentId - b.agentId).map(m => [m.agentId, m.observed, m.outcome])).toEqual([
      [1, 'glide-route', 'completed'], [2, 'escape', 'completed'], [3, 'branch', 'completed'],
    ]);
    await runtime.sendDialogue('guide me to the landmark', false);
    advance(120 * 20);
    expect(runtime.snapshot().missions.at(-1)).toMatchObject({ type: 'GUIDE_LANDMARK', observed: 'guided-landmark', outcome: 'completed' });
    expect(team.agents.map(a => a.impacts)).toEqual([0,0,0]);
    expect(travelled.every(d => d > 40)).toBe(true);
    if (process.env.SKIMMER_SEMANTIC_EVIDENCE) writeFileSync(process.env.SKIMMER_SEMANTIC_EVIDENCE, JSON.stringify({
      fixture: '240 x 300 metre imported collision deck with four v1 semantic anchors', fixedHz: 120,
      player: 'stationary at (0,35,42)', wingmateBehavior: 'independent', steps: 6241,
      missions: runtime.snapshot().missions, travelledMetres: travelled, impacts: team.agents.map(a => a.impacts),
    }, null, 2) + '\n');
    world.dispose();
  });

  it('runs all three independent roles locally and lets a pilot replace only the addressed assignment', async () => {
    const { world, runtime, advance } = district();
    advance(120*9);
    expect(runtime.snapshot().missions.map(m => [m.agentId, m.priority])).toEqual([[1,'local'],[2,'local'],[3,'local']]);
    await runtime.sendDialogue('KITE-2 wait 2 seconds then regroup', false);
    expect(runtime.snapshot().missions.find(m => m.agentId === 2 && m.type === 'FIND_ESCAPE')?.reason).toBe('replaced');
    advance(120*32);
    expect(runtime.snapshot().missions.filter(m => m.outcome === 'completed').map(m => m.agentId).sort()).toEqual([1,2,3]);
    world.dispose();
  });

  it('can survey a verified parallel strip when nearby authored sockets give no explicit glide hint', () => {
    const { world, runtime, advance } = district();
    const candidates = world.semanticCandidates.bind(world);
    world.semanticCandidates = p => candidates(p).filter(c => c.semantic.kind !== 'surface');
    advance(120*42);
    expect(runtime.snapshot().missions.find(m => m.agentId === 1)).toMatchObject({
      priority: 'local', type: 'FIND_GLIDE_ROUTE', observed: 'glide-route', outcome: 'completed',
    });
    world.dispose();
  });

  it('discards stale proposals, clears an unloaded target and only rebinds after a fresh geometric check', async () => {
    const { world, runtime, advance } = district();
    const candidates = world.semanticCandidates.bind(world);
    let lease = 'first', loaded = true;
    world.semanticCandidates = p => loaded ? candidates(p).map((c: MotionSemanticCandidate) => ({ ...c, lease })) : [];
    const before = runtime.perception()!, proposal = missionCommand('scout a branch', before)!;
    lease = 'second';
    expect(runtime.replay(proposal, before)).toBe(false);
    await runtime.sendDialogue('scout a branch', false);
    const original = runtime.snapshot().missions[0]!;
    loaded = false;
    advance(60);
    expect(runtime.snapshot().missions.at(-1)?.outcome).toBe('running');
    loaded = true; lease = 'third';
    advance(60);
    expect(runtime.snapshot().missions.at(-1)?.targetId).not.toBe(original.targetId);
    runtime.invalidate();
    advance(1);
    expect(runtime.snapshot().missions.at(-1)?.reason).toBe('world-changed');
    expect(runtime.replay(proposal, before)).toBe(false);
    await runtime.sendDialogue('find escape space', false);
    loaded = false;
    advance(120*3);
    expect(runtime.snapshot().missions.at(-1)).toMatchObject({ outcome: 'failed', reason: 'target-unloaded' });
    loaded = true;
    const old = runtime.perception()!;
    runtime.step(createFlightState({ position: { x: 0, y: 35, z: 42 }, yaw: 0 }),
      createRunRules({ mode: 'free' }), { queryNearest: () => null }, 43, 1/120);
    expect(runtime.replay(missionCommand('scout a branch', old), old)).toBe(false);
    world.dispose();
  });
});
