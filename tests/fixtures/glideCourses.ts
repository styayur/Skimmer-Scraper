import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export type GlideCourse = 'glide-helix' | 'glide-gallery' | 'glide-gap';

/** Finite collision/render triangles, with the same origin convention as the GLB importer. */
export function createGlideCourse(course: GlideCourse) {
  const positions: number[] = [], indices: number[] = [];
  const spawn = new Vector3(0, 8, 0);
  function strip(steps: number, edges: (i: number) => [Vector3, Vector3]) {
    for (let i = 0; i <= steps; i++) {
      const index = positions.length / 3;
      for (const point of edges(i)) positions.push(...point.toArray());
      if (i < steps) indices.push(index, index + 1, index + 3, index, index + 3, index + 2);
    }
  }
  if (course === 'glide-helix') {
    // A finite vertical ribbon climbing 9 m per radian. One small pilot turn
    // introduces positive axial velocity on the first part of the ribbon.
    strip(234, i => {
      const angle = -Math.PI / 4 + i * Math.PI / 72;
      const x = 34 * Math.cos(angle), y = 9 * angle, z = -34 * Math.sin(angle);
      return [new Vector3(x, y + 17, z), new Vector3(x, y - 17, z)];
    });
    spawn.set(42, 0, 0);
  } else {
    const deck = (from: number, to: number, height: number) => strip((to - from) / 2, i => {
      const s = from + 2 * i;
      const y = height + (course === 'glide-gallery' && s > 32 ? 5 * (1 - Math.cos((s - 32) / 18)) : 0);
      const bank = course === 'glide-gallery' ? 0.6 * Math.sin(s / 17) : 0;
      return [new Vector3(-18, y - bank, -s), new Vector3(18, y + bank, -s)];
    });
    if (course === 'glide-gap') {
      deck(-32, 50, 0);
      // Three sheets share the last edge of the deck. Both irregular lower
      // faces terminate within 3 m, with no aircraft-sized landing/run-out.
      const hinge = positions.length / 3 - 2;
      for (const [drop, setback] of [[2.4, 1.7], [2.8, 0.4]]) {
        const tip = positions.length / 3;
        positions.push(-17, -drop, -50 + setback, 15, -drop + 0.3, -50 + setback + 0.2);
        indices.push(hinge, tip, tip + 1, hinge, tip + 1, hinge + 1);
      }
      deck(84, 256, 0);
    } else {
      deck(-32, 256, 0);
      deck(60, 154, 10.9);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const origin = geometry.boundingBox!.getCenter(new Vector3());
  origin.y = geometry.boundingBox!.min.y;
  geometry.translate(-origin.x, -origin.y, -origin.z);
  return { geometry, spawn: spawn.sub(origin) };
}
