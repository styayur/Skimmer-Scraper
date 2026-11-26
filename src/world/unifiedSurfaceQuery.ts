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
    const solid = this.solid.queryGlide?.(position,range);
    return this.dynamic.queryNearest(position, solid?.distance ?? range, true, true) ?? solid ?? null;
  }

  public sweepDynamic(from: Vec3, to: Vec3, radius: number) { return this.dynamic.sweep(from, to, radius); }
}
