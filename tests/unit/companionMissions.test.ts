import { describe, expect, it, vi } from 'vitest';
import { SymbiosisRuntime } from '../../src/ai/SymbiosisRuntime';
import { DEFAULT_MODEL_CONFIG, type Perception } from '../../src/ai/contracts';
import { ModelClient } from '../../src/ai/modelClient';
import type { Assignment, MissionPlan } from '../../src/ai/missions';
import { missionCommand } from '../../src/ai/missionCommands';
import { CompanionTeam, type CompanionWorld } from '../../src/companions/AgentController';
import { createFlightState } from '../../src/flight/flightModel';
import { createRunRules } from '../../src/game/runRules';
import type { Vec3 } from '../../src/core/math';

const flat = (p: Vec3, range: number) =>
  Math.abs(p.y) > range
    ? null
    : {
        distance: Math.abs(p.y),
        point: { ...p, y: 0 },
        chunkId: '0:0',
        surfaceId: 'moving:0:0:garden',
        contact: {
          normal: { x: 0, y: 1, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          localPoint: { ...p, y: 0 },
          triangle: 0,
          geometryId: 'deck',
        },
      };
function setup(count = 3, client = new ModelClient()) {
  const world: CompanionWorld = { isCollisionCovered: () => true, queryNearest: flat, queryGlide: flat };
  const player = createFlightState({ position: { x: 0, y: 34, z: 0 }, yaw: 0 });
  const team = new CompanionTeam();
  team.configure({ count, behavior: 'formation', formation: 'wedge' });
  team.reset(player, world);
  const runtime = new SymbiosisRuntime(team, client);
  runtime.radioLanguage = 'en-US';
  const rules = createRunRules({ mode: 'free', assisted: true });
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 120); i++) {
      team.step(player, world, 1 / 120);
      runtime.step(player, rules, world, 12, 1 / 120);
    }
  };
  advance(0.01);
  return { world, player, team, runtime, rules, advance };
}
const order: Assignment = {
  type: 'WAIT_AND_REGROUP',
  agentIds: [1],
  targetId: null,
  waitSeconds: 2,
  timeoutSeconds: 30,
};
const envelope = (p: Perception, missions: Assignment[]): MissionPlan => ({
  schemaVersion: 2,
  epoch: p.epoch,
  requestId: p.requestId,
  missions,
  dialogue: [],
});
const response = (decision: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));

