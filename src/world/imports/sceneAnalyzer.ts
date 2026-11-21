import * as THREE from 'three';
import type { DrivenMesh, ImportedMotion } from './importedMotion';
import {
  isWorldRole, validateWorldOptions, WORLD_IMPORT_LIMITS as limits, type WorldImportOptions, type WorldMeshRole, type WorldRole,
} from './worldManifest';

export interface AnalyzedWorldScene {
  root: THREE.Group;
  surfaces: THREE.BufferGeometry | null;
  obstacles: THREE.BufferGeometry | null;
  bounds: THREE.Box3;
  nodes: number;
  triangles: number;
  materials: number;
  textures: number;
  meshRoles: WorldMeshRole[];
  dynamic: DrivenMesh[];
  collisionTriangles: number;
}

const inferRole = (object: THREE.Object3D): WorldRole => {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const explicit = node.userData.skimmerRole ?? node.userData.skimmer?.role;
    if (isWorldRole(explicit)) return explicit;
    if (/^(?:(?:skybox|sky[-_ ]?dome|sky[-_ ]?sphere|backdrop|background|horizon)(?:[ _.-]|$)|sky$)/i.test(node.name)) return 'DECORATION';
  }
  return 'SURFACE';
};

/** Keep the GLB materials and scene hierarchy while baking the currently visible triangle positions. */
export const analyzeWorldScene = (scene: THREE.Group, options: WorldImportOptions, motion?: ImportedMotion): AnalyzedWorldScene => {
  validateWorldOptions(options);
  const root = new THREE.Group();
  root.name = 'local-world';
  root.scale.setScalar(options.scale);
  root.rotation.y = THREE.MathUtils.degToRad(options.yaw);
  const upAxis = new THREE.Group();
  upAxis.rotation.x = options.up === 'z' ? -Math.PI / 2 : options.up === '-z' ? Math.PI / 2 : 0;
  root.add(upAxis);
  upAxis.add(scene);

  const meshes: Array<{ mesh: THREE.Mesh; id: string; role: WorldRole; moving: boolean; vertices: number }> = [];
  const meshRoles: WorldMeshRole[] = [];
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const colliderVertices = { SURFACE: 0, OBSTACLE: 0 };
  let nodes = 0;
  let vertices = 0;
  let solidTriangles = 0;
  let moving = 0;
  scene.traverseVisible(object => {
    nodes++;
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    if (!count || count % 3) throw new Error('世界包含无效的三角形网格。');
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    vertices += count * instances;
    if (!Number.isSafeInteger(vertices) || vertices > limits.triangles * 3) {
      throw new Error('世界实际使用的三角形数量超过预算，包含重复实例。');
    }
    const id = String(meshes.length + 1);
    const inferred = inferRole(object);
    const classified = options.roles?.[id];
    const role = isWorldRole(classified) ? classified : inferred;
    const driven = motion?.describe(object, id);
    if (role !== 'DECORATION') {
      solidTriangles += count * instances / 3;
      if (driven?.moving) moving++;
      else colliderVertices[role] += count * instances;
    }
    const displayName = typeof object.userData.name === 'string' ? object.userData.name : object.name;
    meshRoles.push({ id, name: (displayName || object.parent?.name || `网格 ${id}`).slice(0, 120), inferred, role,
      ...(driven?.motion ? { motion: driven.motion } : {}), ...(driven?.path ? { path: driven.path } : {}) });
    meshes.push({ mesh: object, id, role, moving: driven?.moving ?? false, vertices: count * instances });
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  if (!solidTriangles) throw new Error('世界场景没有可参与碰撞的三角形。');
  if (moving > 128) throw new Error('世界最多支持 128 个带碰撞的运动网格，请在导出时合并相关网格。');
  if (nodes > limits.nodes || materials.size > limits.materials || textures.size > limits.textures) {
    throw new Error('实际场景超过节点、材质或纹理预算。');
  }

  root.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3();
  for (const { mesh, role } of meshes) {
    if (role === 'DECORATION') continue;
    const localBounds = new THREE.Box3();
    const point = new THREE.Vector3();
    // Build bounds from mesh geometry only. GLB trees can mix scenery and solid children.
    if (mesh instanceof THREE.InstancedMesh) {
      mesh.computeBoundingBox();
      localBounds.copy(mesh.boundingBox!);
    } else {
      const attribute = mesh.geometry.getAttribute('position');
      for (let i = 0; i < attribute.count; i++) localBounds.expandByPoint(mesh.getVertexPosition(i, point));
    }
    sourceBounds.union(localBounds.applyMatrix4(mesh.matrixWorld));
  }
  const size = sourceBounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(span) || span < 0.05 || span > limits.dimension) {
    throw new Error('转换后的场景尺寸无效或超过 12000 米，请调整比例。');
  }
  const center = sourceBounds.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -sourceBounds.min.y, -center.z);
  root.updateMatrixWorld(true);
  const positions = {
    SURFACE: new Float32Array(colliderVertices.SURFACE * 3),
    OBSTACLE: new Float32Array(colliderVertices.OBSTACLE * 3),
  };
  const point = new THREE.Vector3();
  const transform = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const dynamic: DrivenMesh[] = [];
  const offsets = { SURFACE: 0, OBSTACLE: 0 };
  for (const { mesh, id, role, moving, vertices: meshVertices } of meshes) {
    if (role === 'DECORATION') continue;
    const count = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count;
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    mesh.receiveShadow = true;
    mesh.castShadow = vertices < 450_000;
    const output = moving ? new Float32Array(meshVertices * 3) : positions[role];
    let offset = moving ? 0 : offsets[role];
    for (let instance = 0; instance < instances; instance++) {
      if (moving) transform.identity();
      else transform.copy(mesh.matrixWorld);
      if (mesh instanceof THREE.InstancedMesh) {
        mesh.getMatrixAt(instance, instanceMatrix);
        transform.multiply(instanceMatrix);
      }
      for (let index = 0; index < count; index++) {
        mesh.getVertexPosition(mesh.geometry.index?.getX(index) ?? index, point).applyMatrix4(transform);
        if (!Number.isFinite(point.x + point.y + point.z)) throw new Error('世界包含无效的顶点坐标。');
        point.toArray(output, offset);
        offset += 3;
      }
    }
    if (moving) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(output, 3));
      dynamic.push({ id: `glb:${id}`, geometry, mesh, role });
    } else offsets[role] = offset;
  }

  const collisionGeometry = (data: Float32Array) => {
    if (!data.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };
  return { root, surfaces: collisionGeometry(positions.SURFACE), obstacles: collisionGeometry(positions.OBSTACLE),
    bounds: sourceBounds.translate(root.position), nodes, triangles: vertices / 3, materials: materials.size, textures: textures.size,
    meshRoles, dynamic, collisionTriangles: solidTriangles };
};

/** A glTF can share its geometry, materials and decoded images between primitives and scenes. */
export const disposeWorldScenes = (scenes: readonly THREE.Object3D[]): number => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  for (const scene of scenes) {
    scene.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      if (object instanceof THREE.InstancedMesh) object.dispose();
      const item = object as Partial<THREE.Mesh>;
      if (item.geometry instanceof THREE.BufferGeometry) geometries.add(item.geometry);
      if (Array.isArray(item.material)) item.material.forEach(material => materials.add(material));
      else if (item.material instanceof THREE.Material) materials.add(item.material);
    });
  }
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image);
    texture.dispose();
  }
  for (const bitmap of images) bitmap.close();
  for (const geometry of geometries) geometry.dispose();
  return geometries.size;
};
