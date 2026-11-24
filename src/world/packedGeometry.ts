import { BufferAttribute, BufferGeometry, Sphere, Vector3, type TypedArray } from 'three';

export interface PackedGeometry {
  attributes: Array<{ name: string; array: TypedArray; itemSize: number; normalized: boolean }>;
  sphere: [number, number, number, number];
}

// City geometry is merged as unindexed triangles before it leaves the generator.
export function packGeometry(geometry: BufferGeometry): PackedGeometry {
  if (geometry.index) throw new Error('Expected unindexed city geometry');
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere!;
  return {
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({
      name, array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized,
    })),
    sphere: [center.x, center.y, center.z, radius],
  };
}

export function unpackGeometry(packet: PackedGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const { name, array, itemSize, normalized } of packet.attributes)
    geometry.setAttribute(name, new BufferAttribute(array, itemSize, normalized));
  const [x, y, z, radius] = packet.sphere;
  geometry.boundingSphere = new Sphere(new Vector3(x, y, z), radius);
  return geometry;
}