describe('local mission executive', () => {
  it.each([1, 2, 3])(
    'admits exactly the deployed %i wingmates and verifies a return using real steering',
    async (count) => {
      const { runtime, advance } = setup(count);
      await runtime.sendDialogue('all wingmates wait 2 seconds then regroup', false);
      expect(runtime.snapshot().missions).toHaveLength(count);
      advance(1);
      expect(runtime.snapshot().missions.every((m) => m.phase === 'hold')).toBe(true);
      advance(9);
      expect(
        runtime.snapshot().missions.every((m) => m.reason === 'returned' && m.outcome === 'completed')
      ).toBe(true);
    }
  );
  it('splits English and Mandarin callsigns and keeps unrelated tasks alive on replacement and cancellation', async () => {
    const { runtime, advance } = setup();
    const p = runtime.perception()!;
    const chinese = missionCommand('风筝一号寻找通道，风筝2护航，风筝三号观察浮岛', p);
    expect(chinese?.missions.map((m) => m.type)).toEqual(['FIND_PASSAGE', 'ESCORT', 'INSPECT_LANDMARK']);
    await runtime.sendDialogue('KITE-1 find a passage, KITE-2 escort me and KITE-3 inspect the island', false);
    expect(runtime.snapshot().missions.map((m) => m.type)).toEqual([
      'FIND_PASSAGE',
      'ESCORT',
      'INSPECT_LANDMARK',
    ]);
    advance(0.3);
    await runtime.sendDialogue('KITE-3 patrol', false);
    expect(runtime.snapshot().missions.find((m) => m.type === 'INSPECT_LANDMARK')?.reason).toBe('replaced');
    await runtime.sendDialogue('KITE-1 cancel mission', false);
    expect(
      runtime
        .snapshot()
        .missions.filter((m) => m.outcome === 'running')
        .map((m) => m.agentId)
    ).toEqual([2, 3]);
    await runtime.sendDialogue('KITE-3 follow me', false);
    expect(
      runtime
        .snapshot()
        .missions.filter((m) => m.outcome === 'running')
        .map((m) => m.agentId)
    ).toEqual([2]);
    expect(await runtime.request()).toBe(false);
  });
  it('completes a sampled landmark observation and return, failing if its source disappears', async () => {
    const { runtime, advance, world } = setup();
    await runtime.sendDialogue('KITE-3 inspect the island', false);
    advance(25);
    expect(runtime.snapshot().missions.at(-1)).toMatchObject({
      type: 'INSPECT_LANDMARK',
      outcome: 'completed',
      reason: 'returned',
    });
    await runtime.sendDialogue('KITE-1 find a glide surface', false);
    expect(runtime.snapshot().missions.at(-1)?.type).toBe('FIND_GLIDE_SURFACE');
    world.queryGlide = () => null;
    world.queryNearest = () => null;
    advance(0.3);
    expect(runtime.snapshot().missions.at(-1)).toMatchObject({ outcome: 'failed', reason: 'target-unloaded' });
    expect(runtime.radio.snapshot().history.at(-1)?.text).toContain('target lost');
  });
  it('holds accepted missions through a pause, drops the old world on inversion and retains session history', async () => {
    const { runtime, advance, team } = setup();
    await runtime.sendDialogue('KITE-2 escort', false);
    advance(15);
    expect(runtime.snapshot().missions.at(-1)?.outcome).toBe('running');
    const p = runtime.perception()!;
    runtime.suspend();
    expect(runtime.perception()).toBeNull();
    advance(0.5);
    expect(runtime.snapshot().missions.at(-1)?.outcome).toBe('running');
    expect(runtime.replay(envelope(p, [order]), p)).toBe(false);
    runtime.invalidate();
    advance(0.1);
    expect(runtime.snapshot().missions.at(-1)?.reason).toBe('world-changed');
    expect(runtime.snapshot().dialogueTurns).toBe(1);
    expect(runtime.snapshot().memory.some((e) => e.event === 'cancelled')).toBe(true);
    await runtime.sendDialogue('KITE-3 patrol', false);
    team.agents.pop();
    advance(0.4);
    expect(runtime.snapshot().missions.at(-1)?.reason).toBe('agent-unavailable');
    runtime.reset();
    expect(runtime.snapshot().missions).toEqual([]);
    expect(runtime.snapshot().dialogueTurns).toBe(0);
  });
  it('uses measured formation and target distances for guidance and deadlines', () => {
    const { runtime, advance, player } = setup();
    const p = runtime.perception()!,
      target = p.targets.find((t) => t.id === 'route-ahead')!;
    expect(
      runtime.replay(
        envelope(p, [{ agentIds: [1], type: 'FIND_PASSAGE', targetId: target.id, timeoutSeconds: 30 }]),
        p
      )
    ).toBe(true);
    advance(6);
    expect(runtime.snapshot().missions.at(-1)?.phase).toBe('guide');
    player.position = { ...target.position };
    advance(6);
    expect(runtime.snapshot().missions.at(-1)?.reason).toBe('returned');
    const next = runtime.perception()!;
    expect(
      runtime.replay(
        envelope(next, [{ agentIds: [2], type: 'FIND_PASSAGE', targetId: 'route-ahead', timeoutSeconds: 2 }]),
        next
      )
    ).toBe(true);
    advance(3);
    expect(runtime.snapshot().missions.at(-1)?.reason).toBe('deadline');
  });
  it('checks real Relay eligibility and applies the original finite resource exactly once', () => {
    const { runtime, advance, team } = setup(1);
    team.agents[0]!.flight.position.y = 20;
    const p = runtime.perception()!;
    const cmd = envelope(p, [
      { agentIds: [1], type: 'SURFACE_RELAY', targetId: 'surface-1', timeoutSeconds: 8 },
    ]);
    expect(runtime.replay(cmd, p)).toBe(false);
    runtime.trust.value = 0.8;
    expect(runtime.replay(cmd, p)).toBe(true);
    advance(0.2);
    expect(runtime.relay.charges).toBe(1);
    expect(runtime.snapshot().missions.at(-1)?.reason).toBe('free-flight-training');
  });
  it('rejects schema extensions, model coordinates, stale requests and resource conflicts atomically', () => {
    const { runtime, advance } = setup(2);
    const p = runtime.perception()!,
      cmd = envelope(p, [order]);
    for (const bad of [
      { ...cmd, schemaVersion: 1 },
      { ...cmd, epoch: 12 },
      { ...cmd, requestId: 'x' },
      { ...cmd, missions: [order, order] },
      { ...cmd, missions: [order, { ...order, agentIds: [3] }] },
      { ...cmd, missions: [{ ...order, position: { x: 0, y: 0, z: 0 } }] },
      { ...cmd, missions: [{ ...order, targetId: 'invented' }] },
      { ...cmd, missions: [{ ...order, type: 'CODE' }] },
      { ...cmd, missions: [{ ...order, waitSeconds: 31 }] },
      { ...cmd, missions: [{ ...order, timeoutSeconds: NaN }] },
    ])
      expect(runtime.replay(bad, p)).toBe(false);
    expect(runtime.snapshot().missions).toHaveLength(0);
    advance(12.1);
    expect(runtime.replay(cmd, p)).toBe(false);
    const fresh = runtime.perception()!,
      valid = envelope(fresh, [order]);
    expect(runtime.replay(valid, fresh)).toBe(true);
    expect(runtime.replay(valid, fresh)).toBe(false);
  });
  it('uses distinct safe independent tasks and trusts an explicit command before a role preference', async () => {
    const { runtime, team, advance } = setup();
    team.configure({ ...team.settings, behavior: 'independent' });
    advance(0.25);
    expect(team.agents.every((a) => a.navigationTask === 'INDEPENDENT_FOLLOW')).toBe(true);
    expect(team.agents[0]!.target.z).toBeLessThan(team.agents[1]!.target.z - 10);
    expect(Math.abs(team.agents[2]!.target.x)).toBeGreaterThan(3);
    await runtime.sendDialogue('KITE-2 wait 3 seconds', false);
    advance(0.3);
    expect(team.agents[1]!.navigationTask).toBe('HOLD');
  });
});

