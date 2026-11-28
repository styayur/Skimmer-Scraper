import { Mesh, Vector3, type Box3, type Object3D } from 'three';
import { distance, type Vec3 } from '../../core/math';
import { readMotionSemantic, type MotionSemantic, type MotionSemanticCandidate } from '../motionSemantic';

interface Anchor { semantic: MotionSemantic; node: Object3D; local: Vector3 }
let nextLease = 0;
export class ImportedSemantics {
  private readonly anchors = new Map<string, Anchor>();
  private readonly lease = `import-${++nextLease}`;
  public constructor(scene: Object3D, solids: ReadonlyMap<Mesh, Box3>, grouped: boolean) {
    const ambiguous = new Set<string>();
    let count = 0;
    scene.traverseVisible(node => {
      const socket = node.userData.skimmerSocket;
      const semantic = readMotionSemantic(node.userData.motionSemantic ??
        (socket === 'entry' || socket === 'exit' ? { version: 1, id: `socket-${socket}`, kind: 'socket', capabilities: ['guide', 'scout'] } : null));
      if (!semantic || ++count > 256) return;
      if (this.anchors.has(semantic.id)) { this.anchors.delete(semantic.id); ambiguous.add(semantic.id); }
      if (ambiguous.has(semantic.id)) return;
      const bounds = node instanceof Mesh ? solids.get(node) : undefined;
      // Mesh overrides and grouped layouts can remove the association between a detached marker and a solid.
      if (node instanceof Mesh && !bounds || grouped && !bounds) return;
      const local = new Vector3();
      if (bounds && (semantic.kind === 'surface' || semantic.kind === 'landmark')) {
        bounds.getCenter(local);
        local.y = bounds.max.y;
      }
      this.anchors.set(semantic.id, { semantic, node, local });
    });
    // An oversized table can conceal duplicates beyond the cap. Preserve geometric perception instead.
    if (count > 256) this.anchors.clear();
  }
  public near(position: Vec3): MotionSemanticCandidate[] {
    const nearby: MotionSemanticCandidate[] = [];
    for (const { node, local, semantic } of this.anchors.values()) {
      const point = local.clone().applyMatrix4(node.matrixWorld);
      if (distance(position, point) <= 240) nearby.push({ semantic, lease: this.lease, position: { x: point.x, y: point.y, z: point.z } });
    }
    return nearby.sort((a, b) => distance(position, a.position) - distance(position, b.position)).slice(0, 12);
  }
  public dispose() { this.anchors.clear(); }
}
