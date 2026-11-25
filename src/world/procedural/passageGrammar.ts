import {
  Box3, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, LOD, Matrix4, Vector3,
} from 'three';
import { CHUNK_SIZE } from '../worldConfig';
import { hashNumbers } from '../deterministic';
import { mulberry32 } from '../rng';
import type { WorldModule } from './moduleCatalog';

export const PASSAGE_GRAMMAR_VERSION = 1;
const lanes = [44, 110, 176] as const;
// Open sky between adjoining sockets leaves room for an aircraft to line up.
const rules = [
  { segments: 1, gap: 0 },
  { segments: 2, gap: 18 },
  { segments: 3, gap: 18 },
] as const;

interface Placement {
  module: WorldModule;
  position: Vector3;
}

export function createPassageRecipe(seed: number, catalog: readonly WorldModule[]) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !catalog.length) {
    throw new Error('A passage recipe requires a uint32 seed and at least one module');
  }
  const modules = [...catalog].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (new Set(modules.map(module => module.id)).size !== modules.length) {
    throw new Error('Duplicate authored module IDs');
  }
  for (const module of modules) {
    const local = module.bounds.clone().translate(module.entry.clone().negate());
    const exitZ = module.exit.z - module.entry.z;
    if (local.min.x < -26 || local.max.x > 26 || local.min.z < exitZ - 6 || local.max.z > 10) {
      throw new Error('Authored module exceeds its placement envelope: ' + module.id);
    }
  }

  const placementsFor = (cx: number, cz: number): Placement[] => {
    if (![cx, cz].every(Number.isSafeInteger)) throw new Error('Invalid chunk coordinates');
    const random = mulberry32(hashNumbers(seed, cx, cz, PASSAGE_GRAMMAR_VERSION));
    const lane = lanes[Math.floor(random() * lanes.length)]!;
    const elevation = 40 + Math.floor(random() * 5) * 18;
    const rule = rules[Math.floor(random() * rules.length)]!;
    const placements: Placement[] = [];
    const entry = new Vector3(lane, elevation, 195);
    for (let index = 0; index < rule.segments; index++) {
      const module = modules[Math.floor(random() * modules.length)]!;
      const position = entry.clone().sub(module.entry);
      if (Math.min(module.bounds.min.z, module.exit.z) + position.z < 0) break;
      placements.push({ module, position });
      entry.copy(module.exit).add(position);
      entry.z -= rule.gap;
    }
    return placements;
  };

  return {
    manifest: {
      grammar: 'passage',
      version: PASSAGE_GRAMMAR_VERSION,
      seed,
      chunkMeters: CHUNK_SIZE,
      modules: modules.map(({ id, sha256 }) => ({ id, sha256 })),
    },
    generate(cx: number, cz: number) {
      const placements = placementsFor(cx, cz);
      const render = new Group();
      render.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      const near = new Group();
      const far = new Group();
      const collisionPositions: number[] = [];
      let renderTriangles = 0;
      const corridor = new Box3();
      const point = new Vector3();
      for (const module of new Set(placements.map(placement => placement.module))) {
        const instances = placements.filter(placement => placement.module === module);
        for (const mesh of module.render) {
          const addBatch = (group: Group) => {
            const batch = new InstancedMesh(mesh.geometry, mesh.material, instances.length);
            const transform = new Matrix4();
            instances.forEach(({ position }, index) => {
              batch.setMatrixAt(index, transform.makeTranslation(position.x, position.y, position.z).multiply(mesh.transform));
            });
            batch.computeBoundingSphere();
            batch.receiveShadow = true;
            group.add(batch);
          };
          addBatch(near);
          if (!mesh.detail) addBatch(far);
          const vertices = mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position').count;
          renderTriangles += vertices / 3 * instances.length;
        }
        for (const { position } of instances) {
          const attribute = module.collision.getAttribute('position');
          for (let i = 0; i < attribute.count; i++) {
            point.fromBufferAttribute(attribute, i).add(position);
            collisionPositions.push(point.x, point.y, point.z);
          }
          corridor.union(module.passage.clone().translate(position));
        }
      }
      const collision = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(collisionPositions, 3));
      collision.computeBoundingBox();
      const lod = new LOD();
      lod.name = 'generated-passage-lod';
      corridor.getCenter(lod.position);
      near.position.copy(lod.position).negate();
      far.position.copy(near.position);
      lod.addLevel(near, 0);
      lod.addLevel(far, 360, 0.12);
      lod.addLevel(new Group(), 850, 0.1);
      render.add(lod);
      return {
        render, collision, corridor, renderTriangles, placements: placements.length,
        dispose() {
          render.removeFromParent();
          render.traverse(instance => {
            if (instance instanceof InstancedMesh) instance.dispose();
          });
          near.clear();
          far.clear();
          lod.clear();
          render.clear();
          collision.dispose();
        },
      };
    },
  };
}
