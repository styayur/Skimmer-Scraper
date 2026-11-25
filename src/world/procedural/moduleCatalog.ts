import {
  Box3, BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Object3D, Vector3, type Material,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { analyzeWorldScene } from '../imports/sceneAnalyzer';
import { defaultWorldImportOptions } from '../imports/worldManifest';
import type { Group } from 'three';

export interface ModuleMesh {
  geometry: BufferGeometry;
  material: Material | Material[];
  transform: Matrix4;
}

export interface WorldModule {
  id: string;
  sha256: string;
  bounds: Box3;
  entry: Vector3;
  exit: Vector3;
  passage: Box3;
  render: ModuleMesh[];
  collision: BufferGeometry;
}

const socketTolerance = 1e-5;

/** Analyze a static, project-authored GLB scene in its own coordinate space.
 * Entry and exit markers are at floor level on the centre line of a straight passage. */
export function analyzeWorldModule(id: string, sha256: string, scene: Group): WorldModule {
  if (!/^[a-z0-9-]{1,64}$/.test(id) || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('Invalid authored module identity');
  }
  const sockets = new Map<'entry' | 'exit', Object3D>();
  scene.updateMatrixWorld(true);
  scene.traverseVisible(node => {
    const socket: unknown = node.userData.skimmerSocket;
    if (socket === 'entry' || socket === 'exit') {
      if (sockets.has(socket)) throw new Error('Each passage socket must be unique');
      sockets.set(socket, node);
    }
    if (node.type === 'SkinnedMesh' || node.type === 'InstancedMesh'
      || node instanceof Mesh && node.morphTargetInfluences?.length) {
      throw new Error('A static module requires baked meshes');
    }
  });
  if (sockets.size !== 2) throw new Error('An authored module requires entry and exit sockets');

  // The existing analyzer owns semantic roles and extraction of collision triangles.
  // It re-parents its input, so give it a duplicate hierarchy with shared source geometry.
  const markers = [...sockets].map(([socket, node]) => [socket, node.getWorldPosition(new Vector3())] as const);
  if (scene.parent) throw new Error('Pass the root of the GLB scene');
  const result = analyzeWorldScene(scene.clone(true), defaultWorldImportOptions);
  if (result.triangles > 40_000) {
    result.surfaces?.dispose();
    result.obstacles?.dispose();
    throw new Error('Authored module exceeds 40,000 source triangles');
  }
  const transform = new Matrix4().makeTranslation(result.root.position.clone().negate());
  const render: ModuleMesh[] = [];
  const bounds = new Box3();
  const collisionPositions: number[] = [];
  try {
    result.root.traverseVisible(node => {
      if (node instanceof Mesh) {
        const part = new Matrix4().multiplyMatrices(transform, node.matrixWorld);
        if (part.determinant() <= 0) throw new Error('Bake mirrored transforms before export');
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        bounds.union(node.geometry.boundingBox!.clone().applyMatrix4(part));
        render.push({ geometry: node.geometry, material: node.material, transform: part });
      }
    });
    // Existing import geometry is non-indexed and expressed relative to the centred root.
    for (const geometry of [result.surfaces, result.obstacles]) {
      if (!geometry) continue;
      const attribute = geometry.getAttribute('position');
      const point = new Vector3();
      for (let i = 0; i < attribute.count; i++) {
        point.fromBufferAttribute(attribute, i).applyMatrix4(transform);
        collisionPositions.push(point.x, point.y, point.z);
      }
    }
  } finally {
    result.surfaces?.dispose();
    result.obstacles?.dispose();
  }
  const entry = markers.find(([socket]) => socket === 'entry')![1];
  const exit = markers.find(([socket]) => socket === 'exit')![1];
  if (![...entry.toArray(), ...exit.toArray()].every(Number.isFinite)
    || Math.abs(exit.x - entry.x) > socketTolerance || Math.abs(exit.y - entry.y) > socketTolerance
    || entry.z - exit.z < 12 || entry.z - exit.z > 55) {
    throw new Error('Passage sockets must face north on a level centre line, 12–55 m apart');
  }
  const passage = new Box3(
    new Vector3(entry.x - 5, entry.y + 1, exit.z),
    new Vector3(entry.x + 5, entry.y + 10, entry.z),
  );
  const collision = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(collisionPositions, 3));
  collision.computeBoundingBox();
  const tree = new MeshBVH(collision, { indirect: true });
  if (tree.intersectsBox(passage, new Matrix4())) {
    collision.dispose();
    throw new Error('Collision geometry blocks the authored passage: ' + id);
  }
  return { id, sha256, bounds: bounds.union(collision.boundingBox!), entry, exit, passage, render, collision };
}
