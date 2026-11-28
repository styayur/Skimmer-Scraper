import { distance, type Vec3 } from '../core/math';
import type { CompanionWorld } from '../companions/AgentController';

export const covered = (world: CompanionWorld, p: Vec3) =>
  (world.isCompanionCovered?.(p) ?? world.isCollisionCovered?.(p)) !== false;

/** Bound every chord and its coverage. Real adapters include static triangles and moving colliders. */
export function clearApproach(world: CompanionWorld, from: Vec3, to: Vec3, radius = 7): boolean {
  const length = distance(from, to);
  if (!Number.isFinite(length) || length > 350 || !covered(world, from)) return false;
  const steps = Math.max(1, Math.ceil(length / 8));
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
    if (!covered(world, point) || (world.isGlideVolumeCovered && !world.isGlideVolumeCovered(point, radius))) return false;
    if (world.glideChordClear) {
      if (!world.glideChordClear(previous, point, radius, (i - 1) / steps * length / 65, t * length / 65)) return false;
    } else {
      // Distance to a solid is 1-Lipschitz. Cover the whole chord even on a nearest-only provider.
      const midpoint = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2, z: (previous.z + point.z) / 2 };
      if (world.queryNearest(midpoint, radius + distance(previous, point) / 2)) return false;
    }
    previous = point;
  }
  return true;
}
