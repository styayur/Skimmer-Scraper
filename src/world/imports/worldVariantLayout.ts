import { Box3, Matrix4, Vector3, type Object3D } from 'three';
import { seededRandom } from '../deterministic';
import { range } from '../rng';

export interface VariantPart {
  mesh: Object3D;
  bounds: Box3;
}

interface Assembly {
  anchors: Object3D[];
  bounds: Box3;
}

export interface VariantLayout {
  layout: 'grouped' | 'whole';
  movedGroups: number;
}

/** Keep each branch intact from the first shared parent with separable geometry. */
const assembliesOf = (parts: readonly VariantPart[], scene: Object3D): Assembly[] => {
  const counts = new Map<Object3D, number>();
  for (const { mesh } of parts) {
    for (let node: Object3D | null = mesh; node && node !== scene.parent; node = node.parent) {
      counts.set(node, (counts.get(node) ?? 0) + 1);
    }
  }
  let common = parts[0]!.mesh;
  while (counts.get(common) !== parts.length && common.parent) common = common.parent;
  const commonIsMesh = parts.some(part => part.mesh === common);
  const groups = new Map<Object3D, Assembly>();
  for (const { mesh, bounds } of parts) {
    let anchor = mesh;
    if (commonIsMesh) anchor = common;
    else while (anchor.parent && anchor.parent !== common) anchor = anchor.parent;
    let group = groups.get(anchor);
    if (!group) {
      group = { anchors: [anchor], bounds: new Box3() };
      groups.set(anchor, group);
    }
    group.bounds.union(bounds);
  }
  return [...groups.values()];
};

const distance = (a: Box3, b: Box3): number => Math.max(
  a.min.x - b.max.x, b.min.x - a.max.x,
  a.min.y - b.max.y, b.min.y - a.max.y,
  a.min.z - b.max.z, b.min.z - a.max.z,
);

/** A bridge deck and its piers travel in one rigid group even if exported as siblings. */
const connectAssemblies = (groups: Assembly[], clearance: number): Assembly[] => {
  const ordered = [...groups].sort((a, b) => a.bounds.min.x - b.bounds.min.x);
  const parents = ordered.map((_, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]!]!;
      index = parents[index]!;
    }
    return index;
  };
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i]!.bounds;
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j]!.bounds;
      if (b.min.x - a.max.x > clearance) break;
      if (distance(a, b) <= clearance) parents[root(j)] = root(i);
    }
  }
  const connected = new Map<number, Assembly>();
  for (const [index, group] of ordered.entries()) {
    const id = root(index);
    let component = connected.get(id);
    if (!component) {
      component = { anchors: [], bounds: new Box3() };
      connected.set(id, component);
    }
    component.anchors.push(...group.anchors);
    component.bounds.union(group.bounds);
  }
  return [...connected.values()];
};

export const applyImportedVariant = (
  scene: Object3D, world: Object3D, parts: readonly VariantPart[], bounds: Box3,
  fingerprint: string, variant: number, preserveMotion: boolean,
): VariantLayout => {
  const random = seededRandom(fingerprint, variant, 'imported-layout-v1');
  const uniformScale = range(random, 0.90, 1.12);
  const globalYaw = range(random, -0.24, 0.24);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  let movedGroups = 0;
  if (!preserveMotion && parts.length > 1) {
    const clearance = Math.min(1.5, Math.max(size.x, size.z) * 0.004);
    const moveable = assembliesOf(parts, scene).filter(group => {
      const dimensions = group.bounds.getSize(new Vector3());
      const foundation = dimensions.x >= size.x * 0.48 && dimensions.z >= size.z * 0.48
        && dimensions.y <= Math.min(4.5, size.y * 0.12) && group.bounds.min.y <= bounds.min.y + clearance;
      return !foundation;
    });
    const groups = connectAssemblies(moveable, clearance);
    const occupied = groups.map(group => group.bounds);
    const distanceScale = range(random, 0.94, 1.26);
    const jitter = Math.min(20, Math.max(size.x, size.z) * 0.05);
    const layer = Math.min(9, size.y * 0.10);
    if (groups.length > 1) for (const [index, group] of groups.entries()) {
      if (group.anchors.some(anchor => !anchor.parent!.matrixWorld.determinant())) continue;
      const pivot = group.bounds.getCenter(new Vector3());
      pivot.y = group.bounds.min.y;
      const airborne = pivot.y > bounds.min.y + 8;
      const offset = new Vector3(
        (pivot.x - center.x) * (distanceScale - 1) + range(random, -jitter, jitter),
        airborne ? range(random, -layer, layer) : 0,
        (pivot.z - center.z) * (distanceScale - 1) + range(random, -jitter, jitter),
      );
      const rotation = new Matrix4().makeRotationY(range(random, -0.18, 0.18));
      const height = new Matrix4().makeScale(1, range(random, 0.82, 1.24), 1);
      const transform = new Matrix4().makeTranslation(pivot.clone().add(offset))
        .multiply(rotation).multiply(height).multiply(new Matrix4().makeTranslation(pivot.negate()));
      const changed = group.bounds.clone().applyMatrix4(transform);
      if (occupied.some((area, other) => other !== index && distance(changed, area) < clearance)) continue;
      occupied[index] = changed;
      for (const anchor of group.anchors) {
        const parent = anchor.parent!.matrixWorld;
        anchor.matrix.premultiply(parent.clone().invert().multiply(transform).multiply(parent));
        anchor.matrixAutoUpdate = false;
        anchor.matrixWorldNeedsUpdate = true;
      }
      movedGroups++;
    }
  }
  world.scale.multiplyScalar(uniformScale);
  world.rotation.y += globalYaw;
  world.updateMatrixWorld(true);
  return { layout: movedGroups ? 'grouped' : 'whole', movedGroups };
};
