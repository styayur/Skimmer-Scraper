import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Object3D, Matrix4 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';
import { analyzeWorldModule } from '../../src/world/procedural/moduleCatalog';
import { createPassageRecipe } from '../../src/world/procedural/passageGrammar';

function arch(blocked = false) {
  const scene = new Group();
  scene.position.set(3, 4, 17);
  const material = new MeshBasicMaterial();
  const pillar = new BoxGeometry(3, 13, 12);
  for (const x of [-8, 8]) {
    const side = new Mesh(pillar, material);
    side.position.set(x, 6.5, -14);
    scene.add(side);
  }
  const lintel = new Mesh(new BoxGeometry(19, 2, 12), new MeshPhysicalMaterial());
  lintel.position.set(0, blocked ? 5 : 12, -14);
  scene.add(lintel);
  for (const [skimmerSocket, z] of [['entry', 0], ['exit', -28]] as const) {
    const marker = new Object3D();
    marker.userData.skimmerSocket = skimmerSocket;
    marker.position.z = z;
    scene.add(marker);
  }
  return scene;
}

describe('authored passage grammar', () => {
  it('rejects geometry that obstructs the authored air corridor', () => {
    expect(() => analyzeWorldModule('arch', 'a'.repeat(64), arch(true))).toThrow('blocks');
  });

  it('generates bounded chunks in any order with real collision and open passages', () => {
    const a = analyzeWorldModule('arch-a', 'a'.repeat(64), arch());
    const b = analyzeWorldModule('arch-b', 'b'.repeat(64), arch());
    expect(a.render[0]!.geometry).toBe(a.render[1]!.geometry);
    const recipe = createPassageRecipe(334458, [b, a]);
    const reordered = createPassageRecipe(334458, [a, b]);
    const left = recipe.generate(-1, 1);
    const next = recipe.generate(0, 1);
    const repeated = reordered.generate(-1, 1);
    expect(recipe.manifest).toEqual(reordered.manifest);
    expect(left.render.position.toArray()).toEqual([-220, 0, 220]);
    expect(next.render.position.toArray()).toEqual([0, 0, 220]);
    expect(left.collision.getAttribute('position').array).toEqual(repeated.collision.getAttribute('position').array);
    expect(left.collision.boundingBox!.min.z).toBeGreaterThanOrEqual(0);
    expect(left.collision.boundingBox!.max.z).toBeLessThanOrEqual(220);
    expect(left.placements).toBeGreaterThanOrEqual(1);
    const tree = new MeshBVH(left.collision, { indirect: true });
    expect(tree.intersectsBox(left.collision.boundingBox!, new Matrix4())).toBe(true);
    expect(tree.intersectsBox(left.corridor, new Matrix4())).toBe(false);
    const compound = Array.from({ length: 12 }, (_, z) => recipe.generate(2, z));
    expect(compound.some(chunk => chunk.placements > 1)).toBe(true);
    for (const chunk of compound) {
      expect(chunk.collision.boundingBox!.min.z).toBeGreaterThanOrEqual(0);
      expect(chunk.collision.boundingBox!.max.z).toBeLessThanOrEqual(220);
      expect(new MeshBVH(chunk.collision).intersectsBox(chunk.corridor, new Matrix4())).toBe(false);
      chunk.dispose();
      expect(chunk.render.children).toHaveLength(0);
    }
  });
});
