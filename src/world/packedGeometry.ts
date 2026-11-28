import { BufferAttribute, BufferGeometry, Sphere, Vector3, type TypedArray } from 'three';

export interface PackedGeometry {
  attributes: Array<{ name: string; array: TypedArray; itemSize: number; normalized: boolean }>;
  sphere: [number, number, number, number];
  index?: TypedArray;
}

export function packGeometry(geometry: BufferGeometry): PackedGeometry {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere!;
  return {
    ...(geometry.index ? { index: geometry.index.array } : {}),
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({
      name, array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized,
    })),
    sphere: [center.x, center.y, center.z, radius],
  };
}

export function unpackGeometry(packet: PackedGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  if (packet.index) geometry.setIndex(new BufferAttribute(packet.index, 1));
  for (const { name, array, itemSize, normalized } of packet.attributes)
    geometry.setAttribute(name, new BufferAttribute(array, itemSize, normalized));
  const [x, y, z, radius] = packet.sphere;
  geometry.boundingSphere = new Sphere(new Vector3(x, y, z), radius);
  return geometry;
}
