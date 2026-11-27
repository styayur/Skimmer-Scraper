import { distance, forwardFromAttitude, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { CompanionWorld } from '../companions/AgentController';
import type { PerceivedTarget } from './contracts';
import type { SurfaceQuery } from '../world/worldTypes';

export const covered = (world: CompanionWorld, p: Vec3) =>
  (world.isCompanionCovered?.(p) ?? world.isCollisionCovered?.(p)) !== false;

/** Fixed-wing clearance probes. The reactive sweep and shield still own actual motion. */
export function clearApproach(world: CompanionWorld, from: Vec3, to: Vec3): boolean {
  const length = distance(from, to);
  if (!Number.isFinite(length) || length > 350) return false;
  const steps = Math.max(1, Math.ceil(length / 8));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    };
    if (!covered(world, p) || (world.queryNearest(p, 8)?.distance ?? Infinity) < 7) return false;
  }
  return true;
}

interface SurfaceObservation {
  chunkId: string;
  surfaceId: string;
  target: PerceivedTarget;
}
// Above the controller's 12–20 m avoidance band so inspection can settle without suppressing safety.
const standOff = 26;

function continuousGlide(world: CompanionWorld, position: Vec3, hit: SurfaceQuery): boolean {
  if (!hit.contact || !world.queryGlide) return false;
  const normal = hit.contact.normal;
  const tangent =
    Math.abs(normal.y) < 0.8 ? { x: -normal.z, y: 0, z: normal.x } : { x: normal.y, y: -normal.x, z: 0 };
  return [-18, 18].every((offset) => {
    const probe = {
      x: position.x + tangent.x * offset,
      y: position.y + tangent.y * offset,
      z: position.z + tangent.z * offset,
    };
    if (!covered(world, probe)) return false;
    const neighbor = world.queryGlide!(probe, standOff + 6);
    if (
      !neighbor?.contact ||
      neighbor.chunkId !== hit.chunkId ||
      neighbor.surfaceId !== hit.surfaceId ||
      neighbor.distance < 9
    )
      return false;
    const adjacent = neighbor.contact.normal;
    return adjacent.x * normal.x + adjacent.y * normal.y + adjacent.z * normal.z > 0.85;
  });
}

/** The last perception contains at most two observed structures. Leased missions retain their own identity check. */
export class SemanticTargets {
  private entries = new Map<string, SurfaceObservation>();
  public clear(): void {
    this.entries.clear();
  }
  public observation(id: string) {
    return this.entries.get(id);
  }
  public observe(world: CompanionWorld, player: FlightState, epoch: number): PerceivedTarget[] {
    this.clear();
    const forward = forwardFromAttitude(player.attitude);
    const ahead = world.routeHint?.(player.position,forward) ?? {
        x: player.position.x + 65 * forward.x,
        y: player.position.y + 65 * forward.y,
        z: player.position.z + 65 * forward.z,
      };
    for (const p of [player.position,ahead]) {
      if (!covered(world, p)) continue;
      const glideHit = world.queryGlide?.(p, 75);
      const hit = glideHit ?? world.queryNearest(p, 75);
      if (!hit || hit.distance < 1 || !Number.isFinite(hit.distance)) continue;
      const point = hit.point;
      const n = {
        x: (p.x - point.x) / hit.distance,
        y: (p.y - point.y) / hit.distance,
        z: (p.z - point.z) / hit.distance,
      };
      const position = {
        x: point.x + n.x * standOff,
        y: point.y + n.y * standOff,
        z: point.z + n.z * standOff,
      };
      if (!covered(world, position) || (world.queryNearest(position, 8)?.distance ?? Infinity) <= 7) continue;
      // Hash provider IDs locally. Imported mesh names never become model instructions.
      let hash = 2166136261;
      for (const ch of JSON.stringify([
        hit.chunkId,
        hit.surfaceId,
        Math.floor(point.x / 64),
        Math.floor(point.y / 64),
        Math.floor(point.z / 64),
      ]))
        hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
      const id = `observed-${epoch}-${hash >>> 0}`;
      const kind = /^moving:-?\d+:-?\d+:garden$/.test(hit.surfaceId) ? 'floating-island' : 'structure';
      const capabilities: ('inspect' | 'glide')[] = ['inspect'];
      if (glideHit && continuousGlide(world, position, glideHit)) capabilities.push('glide');
      this.entries.set(id, {
        chunkId: hit.chunkId,
        surfaceId: hit.surfaceId,
        target: { id, kind, position, clearance: standOff, capabilities },
      });
    }
    return [...this.entries.values()].map((entry) => entry.target);
  }
}

export function observedHere(world: CompanionWorld, entry: SurfaceObservation, needsGlide = false): boolean {
  if (!covered(world, entry.target.position)) return false;
  const glideHit = world.queryGlide?.(entry.target.position, standOff + 8);
  const hit = glideHit ?? world.queryNearest(entry.target.position, standOff + 8);
  if (!hit || hit.chunkId !== entry.chunkId || hit.surfaceId !== entry.surfaceId || hit.distance < 7)
    return false;
  return !needsGlide || (!!glideHit && continuousGlide(world, entry.target.position, glideHit));
}
