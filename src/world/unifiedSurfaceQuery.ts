import type { Vec3 } from '../core/math';
import { DynamicColliderRegistry } from './dynamicColliderRegistry';
import { queryFlightSurface, type SurfaceProvider } from './worldTypes';

export class UnifiedSurfaceQuery implements SurfaceProvider {
  public readonly dynamic = new DynamicColliderRegistry();

  public constructor(private readonly solid: SurfaceProvider) {}

  public queryNearest(position: Vec3, range: number) {
    const stationary = this.solid.queryNearest(position, range);
    return this.dynamic.queryNearest(position, stationary?.distance ?? range) ?? stationary;
  }

  public queryProximity(position: Vec3, range: number) {
    const stationary = queryFlightSurface(this.solid, position, range);
    return this.dynamic.queryNearest(position, stationary?.distance ?? range, true) ?? stationary;
  }

  public queryStatic(position: Vec3, range: number) { return this.solid.queryNearest(position, range); }
  public queryGlide(position: Vec3, range: number) {
    return this.queryGlideAhead(position, range, 0);
  }
  public queryGlideAhead(position: Vec3, range: number, seconds: number, includeObstacles = false) {
    const solid = this.solid.queryGlide?.(position,range);
    return this.dynamic.queryNearest(position, solid?.distance ?? range, !includeObstacles, true, seconds) ?? solid ?? null;
  }

  public sweepDynamic(from: Vec3, to: Vec3, radius: number) { return this.dynamic.sweep(from, to, radius); }

  public glideChordClear(from: Vec3, to: Vec3, radius: number, start: number, end: number) {
    const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
    // A ball enclosing the capsule is conservative even at thin, oblique triangle edges.
    const reach = radius + Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) / 2;
    return !this.solid.queryNearest(center, reach) && this.dynamic.glideChordClear(from, to, radius, start, end);
  }
}
