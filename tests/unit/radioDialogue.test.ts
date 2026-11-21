import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL_CONFIG } from '../../src/ai/contracts';
import { ModelClient } from '../../src/ai/modelClient';
import { localRadioIntent } from '../../src/ai/radioCommands';
import { RadioDialogue } from '../../src/ai/radioDialogue';
import { SymbiosisRuntime } from '../../src/ai/SymbiosisRuntime';
import { CompanionTeam, type CompanionWorld } from '../../src/companions/AgentController';
import { createFlightState } from '../../src/flight/flightModel';
import { createRunRules } from '../../src/game/runRules';

const ground: CompanionWorld = {
  isCollisionCovered: () => true,
  queryNearest: (p, r) => Math.abs(p.y) <= r ? { distance: Math.abs(p.y), point: { ...p, y: 0 }, chunkId: 'ground', surfaceId: 'ground' } : null,
};
const fixture = (client = new ModelClient()) => {
  const player = createFlightState({ position: { x: 0, y: 52, z: 0 }, yaw: 0 });
  const team = new CompanionTeam();
  team.configure({ count: 3, behavior: 'formation', formation: 'wedge' });
  team.reset(player, ground);
  const runtime = new SymbiosisRuntime(team, client);
  const rules = createRunRules({ mode: 'free', assisted: true });
  runtime.step(player, rules, ground, 334458, 1 / 120);
  const advance = (steps: number) => {
    for (let step = 0; step < steps; step++) {
      team.step(player, ground, 1 / 120);
      runtime.step(player, rules, ground, 334458, 1 / 120);
    }
  };
  return { player, team, runtime, advance };
};

describe('bounded team radio', () => {
  it('prioritizes a risk report, keeps one subtitle and bounds history and queued lines', () => {
    const radio = new RadioDialogue();
    radio.report(1, 'Lead report', 'local', 'notice', 0);
    radio.report(3, 'Weather report', 'local', 'notice', 0);
    radio.report(2, 'Avoid the wall', 'local', 'risk', 1);
    expect(radio.snapshot().active?.agent).toBe(2);
    for (let index = 0; index < 60; index++) radio.report(1, `reply ${index}`, 'local', 'reply', 1);
    expect(radio.snapshot().queued).toBe(4);
    expect(radio.snapshot().history).toHaveLength(32);
    radio.step(8);
    expect(radio.snapshot().active?.priority).toBe('reply');
    radio.setMuted(true);
    radio.report(2, 'Another hazard', 'local', 'risk', 9);
    expect(radio.snapshot().active).toBeNull();
    expect(radio.snapshot().history.at(-1)?.text).toBe('Another hazard');
  });

  it.each([
    ['跟随我', 'FOLLOW', null], ['一号领航', 'LEAD', 'route-ahead'], ['二号去侦察左侧', 'SCOUT', 'route-left'],
    ['全体集合', 'REGROUP', null], ['保持队形', 'FOLLOW', null], ['帮我找安全路线', 'LEAD', 'route-ahead'],
    ['准备 Surface Relay', 'RELAY', 'surface-2'],
  ])('turns %s into a typed order pointing only at a visible target', (message, action, targetId) => {
    const { runtime } = fixture();
    const picture = runtime.perception()!;
    picture.targets.push({ id: 'surface-2', agentId: 2, kind: 'surface', position: { x: 12, y: 20, z: -20 }, clearance: 20 });
    const intent = localRadioIntent(message, picture, 'wedge');
    expect(intent?.plan?.orders[0]).toMatchObject({ action, targetId });
  });

  it('uses the team validator, changes the left scout trajectory and reports measured flight', async () => {
    const { runtime, team, advance } = fixture();
    const comparison = fixture();
    expect(await runtime.sendDialogue('二号去侦察左侧')).toBe(true);
    expect(runtime.lastPlan?.orders[0]).toEqual({ agents: [2], action: 'SCOUT', targetId: 'route-left' });
    advance(240);
    comparison.advance(240);
    expect(team.agents[1]!.flight.position.x).toBeLessThan(comparison.team.agents[1]!.flight.position.x - 10);
    expect(runtime.trace.some(entry => entry.event === 'radio-outcome')).toBe(true);
    expect(runtime.radio.snapshot().history.at(-1)?.text).toContain('已飞行');
  });

  it('falls back on a model error and refuses a pasted session credential', async () => {
    const transport = vi.fn(async () => new Response('', { status: 503 }));
    const client = new ModelClient(transport);
    const key = 'synthetic-radio-private-key';
    client.connect(DEFAULT_MODEL_CONFIG, key);
    const { runtime } = fixture(client);
    expect(await runtime.sendDialogue(key)).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    expect(await runtime.sendDialogue('全体集合')).toBe(true);
    expect(runtime.lastPlan?.orders[0]?.action).toBe('REGROUP');
    expect(runtime.radio.snapshot().history.at(-1)?.source).toBe('local');
    expect(JSON.stringify(runtime.snapshot())).not.toContain(key);
  });

  it('rejects a valid model route that contradicts the current pilot command', async () => {
    const transport: typeof fetch = async (_url, options) => {
      const input = JSON.parse(JSON.parse(String(options?.body)).messages[1].content).perception;
      const plan = { requestId: input.requestId, epoch: input.epoch, ttl: 12, risk: 0.2, formation: 'wedge',
        orders: [{ agents: [1], action: 'LEAD', targetId: 'route-ahead' }], reason: 'Taking point' };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        plan, reply: { agentId: 1, text: 'Taking point.' },
      }) } }] }));
    };
    const client = new ModelClient(transport);
    client.connect(DEFAULT_MODEL_CONFIG, 'synthetic-radio-command');
    const { runtime } = fixture(client);
    expect(await runtime.sendDialogue('全体集合')).toBe(true);
    expect(runtime.trace).toContainEqual(expect.objectContaining({ event: 'decision', data: expect.objectContaining({ validation: 'radio-command-mismatch' }) }));
    expect(runtime.lastPlan?.orders[0]).toEqual({ agents: [1, 2, 3], action: 'REGROUP', targetId: null });
    expect(runtime.radio.snapshot().history.at(-1)?.source).toBe('local');
  });

  it('discards a response that comes back after a world invalidation', async () => {
    let finish!: (value: Response) => void;
    const transport = vi.fn(async () => new Promise<Response>(resolve => { finish = resolve; }));
    const client = new ModelClient(transport);
    client.connect(DEFAULT_MODEL_CONFIG, 'synthetic-radio-cancellation');
    const { runtime, advance } = fixture(client);
    const result = runtime.sendDialogue('一号领航');
    expect(transport).toHaveBeenCalledTimes(1);
    runtime.invalidate();
    advance(1);
    finish(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ plan: null, reply: { agentId: 1, text: 'Stale' } }) } }] })));
    expect(await result).toBe(false);
    expect(runtime.lastPlan).toBeNull();
    expect(runtime.radio.snapshot().history.map(line => line.source)).toEqual(['player']);
  });
});
