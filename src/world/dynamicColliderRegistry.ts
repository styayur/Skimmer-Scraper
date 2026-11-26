import { Box3, BufferGeometry, Matrix4, Quaternion, Triangle, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Vec3 } from '../core/math';
import type { SurfaceQuery, SweptSurfaceContact } from './worldTypes';

interface Pose {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

interface Collider {
  id: string;
  region: string;
  proximity: boolean;
  geometry: BufferGeometry;
  tree: MeshBVH;
  bounds: Box3;
  currentBounds: Box3;
  sweptBounds: Box3;
  previous: Matrix4;
  current: Matrix4;
  inverse: Matrix4;
  displacement: number;
  tickSeconds: number;
  pivotRadius: number;
  previousPose: Pose;
  currentPose: Pose;
  curved: boolean;
}

const writeVector = ({ x, y, z }: Vec3): Vec3 => ({ x, y, z });
const tolerance = 0.001;
const pose = (): Pose => ({ position: new Vector3(), rotation: new Quaternion(), scale: new Vector3() });

/** The BVH stays in model space. Matrices and bounds advance with the simulation. */
export class DynamicColliderRegistry {
  private contactTriangle = -1;
  private readonly contactNormal = new Vector3();
  private readonly colliders = new Map<string, Collider>();
  private readonly worldPoint = new Vector3();
  private readonly localPoint = new Vector3();
  private readonly closest = new Vector3();
  private readonly candidate = new Vector3();
  private readonly triangle = new Triangle();
  private readonly inverse = new Matrix4();
  private readonly sampledMatrix = new Matrix4();
  private readonly corner = new Vector3();
  private readonly previousCorner = new Vector3();
  private readonly sweptPlane = new Box3();
  private readonly localOnSurface = new Vector3();
  private readonly renderPose = pose();
  private readonly composed = new Matrix4();

