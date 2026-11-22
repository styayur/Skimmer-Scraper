import { Mesh, PerspectiveCamera, type BufferGeometry } from 'three';
import { expect, it, vi } from 'vitest';
import { MirrorSky } from '../../src/render/mirrorSky';
import { resolveWorldSettings } from '../../src/world/worldConfig';

it('keeps the seeded city anchored to a bounded camera-relative visual ground', () => {
  const sky = new MirrorSky();
  const camera = new PerspectiveCamera();
  const setWorld = (seed: string) => sky.setWorld(resolveWorldSettings({ seed }), 0x21152e, 0x9f4f66);
  const cityGeometry = () => (sky.group.getObjectByName('upside-down-skyline') as Mesh<BufferGeometry>).geometry;
  const disposeGround = vi.fn();

  try {
    setWorld('334458');
    const layout = Array.from(cityGeometry().getAttribute('position').array);
    const ground = sky.group.getObjectByName('upside-down-city-ground') as Mesh<BufferGeometry>;
    const stats = sky.snapshot(camera);
    expect(stats.ground?.triangles).toBe(64);
    expect(stats.triangles).toBe(2640);
    expect(ground.position.y).toBe(stats.ground?.height);
    const positions = cityGeometry().getAttribute('position');
    const verticesPerWard = 11 * 36;
    for (let ward = 0; ward < 20; ward++) {
      const vertices = Array.from({ length: 36 }, (_, i) => positions.getY(ward * verticesPerWard + i));
      expect(Math.max(...vertices)).toBe(ground.position.y);
    }

    const disposeOldCity = vi.fn();
    cityGeometry().addEventListener('dispose', disposeOldCity);
    setWorld('334458');
    expect(disposeOldCity).toHaveBeenCalledOnce();
    expect(Array.from(cityGeometry().getAttribute('position').array)).toEqual(layout);
    setWorld('334459');
    expect(Array.from(cityGeometry().getAttribute('position').array)).not.toEqual(layout);
    expect(sky.group.getObjectByName(ground.name)).toBe(ground);

    camera.position.set(4000, 480, -1700);
    camera.rotation.set(0.7, 2, Math.PI);
    sky.follow(camera);
    expect(sky.group.position).toEqual(camera.position);
    expect(sky.group.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    ground.geometry.addEventListener('dispose', disposeGround);
    sky.clear();
    expect(sky.group.children).toHaveLength(0);
    expect(sky.snapshot(camera).ground).toBeNull();
    expect(disposeGround).not.toHaveBeenCalled();
  } finally {
    sky.dispose();
  }
  expect(disposeGround).toHaveBeenCalledOnce();
});
