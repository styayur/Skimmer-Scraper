import { clamp, distance, forwardFromAttitude, type Vec3 } from '../core/math';
import { createFlightState, type FlightState } from '../flight/flightModel';
import { resolveShield } from '../game/shield';
import type { SurfaceProvider } from '../world/worldTypes';
import { normalizeCompanions, type CompanionSettings } from './settings';

export type AgentTask = 'FORMATION_FOLLOW' | 'INDEPENDENT_FOLLOW' | 'LEAD' | 'REGROUP' | 'AVOID' | 'RECOVER';
export interface CompanionWorld extends SurfaceProvider {
  isCollisionCovered?(position: Vec3): boolean;
  isCompanionCovered?(position: Vec3): boolean;
}
export interface AgentState {
  id: number;
  callsign: string;
  flight: FlightState;
  task: AgentTask;
  navigationTask: AgentTask;
  target: Vec3;
  surfaceDistance: number | null;
  avoidance: Vec3;
  perceptionIn: number;
  avoidanceFor: number;
  impacts: number;
  decisions: number;
  uncovered: boolean;
  deployed: boolean;
}
export interface CompanionEvent { time: number; agent: number; event: 'spawn' | 'task' | 'impact' | 'coverage'; task: AgentTask }
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: Vec3, n: number): Vec3 => ({ x: v.x * n, y: v.y * n, z: v.z * n });
const unit = (v: Vec3): Vec3 => scale(v, 1 / (Math.hypot(v.x, v.y, v.z) || 1));
const limit = (v: Vec3, max: number): Vec3 => scale(v, Math.min(1, max / (Math.hypot(v.x, v.y, v.z) || 1)));
const covered = (world: CompanionWorld, position: Vec3): boolean =>
  (world.isCompanionCovered?.(position) ?? world.isCollisionCovered?.(position)) !== false;

