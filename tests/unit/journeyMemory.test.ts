import { describe, it, expect, vi } from 'vitest';
import { JOURNEY_KEY, JourneyMemory } from '../../src/ai/journeyMemory';
import { SymbiosisRuntime } from '../../src/ai/SymbiosisRuntime';
import { CompanionTeam } from '../../src/companions/AgentController';
import { ModelClient } from '../../src/ai/modelClient';
import { DEFAULT_MODEL_CONFIG } from '../../src/ai/contracts';
import { createFlightState } from '../../src/flight/flightModel';
import { createRunRules } from '../../src/game/runRules';

const world = { realm: 'city', seed: 42, fingerprint: 123 } as const;
function fixture() {
  const rows = new Map<string, string>();
  const storage = { getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
  let now = 1700000000000;
  const open = () => new JourneyMemory(() => storage, () => now, async write => write());
  return { rows, open, clock: () => now, advance: (ms: number) => { now += ms; } };
}

describe('on-device Journey Memory v1', () => {
  it('starts without storage, bounds by age and count, and honors erase and opt-out across sessions', async () => {
    const f = fixture(), journal = f.open(), other = f.open();
    await journal.prune();
    await journal.remember(world, 'visit', 'visit', 0);
    expect(f.rows.size).toBe(0);
    await journal.configure({ enabled: true, capacity: 2, retentionDays: 1 });
    for (const detail of ['glide', 'crossing', 'glide'] as const) {
      f.advance(1000);
      await journal.remember(world, 'maneuver', detail, 1);
    }
    expect(other.snapshot().entries.map(e => e.detail)).toEqual(['crossing', 'glide']);
    await other.forget(journal.snapshot().entries[0]!.id);
    await journal.configure({ shareWithModel: true });
    await other.configure({ enabled: false });
    await journal.remember(world, 'dialogue', 'radio-contact', 1);
    expect(other.snapshot()).toMatchObject({ enabled: false, shareWithModel: false, entries: [{ detail: 'glide' }] });
    f.advance(86_400_001);
    await journal.prune();
    expect(JSON.parse(f.rows.get(JOURNEY_KEY)!).entries).toEqual([]);
    await journal.configure({ enabled: true });
    await journal.remember(world, 'visit', 'visit', 0);
    await other.clear();
    expect(journal.snapshot().entries).toHaveLength(0);
  });
  it('reprojects all input, strips private fields, preserves unknown versions and handles quota denial', async () => {
    const f = fixture(), journal = f.open();
    await journal.configure({ enabled: true });
    await journal.remember(world, 'visit', 'visit', 0);
    const before = journal.snapshot(), entry = before.entries[0]!;
    f.rows.set(JOURNEY_KEY, JSON.stringify({ ...before, apiKey: 'secret', entries: [
      { ...entry, raw: 'secret', world: { ...world, name: 'secret', x: 10 } },
      { ...entry, id: 'secret' }, { ...entry, at: Infinity }, { ...entry, detail: 'secret' },
    ] }));
    await journal.prune();
    expect(journal.snapshot()).toEqual(before);
    expect(f.rows.get(JOURNEY_KEY)).not.toContain('secret');
    f.rows.set(JOURNEY_KEY, '{"version":2}');
    expect(await journal.configure({ enabled: true })).toBe(false);
    expect(f.rows.get(JOURNEY_KEY)).toBe('{"version":2}');
    await journal.clear();
    expect(f.rows.size).toBe(0);
    const denied = new JourneyMemory(() => { throw Error('quota'); });
    expect(await denied.configure({ enabled: true })).toBe(false);
    expect(denied.snapshot().enabled).toBe(false);
  });
  it('recalls locally and restricts a separately authorized model request to six nonspatial summaries', async () => {
    const f = fixture(), journal = f.open();
    let requestBody = '';
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)).messages[1].content;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"observation":1}' } }] }));
    });
    const client = new ModelClient(transport, f.clock);
    client.connect(DEFAULT_MODEL_CONFIG, 'unit-test-credential');
    const player = createFlightState({ position: { x: 0, y: 34, z: 0 }, yaw: 0 });
    const team = new CompanionTeam(), geometry = { queryNearest: () => null };
    team.configure({ count: 3, formation: 'wedge', behavior: 'formation' });
    team.reset(player, geometry);
    const runtime = new SymbiosisRuntime(team, client, journal);
    await journal.configure({ enabled: true });
    runtime.enterWorld(world);
    runtime.step(player, createRunRules({ mode: 'free' }), geometry, 42, 1/120);
    await runtime.sendDialogue('remember this conversation my private words', false);
    await runtime.sendDialogue('what do you remember from past flights?');
    expect(transport).not.toHaveBeenCalled();
    expect(runtime.radio.snapshot().history.at(-1)).toMatchObject({ event: 'journey-recall', text: expect.stringContaining('radio contact') });
    await journal.configure({ shareWithModel: true });
    await runtime.sendDialogue('what do you remember from past flights?');
    const payload = JSON.parse(requestBody);
    expect(Object.keys(payload)).toEqual(['historicalObservations']);
    expect(payload.historicalObservations[1]).toEqual({ realm: 'city', event: 'visit', detail: 'visit', agent: 0 });
    expect(runtime.radio.snapshot().history.at(-1)?.text).toContain('Visited world');
    await journal.configure({ enabled: false });
    f.advance(1000);
    await runtime.sendDialogue('what do you remember from past flights?');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(runtime.radio.snapshot().history.at(-1)?.text).toContain('off');
    expect(requestBody + f.rows.get(JOURNEY_KEY)).not.toMatch(/private words|unit-test-credential/);
    const p = runtime.perception()!;
    expect(runtime.replay({ schemaVersion: 2, requestId: p.requestId, epoch: p.epoch, dialogue: [],
      missions: [{ agentIds: [1], type: 'PATROL', targetId: journal.snapshot().entries[0]!.id, timeoutSeconds: 12 }] }, p)).toBe(false);
  });
});