  public add(id: string, region: string, geometry: BufferGeometry, matrix: Matrix4, proximity: boolean): void {
    this.remove(id);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!.clone();
    const currentBounds = bounds.clone().applyMatrix4(matrix);
    const pivotRadius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)), Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
    this.colliders.set(id, {
      id, region, proximity, geometry, bounds, currentBounds, sweptBounds: currentBounds.clone(),
      tree: new MeshBVH(geometry, { maxDepth: 28, targetLeafSize: 10 }),
      previous: matrix.clone(), current: matrix.clone(), inverse: matrix.clone().invert(),
      displacement: 0, tickSeconds: 0,
      pivotRadius, previousPose: pose(), currentPose: pose(), curved: false,
    });
  }

  public setTransform(id: string, matrix: Matrix4, tickSeconds: number): void {
    const collider = this.colliders.get(id);
    if (!collider) return;
    const { previous, current, inverse, bounds, currentBounds, sweptBounds } = collider;
    previous.copy(tickSeconds > 0 ? current : matrix);
    current.copy(matrix);
    inverse.copy(current).invert();
    sweptBounds.copy(bounds).applyMatrix4(previous);
    currentBounds.copy(bounds).applyMatrix4(current);
    sweptBounds.union(currentBounds);
    collider.tickSeconds = tickSeconds;
    collider.curved = false;
    let displacement = 0;
    if (tickSeconds > 0 && !previous.equals(current)) {
      const start = collider.previousPose;
      const end = collider.currentPose;
      if (this.readPose(previous, start) && this.readPose(current, end)) {
        const turn = start.rotation.angleTo(end.rotation);
        if (turn > 1e-6) {
          collider.curved = true;
          const scale = Math.max(Math.abs(start.scale.x), Math.abs(start.scale.y), Math.abs(start.scale.z),
            Math.abs(end.scale.x), Math.abs(end.scale.y), Math.abs(end.scale.z));
          displacement = start.position.distanceTo(end.position)
            + collider.pivotRadius * (scale * turn + start.scale.distanceTo(end.scale));
          sweptBounds.expandByScalar(displacement * 0.5);
        }
      }
      if (!collider.curved) {
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          this.corner.set(x, y, z);
          this.previousCorner.copy(this.corner).applyMatrix4(previous);
          displacement = Math.max(displacement, this.corner.applyMatrix4(current).distanceTo(this.previousCorner));
        }
      }
    }
    collider.displacement = displacement;
  }

  public queryNearest(position: Vec3, range: number, proximityOnly = false, contact = false): SurfaceQuery | null {
    if (!(range >= 0)) return null;
    this.worldPoint.set(position.x, position.y, position.z);
    let nearest: SurfaceQuery | null = null;
    let best = range;
    for (const collider of this.colliders.values()) {
      if ((proximityOnly && !collider.proximity) || collider.currentBounds.distanceToPoint(this.worldPoint) > best) continue;
      const distance = this.nearestAt(collider, collider.current, collider.inverse, best, contact);
      if (distance < best) {
        best = distance;
        nearest = this.hit(collider, distance);
        if(contact) {
          const local = this.closest.clone().applyMatrix4(collider.inverse);
          const velocity = collider.tickSeconds > 0 ? this.closest.clone().sub(local.clone().applyMatrix4(collider.previous)).divideScalar(collider.tickSeconds) : new Vector3();
          const normal = this.contactNormal.clone();
          if(normal.dot(this.worldPoint.clone().sub(this.closest))<0)normal.negate();
          nearest.contact={normal,velocity,localPoint:local,triangle:this.contactTriangle,geometryId:collider.geometry.uuid};
        }
      }
    }
    return nearest;
  }

  public sweep(from: Vec3, to: Vec3, radius: number): SweptSurfaceContact | null {
    if (!(radius > 0) || this.colliders.size === 0) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const travel = Math.hypot(dx, dy, dz);
    this.sweptPlane.min.set(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.min(from.z, to.z));
    this.sweptPlane.max.set(Math.max(from.x, to.x), Math.max(from.y, to.y), Math.max(from.z, to.z));
    this.sweptPlane.expandByScalar(radius + tolerance);
    let first: SweptSurfaceContact | null = null;
    for (const collider of this.colliders.values()) {
      if (!collider.sweptBounds.intersectsBox(this.sweptPlane)) continue;
      const rate = travel + collider.displacement;
      const end = first?.fraction ?? 1;
      let fraction = 0;
      // Conservative advancement uses a relative speed bound for every point of the mesh.
      for (let iteration = 0; iteration < 160 && fraction <= end; iteration++) {
        this.worldPoint.set(from.x + dx * fraction, from.y + dy * fraction, from.z + dz * fraction);
        const { matrix, inverse } = this.poseAt(collider, fraction);
        const search = radius + (end - fraction) * rate + tolerance;
        const distance = this.nearestAt(collider, matrix, inverse, search);
        if (distance <= radius + tolerance) {
          const hit = this.hit(collider, distance);
          if (inverse.elements[15] === 0) this.localOnSurface.set(0, 0, 0);
          else this.localOnSurface.copy(this.closest).applyMatrix4(inverse);
          const velocity = collider.displacement > 0 && collider.tickSeconds > 0
            ? writeVector(this.corner.copy(this.localOnSurface).applyMatrix4(collider.current)
              .sub(this.previousCorner.copy(this.localOnSurface).applyMatrix4(collider.previous)).divideScalar(collider.tickSeconds))
            : { x: 0, y: 0, z: 0 };
          first = { fraction, hit, velocity };
          break;
        }
        if (!Number.isFinite(distance) || rate === 0) break;
        fraction += (distance - radius) / rate;
      }
    }
    return first;
  }

  public get count(): number { return this.colliders.size; }

  public remove(id: string): void {
    const collider = this.colliders.get(id);
    if (!collider) return;
    collider.geometry.dispose();
    this.colliders.delete(id);
  }

  public dispose(): void {
    for (const id of this.colliders.keys()) this.remove(id);
  }

  private poseAt(collider: Collider, fraction: number): { matrix: Matrix4; inverse: Matrix4 } {
    if (!collider.displacement || fraction >= 1) return { matrix: collider.current, inverse: collider.inverse };
    if (collider.curved) {
      const { previousPose: start, currentPose: end } = collider;
      const target = this.renderPose;
      target.position.lerpVectors(start.position, end.position, fraction);
      target.rotation.slerpQuaternions(start.rotation, end.rotation, fraction);
      target.scale.lerpVectors(start.scale, end.scale, fraction);
      this.sampledMatrix.compose(target.position, target.rotation, target.scale);
    } else {
      // Interpolate affine matrices when parent transforms produce shear.
      const elements = this.sampledMatrix.elements;
      for (let index = 0; index < 16; index++) {
        const from = collider.previous.elements[index]!;
        elements[index] = from + (collider.current.elements[index]! - from) * fraction;
      }
    }
    return { matrix: this.sampledMatrix, inverse: this.inverse.copy(this.sampledMatrix).invert() };
  }

  private readPose(matrix: Matrix4, target: Pose): boolean {
    matrix.decompose(target.position, target.rotation, target.scale);
    this.composed.compose(target.position, target.rotation, target.scale);
    return this.composed.elements.every((value, index) => Math.abs(value - matrix.elements[index]!) < 1e-7);
  }

  private nearestAt(collider: Collider, matrix: Matrix4, inverse: Matrix4, range: number, contact = false): number {
    const e = inverse.elements;
    const radiusScale = Math.hypot(e[0]!, e[1]!, e[2]!, e[4]!, e[5]!, e[6]!, e[8]!, e[9]!, e[10]!);
    this.localPoint.copy(this.worldPoint).applyMatrix4(inverse);
    let best = range;
    let hit = false;
    collider.tree.shapecast({
      intersectsBounds: bounds => radiusScale === 0 || bounds.distanceToPoint(this.localPoint) <= best * radiusScale,
      intersectsTriangle: (triangle, triangleIndex) => {
        this.triangle.a.copy(triangle.a).applyMatrix4(matrix);
        this.triangle.b.copy(triangle.b).applyMatrix4(matrix);
        this.triangle.c.copy(triangle.c).applyMatrix4(matrix);
        this.triangle.closestPointToPoint(this.worldPoint, this.candidate);
        const distance = this.worldPoint.distanceTo(this.candidate);
        if (distance <= best) {
          best = distance;
          this.closest.copy(this.candidate);
          if (contact) {
            this.contactTriangle = triangleIndex;
            this.triangle.getNormal(this.contactNormal);
          }
          hit = true;
        }
        return false;
      },
    });
    return hit ? best : Infinity;
  }

  private hit(collider: Collider, distance: number): SurfaceQuery {
    return { distance, point: writeVector(this.closest), chunkId: collider.region, surfaceId: collider.id };
  }
}