describe('bounded cognition', () => {
  it('keeps small talk flight-neutral even when the model proposes a valid order', async () => {
    const client = new ModelClient(async (_url, init) => {
      const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      return response(envelope(input.perception, [order]));
    });
    client.connect(DEFAULT_MODEL_CONFIG, 'mock-test-companion');
    const { runtime } = setup(1, client);
    await runtime.sendDialogue('Why do you follow me?');
    expect(runtime.snapshot().missions).toEqual([]);
    expect(runtime.lastPlan).toBeNull();
    await runtime.sendDialogue('KITE-1 tell me your background', false);
    await runtime.sendDialogue('KITE-1 repeat that', false);
    expect(runtime.radio.snapshot().history.at(-1)?.text).toContain('sky cities');
    for (let i = 0; i < 12; i++) await runtime.sendDialogue('hello', false);
    expect(runtime.snapshot().dialogueTurns).toBe(10);
    expect(JSON.stringify(runtime.trace)).not.toContain('sky cities');
  });
  it('sends preceding authorized turns in the user envelope and recovers from a hallucinated target', async () => {
    const inputs: Array<{
      perception: Perception;
      turns: { pilot: string }[];
      suggestedMissions: Assignment[];
    }> = [];
    let clock = 0;
    const client = new ModelClient(
      async (_url, init) => {
        const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
        inputs.push(input);
        return response({
          ...envelope(
            input.perception,
            input.suggestedMissions.map((m: Assignment) => ({ ...m, targetId: 'fiction' }))
          ),
          dialogue: [{ agentId: 1, text: 'Ready for your call.' }],
        });
      },
      () => clock
    );
    client.connect(DEFAULT_MODEL_CONFIG, 'mock-test-companion');
    const { runtime } = setup(1, client);
    await runtime.sendDialogue('offline-only', false);
    await runtime.sendDialogue('Hello navigator');
    clock += 1000;
    await runtime.sendDialogue('KITE-1 patrol');
    expect(inputs[1]?.turns.map((t) => t.pilot)).toEqual(['Hello navigator']);
    expect(runtime.snapshot().missions.at(-1)?.targetId).toBe('route-ahead');
    expect(
      runtime.trace.some(
        (e) => e.event === 'mission-validation' && JSON.stringify(e.data).includes('target-unavailable')
      )
    ).toBe(true);
  });
  it('reserves capacity for explicit calls, including when voice and autonomous planning share a connection', async () => {
    const transport = vi.fn(async () => response({}));
    let now = 0;
    const client = new ModelClient(transport, () => now);
    client.connect({ ...DEFAULT_MODEL_CONFIG, maxRequests: 3 }, 'mock-test-companion');
    const { runtime } = setup(1, client),
      p = runtime.perception()!;
    expect(await client.request(p, undefined, undefined, undefined, undefined, true)).not.toBeNull();
    now += 10000;
    expect(await client.request(p, undefined, undefined, undefined, undefined, true)).toBeNull();
    expect(await client.request(p, 'Hello')).not.toBeNull();
    await client.requestVoice('tts', '{}', new AbortController().signal);
    expect(client.snapshot().lanes).toEqual({ background: 1, planning: 0, dialogue: 1, asr: 0, tts: 1 });
    await expect(client.requestVoice('asr', new FormData(), new AbortController().signal)).rejects.toThrow(
      'asr-budget'
    );
    expect(client.snapshot().requests).toBe(3);
  });
});