/** Independent fixed-step steering agents. No renderer, storage, world instances or BVHs. */
export class CompanionTeam {
  public agents: AgentState[] = [];
  public elapsed = 0;
  public events: CompanionEvent[] = [];
  public settings: CompanionSettings = normalizeCompanions();
  private overrides = new Map<number, { target: Vec3; task: AgentTask; expires: number }>();
  public configure(settings: CompanionSettings): void {
    this.settings = normalizeCompanions(settings);
    for (const agent of this.agents) agent.perceptionIn = 0;
  }
  public reset(player: FlightState, world: CompanionWorld): void {
    this.agents = []; this.elapsed = 0; this.events = []; this.overrides.clear();
    for (let index = 0; index < this.settings.count; index++) {
      const id = index + 1;
      const position = this.safeSpawn(player, id, world);
      const flight = createFlightState({ position: position ?? { ...player.position }, yaw: player.attitude.yaw, pitch: player.attitude.pitch, speed: player.speed });
      const agent: AgentState = { id, callsign: `KITE-${id}`, flight, task: position ? 'FORMATION_FOLLOW' : 'RECOVER', navigationTask: 'FORMATION_FOLLOW', target: { ...flight.position },
        surfaceDistance: null, avoidance: { x: 0, y: 0, z: 0 }, perceptionIn: index * 0.05,
        avoidanceFor: 0, impacts: 0, decisions: 0, uncovered: !position || !covered(world, position), deployed: position !== null };
      this.agents.push(agent); this.record(agent, position ? 'spawn' : 'coverage');
    }
  }
  public setTarget(id: number, target: Vec3, task: AgentTask, ttl: number): boolean {
    if (!this.agents.some(agent => agent.id === id && agent.deployed) || !Object.values(target).every(Number.isFinite) || !Number.isFinite(ttl) || ttl <= 0) return false;
    this.overrides.set(id, { target: { ...target }, task, expires: this.elapsed + clamp(ttl, 0.1, 15) });
    this.agents.find(agent => agent.id === id)!.perceptionIn = 0;
    return true;
  }
  public clearTargets(): void { this.overrides.clear(); for (const agent of this.agents) agent.perceptionIn = 0; }
  public relocate(delta: Vec3): void {
    for (const agent of this.agents) {
      agent.flight = { ...agent.flight, position: add(agent.flight.position, delta) };
      agent.target = add(agent.target, delta); agent.perceptionIn = 0;
    }
    this.overrides.clear();
  }
  public dispose(): void { this.agents = []; this.events = []; this.overrides.clear(); }
  public step(player: FlightState, world: CompanionWorld, dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.elapsed += dt;
    // Decisions read the same team snapshot, avoiding iteration-order separation bias.
    const positions = this.agents.map(agent => ({ id: agent.id, position: { ...agent.flight.position }, velocity: { ...agent.flight.velocity } }));
    for (const agent of this.agents) {
      if (!agent.deployed) {
        agent.perceptionIn -= dt;
        if (agent.perceptionIn > 0) continue;
        agent.perceptionIn = 0.2;
        const spawn = this.safeSpawn(player, agent.id, world);
        if (!spawn) continue;
        agent.flight = createFlightState({ position: spawn, yaw: player.attitude.yaw, pitch: player.attitude.pitch, speed: player.speed });
        agent.deployed = true; agent.uncovered = false; this.record(agent, 'spawn');
      }
      if (!covered(world, agent.flight.position)) {
        if (!agent.uncovered) { agent.uncovered = true; this.record(agent, 'coverage'); }
        this.task(agent, 'RECOVER'); continue;
      }
      agent.uncovered = false;
      agent.perceptionIn -= dt;
      agent.avoidanceFor = Math.max(0, agent.avoidanceFor - dt);
      const perceiveNow = agent.perceptionIn <= 0;
      if (perceiveNow) { this.perceive(agent, player, world); agent.perceptionIn += 0.2; }
      const override = this.overrides.get(agent.id);
      if (override && override.expires <= this.elapsed) this.overrides.delete(agent.id);
      let task: AgentTask = this.settings.behavior === 'independent' ? 'INDEPENDENT_FOLLOW' : 'FORMATION_FOLLOW';
      let target = agent.target;
      if (perceiveNow) {
        target = this.formationTarget(player, agent.id);
        if (this.settings.behavior === 'lead' && agent.id === 1) { task = 'LEAD'; target = this.safeRoute(player, world, agent.id); }
        if (override && override.expires > this.elapsed) { task = override.task; target = { ...override.target }; }
        if (distance(agent.flight.position, player.position) > 135) { task = 'REGROUP'; target = this.formationTarget(player, agent.id); }
        const goalHit = world.queryNearest(target, 9);
        if (goalHit && goalHit.distance < 8) {
          target = add(goalHit.point, scale(unit(sub(target, goalHit.point)), 13)); task = 'RECOVER';
        }
        agent.navigationTask = task;
      } else if ((!override || override.expires <= this.elapsed) &&
        ['FORMATION_FOLLOW', 'INDEPENDENT_FOLLOW', 'REGROUP'].includes(agent.navigationTask)) {
        target = this.formationTarget(player, agent.id);
      }
      agent.target = target; this.task(agent, agent.avoidanceFor > 0 ? 'AVOID' : agent.navigationTask);
      const toGoal = sub(target, agent.flight.position);
      const gap = Math.hypot(toGoal.x, toGoal.y, toGoal.z);
      const desiredSpeed = clamp(player.speed + (gap - 12) * 0.55, 24, 116);
      // Arrival uses player velocity near formation, independent acceleration away from it.
      const arrival = clamp(gap / 24, 0, 1);
      const desired = add(scale(unit(toGoal), desiredSpeed * arrival), scale(player.velocity, 1 - arrival));
      let acceleration = scale(sub(desired, agent.flight.velocity), 2.8);
      acceleration = add(acceleration, scale(agent.avoidance, agent.avoidanceFor > 0 ? 105 : 0));
      for (const other of positions) {
        if (other.id === agent.id || !this.agents.find(member => member.id === other.id)?.deployed) continue;
        const away = sub(agent.flight.position, other.position);
        const separation = Math.hypot(away.x, away.y, away.z);
        if (separation < 13) acceleration = add(acceleration, scale(unit(away), (13 - separation) * 10));
        const relative = sub(agent.flight.velocity, other.velocity);
        const closing = clamp(-(away.x * relative.x + away.y * relative.y + away.z * relative.z) /
          Math.max(1, relative.x ** 2 + relative.y ** 2 + relative.z ** 2), 0, 0.6);
        const predictedGap = add(away, scale(relative, closing));
        const gapLength = Math.hypot(predictedGap.x, predictedGap.y, predictedGap.z);
        if (closing > 0 && gapLength < 13) acceleration = add(acceleration,
          scale(unit(gapLength > 0.1 ? predictedGap : { x: agent.id < other.id ? -1 : 1, y: 0.4, z: 0 }), (13 - gapLength) * 12));
      }
      const fromPlayer = sub(agent.flight.position, player.position);
      const playerGap = Math.hypot(fromPlayer.x, fromPlayer.y, fromPlayer.z);
      if (playerGap < 11) acceleration = add(acceleration, scale(unit(fromPlayer), (11 - playerGap) * 14));
      acceleration = limit(acceleration, 85);
      let velocity = add(agent.flight.velocity, scale(acceleration, dt));
      const speed = clamp(Math.hypot(velocity.x, velocity.y, velocity.z), 18, 116);
      velocity = scale(unit(velocity), speed);
      const heading = Math.atan2(-velocity.x, -velocity.z);
      const turn = Math.atan2(Math.sin(heading - agent.flight.attitude.yaw), Math.cos(heading - agent.flight.attitude.yaw));
      const next: FlightState = { ...agent.flight, velocity, speed,
        position: add(agent.flight.position, scale(velocity, dt)), elapsed: agent.flight.elapsed + dt,
        attitude: { yaw: heading, pitch: Math.asin(clamp(velocity.y / speed, -1, 1)), roll: clamp(turn * 3, -0.9, 0.9) },
        boosting: speed > 90 };
      if (!covered(world, next.position)) { this.task(agent, 'RECOVER'); continue; }
      const contact = resolveShield(agent.flight, next, world);
      agent.flight = contact.flight;
      if (contact.impact) {
        agent.impacts++; agent.avoidanceFor = 0.8; agent.perceptionIn = 0;
        agent.avoidance = unit(contact.flight.velocity); this.task(agent, 'RECOVER'); this.record(agent, 'impact');
      }
    }
  }
  private perceive(agent: AgentState, player: FlightState, world: CompanionWorld): void {
    agent.decisions++;
    const nearest = world.queryNearest(agent.flight.position, 90);
    agent.surfaceDistance = nearest?.distance ?? null;
    const horizon = Math.min(0.65, 35 / Math.max(18, agent.flight.speed));
    const predicted = add(agent.flight.position, scale(agent.flight.velocity, horizon));
    const hazard = world.queryNearest(predicted, 20);
    agent.avoidance = { x: 0, y: 0, z: 0 };
    if (hazard && hazard.distance < 16) {
      let normal = unit(sub(predicted, hazard.point));
      const fromSurface = sub(agent.flight.position, hazard.point);
      if (normal.x * fromSurface.x + normal.y * fromSurface.y + normal.z * fromSurface.z < 0) normal = scale(normal, -1);
      const side = agent.id % 2 === 0 ? 1 : -1;
      const lateral = Math.abs(normal.y) < 0.6
        ? { x: Math.cos(agent.flight.attitude.yaw) * side * 0.7, y: 0.55, z: -Math.sin(agent.flight.attitude.yaw) * side * 0.7 }
        : { x: 0, y: 0, z: 0 };
      agent.avoidance = unit(add(normal, lateral));
      if (Math.hypot(agent.avoidance.x, agent.avoidance.y, agent.avoidance.z) < 0.1) agent.avoidance = { x: 0, y: 1, z: 0 };
      agent.avoidanceFor = 0.45;
    }
    if (distance(agent.flight.position, player.position) > 200) agent.avoidanceFor = Math.min(0.2, agent.avoidanceFor);
  }
  private formationTarget(player: FlightState, id: number): Vec3 {
    const forward = forwardFromAttitude(player.attitude);
    const right = { x: Math.cos(player.attitude.yaw), y: 0, z: -Math.sin(player.attitude.yaw) };
    const spread = this.settings.formation === 'spread' ? 1.65 : 1;
    const side = this.settings.formation === 'line' ? 0 : id === 3 ? 0 : id === 1 ? -1 : 1;
    const ahead = this.settings.formation === 'line' ? 8 + id * 15 : id === 3 ? -2 : 14;
    const independent = this.settings.behavior === 'independent' ? Math.sin(this.elapsed * 0.25 + id * 2) * 12 : 0;
    const target = add(add(player.position, scale(forward, ahead)), scale(right, side * 14 * spread + independent));
    target.y += 4 + Math.sin(this.elapsed * 0.6 + id) * 2 + (id === 3 ? 2 : 0);
    return target;
  }
  private safeRoute(player: FlightState, world: CompanionWorld, id: number): Vec3 {
    const forward = unit(player.velocity);
    const right = { x: Math.cos(player.attitude.yaw), y: 0, z: -Math.sin(player.attitude.yaw) };
    let best = this.formationTarget(player, id); let bestCost = Infinity;
    for (const side of [0, -1, 1]) {
      const candidate = add(add(player.position, scale(forward, 90)), scale(right, side * 40)); candidate.y += side === 0 ? 6 : 20;
      if (!covered(world, candidate)) continue;
      let cost = Math.abs(side) * 4;
      for (const ratio of [0.3, 0.6, 1]) {
        const probe = add(player.position, scale(sub(candidate, player.position), ratio));
        const hit = world.queryNearest(probe, 25); cost += hit ? Math.max(0, 25 - hit.distance) * 4 : 0;
      }
      if (cost < bestCost) { bestCost = cost; best = candidate; }
    }
    return best;
  }
  private safeSpawn(player: FlightState, id: number, world: CompanionWorld): Vec3 | null {
    const target = this.formationTarget(player, id);
    const safe = (candidate: Vec3): boolean => {
      if (!covered(world, candidate) || distance(candidate, player.position) < 11 ||
        this.agents.some(agent => agent.deployed && distance(candidate, agent.flight.position) < 11)) return false;
      const segment = sub(candidate, player.position);
      const steps = Math.max(1, Math.ceil(distance(candidate, player.position) / 3));
      for (let step = 0; step <= steps; step++) {
        const hit = world.queryNearest(add(player.position, scale(segment, step / steps)), 6.5);
        if (hit && hit.distance <= 6) return false;
      }
      return true;
    };
    for (const height of [0, 10, 22, 40]) {
      for (const ratio of [1, 0.5, 0]) {
        const candidate = add(player.position, scale(sub(target, player.position), ratio)); candidate.y += height + id * 2;
        if (safe(candidate)) return candidate;
      }
    }
    const forward = forwardFromAttitude(player.attitude);
    for (const along of [-18 * id, 18 * id, -24 * id, 24 * id]) {
      const candidate = add(player.position, scale(forward, along));
      if (safe(candidate)) return candidate;
    }
    // With no safe deployment slot, do not create an aircraft inside geometry.
    return null;
  }
  private task(agent: AgentState, task: AgentTask): void {
    if (agent.task !== task) { agent.task = task; this.record(agent, 'task'); }
  }
  private record(agent: AgentState, event: CompanionEvent['event']): void {
    this.events.push({ time: this.elapsed, agent: agent.id, event, task: agent.task });
    if (this.events.length > 256) this.events.splice(0, this.events.length - 256);
  }
}
