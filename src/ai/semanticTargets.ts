import { distance, forwardFromAttitude, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';
import type { CompanionWorld } from '../companions/AgentController';
import type { PerceivedTarget } from './contracts';

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
    for (const offset of [0, 65]) {
      const p = {
        x: player.position.x + offset * forward.x,
        y: player.position.y + offset * forward.y,
        z: player.position.z + offset * forward.z,
      };
      if (!covered(world, p)) continue;
      const hit = world.queryGlide?.(p, 75) ?? world.queryNearest(p, 75);
      if (!hit || hit.distance < 1 || !Number.isFinite(hit.distance)) continue;
      const point = hit.point;
      const n = {
        x: (p.x - point.x) / hit.distance,
        y: (p.y - point.y) / hit.distance,
        z: (p.z - point.z) / hit.distance,
      };
      const position = { x: point.x + n.x * 16, y: point.y + n.y * 16, z: point.z + n.z * 16 };
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
      if (hit.contact && world.queryGlide) {
        const tangent = Math.abs(n.y) < 0.8 ? { x: -n.z, y: 0, z: n.x } : { x: n.y, y: -n.x, z: 0 };
        const adjacent = [-18, 18].every((d) => {
          const q = {
            x: position.x + tangent.x * d,
            y: position.y + tangent.y * d,
            z: position.z + tangent.z * d,
          };
          const neighbor = world.queryGlide!(q, 22);
          const normal = neighbor?.contact?.normal;
          return (
            covered(world, q) &&
            neighbor?.surfaceId === hit.surfaceId &&
            neighbor.distance >= 9 &&
            !!normal &&
            normal.x * n.x + normal.y * n.y + normal.z * n.z > 0.85
          );
        });
        if (adjacent) capabilities.push('glide');
      }
      this.entries.set(id, {
        chunkId: hit.chunkId,
        surfaceId: hit.surfaceId,
        target: { id, kind, position, clearance: 16, capabilities },
      });
    }
    return [...this.entries.values()].map((entry) => entry.target);
  }
}

export function observedHere(world: CompanionWorld, entry: SurfaceObservation): boolean {
  if (!covered(world, entry.target.position)) return false;
  const hit = world.queryGlide?.(entry.target.position, 24) ?? world.queryNearest(entry.target.position, 24);
  return !!hit && hit.chunkId === entry.chunkId && hit.surfaceId === entry.surfaceId && hit.distance >= 7;
}
