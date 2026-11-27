import { distance, type Vec3 } from '../core/math';
import type { AgentTask, CompanionTeam, CompanionWorld } from '../companions/AgentController';
import type { Perception } from './contracts';
import { clearApproach, covered, observedHere, type SemanticTargets } from './semanticTargets';

export const missionTypes = [
  'FOLLOW',
  'REGROUP',
  'ESCORT',
  'FIND_PASSAGE',
  'INSPECT_LANDMARK',
  'FIND_GLIDE_SURFACE',
  'WAIT_AND_REGROUP',
  'PATROL',
  'SURFACE_RELAY',
] as const;
export type MissionType = (typeof missionTypes)[number];
export interface Assignment {
  agentIds: number[];
  type: MissionType;
  targetId: string | null;
  timeoutSeconds: number;
  waitSeconds?: number;
}
export interface MissionPlan {
  schemaVersion: 2;
  requestId: string;
  epoch: number;
  dialogue: { agentId: number; text: string }[];
  missions: Assignment[];
}
interface ValidatedAssignment {
  order: Assignment;
  position: Vec3;
  observation?: ReturnType<SemanticTargets['observation']>;
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const exact = (x: Record<string, unknown>, keys: string[]) =>
  Object.keys(x).length === keys.length && keys.every((k) => Object.hasOwn(x, k));
const integer = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
export interface MissionContext {
  team: CompanionTeam;
  world: CompanionWorld;
  time: number;
  epoch: number;
  player: Vec3;
  active: boolean;
  relayReason: (id: number) => string | null;
}
type Decision =
  | { ok: false; reason: string }
  | { ok: true; assignments: ValidatedAssignment[]; dialogue: MissionPlan['dialogue'] };
/** Atomic validation: no member gets a new order if any assignment fails. */
export function validateMissions(
  raw: unknown,
  p: Perception,
  live: MissionContext,
  registry: SemanticTargets,
  used: ReadonlySet<string>
): Decision {
  const fail = (reason: string): Decision => ({ ok: false, reason });
  if (
    !record(raw) ||
    !exact(raw, ['schemaVersion', 'epoch', 'requestId', 'dialogue', 'missions']) ||
    raw.schemaVersion !== 2
  )
    return fail('schema');
  if (!live.active || raw.epoch !== live.epoch || p.epoch !== live.epoch || raw.requestId !== p.requestId)
    return fail('stale-epoch');
  if (live.time < p.time || live.time - p.time >= 12 || used.has(p.requestId)) return fail('expired');
  const available = (id: unknown): id is number =>
    p.agents.some((a) => a.id === id && a.deployed) &&
    live.team.agents.some((a) => a.id === id && a.deployed && !a.uncovered);
  if (
    !Array.isArray(raw.dialogue) ||
    raw.dialogue.length > 3 ||
    !Array.isArray(raw.missions) ||
    raw.missions.length > 3
  )
    return fail('schema');
  const dialogue: MissionPlan['dialogue'] = [];
  for (const line of raw.dialogue) {
    if (
      !record(line) ||
      !exact(line, ['agentId', 'text']) ||
      !available(line.agentId) ||
      typeof line.text !== 'string' ||
      !line.text.trim() ||
      line.text.length > 140 ||
      /[\x00-\x1f]/.test(line.text)
    )
      return fail('dialogue');
    dialogue.push({ agentId: line.agentId, text: line.text });
  }
  const assigned = new Set<number>();
  const assignments: ValidatedAssignment[] = [];
  let relayAssigned = false;
  for (const value of raw.missions) {
    if (
      !record(value) ||
      !exact(value, [
        'agentIds',
        'type',
        'targetId',
        'timeoutSeconds',
        ...(value.waitSeconds !== undefined ? ['waitSeconds'] : []),
      ]) ||
      !missionTypes.includes(value.type as MissionType) ||
      !integer(value.timeoutSeconds, 2, 120)
    )
      return fail('mission-schema');
    const type = value.type as MissionType;
    if (
      value.waitSeconds !== undefined &&
      (type !== 'WAIT_AND_REGROUP' ||
        !integer(value.waitSeconds, 1, 30) ||
        value.waitSeconds >= value.timeoutSeconds)
    )
      return fail('wait-duration');
    if (!Array.isArray(value.agentIds) || !value.agentIds.length || value.agentIds.length > 3)
      return fail('agents');
    for (const id of value.agentIds) {
      if (!available(id)) return fail('agent-unavailable');
      if (assigned.has(id)) return fail('resource-conflict');
      assigned.add(id);
    }
    const target = p.targets.find((t) => t.id === value.targetId);
    let position = live.player;
    if (['FOLLOW', 'REGROUP', 'ESCORT', 'WAIT_AND_REGROUP'].includes(type)) {
      if (value.targetId !== null) return fail('target');
    } else {
      if (!target) return fail('target-unavailable');
      if (
        (type === 'INSPECT_LANDMARK' && !target.capabilities?.includes('inspect')) ||
        (type === 'FIND_GLIDE_SURFACE' && !target.capabilities?.includes('glide')) ||
        (['PATROL', 'FIND_PASSAGE'].includes(type) && target.kind !== 'route')
      )
        return fail('target-kind');
      if (type === 'SURFACE_RELAY') {
        if (
          relayAssigned ||
          target.kind !== 'surface' ||
          value.agentIds.length !== 1 ||
          value.agentIds[0] !== target.agentId
        )
          return fail('relay-target');
        const reason = live.relayReason(value.agentIds[0]);
        if (reason) return fail(reason);
        relayAssigned = true;
      }
      position = target.position;
    }
    const observation = target && registry.observation(target.id);
    if (target?.capabilities?.length && (!observation || !observedHere(live.world, observation)))
      return fail('target-unloaded');
    if (distance(position, live.player) > 350 || !covered(live.world, position)) return fail('target-unloaded');
    for (const id of value.agentIds) {
      const agent = live.team.agents.find((a) => a.id === id)!;
      if (!clearApproach(live.world, agent.flight.position, position)) return fail('unreachable');
    }
    assignments.push({
      order: {
        agentIds: [...value.agentIds],
        type,
        targetId: value.targetId as string | null,
        timeoutSeconds: value.timeoutSeconds,
        ...(typeof value.waitSeconds === 'number' ? { waitSeconds: value.waitSeconds } : {}),
      },
      position: { ...position },
      observation,
    });
  }
  return { ok: true, assignments, dialogue };
}

type Phase = 'approach' | 'observe' | 'guide' | 'hold' | 'formation' | 'return' | 'relay';
const firstPhase: Record<MissionType, Phase> = {
  WAIT_AND_REGROUP: 'hold',
  SURFACE_RELAY: 'relay',
  FOLLOW: 'formation',
  ESCORT: 'formation',
  REGROUP: 'formation',
  FIND_PASSAGE: 'approach',
  FIND_GLIDE_SURFACE: 'approach',
  INSPECT_LANDMARK: 'approach',
  PATROL: 'approach',
};
export interface MissionRecord {
  id: string;
  requestId: string;
  epoch: number;
  agentId: number;
  type: MissionType;
  targetId: string | null;
  phase: Phase;
  priority: 'pilot';
  started: number;
  deadline: number;
  progress: number;
  outcome: 'running' | 'completed' | 'failed' | 'cancelled';
  reason: string | null;
}
interface Running {
  record: MissionRecord;
  assignment: ValidatedAssignment;
  phaseStart: number;
  dwell: number;
  lastTick: number;
}
export class MissionExecutive {
  private running = new Map<number, Running>();
  private history: MissionRecord[] = [];
  public constructor(
    private team: CompanionTeam,
    private report: (result: MissionRecord) => void
  ) {}
  public get busy() {
    return this.running.size > 0;
  }
  public escorting(id: number) {
    return this.running.get(id)?.record.type === 'ESCORT';
  }
  public snapshot() {
    return [...this.history, ...Array.from(this.running.values(), (m) => m.record)].map((r) => ({ ...r }));
  }
  public start(assignments: ValidatedAssignment[], p: Perception, now: number): void {
    for (const a of assignments)
      for (const id of a.order.agentIds) {
        this.cancel([id], 'replaced');
        const type = a.order.type;
        const phase = firstPhase[type];
        const record: MissionRecord = {
          id: `${p.requestId}/${id}`,
          requestId: p.requestId,
          epoch: p.epoch,
          agentId: id,
          type,
          targetId: a.order.targetId,
          priority: 'pilot',
          phase,
          started: now,
          deadline: now + a.order.timeoutSeconds,
          progress: 0,
          outcome: 'running',
          reason: null,
        };
        const assignment =
          phase === 'hold'
            ? { ...a, position: { ...this.team.agents.find((member) => member.id === id)!.flight.position } }
            : a;
        this.running.set(id, { record, assignment, phaseStart: now, dwell: 0, lastTick: now });
      }
  }
  public cancel(ids: readonly number[], reason: string): void {
    for (const id of ids) if (this.running.has(id)) this.finish(id, 'cancelled', reason);
  }
  public invalidate(): void {
    this.cancel([...this.running.keys()], 'world-changed');
  }
  public reset(): void {
    this.invalidate();
    this.history = [];
  }
  private finish(id: number, outcome: MissionRecord['outcome'], reason: string): void {
    const m = this.running.get(id)!;
    this.running.delete(id);
    this.team.clearTarget(id);
    const result = { ...m.record, outcome, reason, progress: outcome === 'completed' ? 1 : m.record.progress };
    this.history.push(result);
    if (this.history.length > 24) this.history.shift();
    this.report(result);
  }
  public tick(live: MissionContext, relay: (id: number) => { success: boolean; reason: string }): void {
    for (const [id, m] of this.running) {
      const r = m.record,
        agent = this.team.agents.find((a) => a.id === id);
      if (!agent?.deployed || agent.uncovered) {
        this.finish(id, 'failed', 'agent-unavailable');
        continue;
      }
      const station = r.type === 'FOLLOW' || r.type === 'ESCORT';
      if (live.time >= r.deadline) {
        const maintained =
          station &&
          m.dwell >= 1 &&
          distance(agent.flight.position, live.player) <= 48 &&
          agent.task !== 'AVOID' &&
          agent.task !== 'RECOVER';
        this.finish(id, maintained ? 'completed' : 'failed', maintained ? 'in-formation' : 'deadline');
        continue;
      }
      const phaseTime = live.time - m.phaseStart;
      if (!station && phaseTime > 35) {
        this.finish(id, 'failed', 'action-timeout');
        continue;
      }
      const elapsed = live.time - m.lastTick;
      m.lastTick = live.time;
      const point = m.assignment.position;
      const targeted = r.targetId !== null && r.phase !== 'return';
      if (
        targeted &&
        (!covered(live.world, point) ||
          (m.assignment.observation && !observedHere(live.world, m.assignment.observation)))
      ) {
        this.finish(id, 'failed', 'target-unloaded');
        continue;
      }
      const near = distance(agent.flight.position, point) <= 24;
      const safe = agent.task !== 'AVOID' && agent.task !== 'RECOVER';
      const inFormation = distance(agent.flight.position, live.player) <= 48 && safe;
      const phase = (next: Phase, progress: number) => {
        r.phase = next;
        r.progress = progress;
        m.phaseStart = live.time;
        m.dwell = 0;
      };
      let task: AgentTask;
      let goal = point;
      switch (r.phase) {
        case 'relay': {
          const result = relay(id);
          this.finish(id, result.success ? 'completed' : 'failed', result.reason);
          continue;
        }
        case 'approach':
          task = 'SCOUT';
          if (!clearApproach(live.world, agent.flight.position, point)) {
            this.finish(id, 'failed', 'unreachable');
            continue;
          }
          if (near && safe) phase(r.type === 'FIND_PASSAGE' ? 'guide' : 'observe', 0.45);
          break;
        case 'observe':
          task = 'HOLD';
          // Arrival is tighter than observation: a fixed-wing aircraft continues to circle.
          m.dwell =
            safe &&
            distance(agent.flight.position, point) <= 40 &&
            clearApproach(live.world, agent.flight.position, point)
              ? m.dwell + elapsed
              : 0;
          if (m.dwell >= 1) phase('return', 0.75);
          break;
        case 'guide':
          task = 'LEAD';
          if (safe && distance(live.player, point) <= 40) phase('return', 0.75);
          break;
        case 'hold':
          task = 'HOLD';
          if (phaseTime >= (m.assignment.order.waitSeconds ?? 1)) phase('return', 0.6);
          break;
        default:
          task = 'FORMATION_FOLLOW';
          if (r.type === 'ESCORT') task = 'PROTECT';
          if (r.phase === 'return' || r.type === 'REGROUP') task = 'REGROUP';
          goal = live.player;
          m.dwell = inFormation ? m.dwell + elapsed : 0;
          if (station) r.progress = Math.min(0.99, (live.time - r.started) / (r.deadline - r.started));
          if (!station && m.dwell >= 0.4) {
            this.finish(id, 'completed', r.phase === 'return' ? 'returned' : 'in-formation');
            continue;
          }
      }
      this.team.setTarget(
        id,
        goal,
        task,
        0.65,
        r.targetId === 'route-left' ? -1 : r.targetId === 'route-right' ? 1 : 0
      );
    }
  }
}
