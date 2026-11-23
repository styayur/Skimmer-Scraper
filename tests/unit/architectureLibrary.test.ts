import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from 'three';
import { ArchitectureLibrary, towerModel } from '../../src/world/architectureLibrary';

describe('authored lofts', () => {
  it('keeps the moon gate open along its flight axis with solid side piers', () => {
    const lib = new ArchitectureLibrary();
    const mat = new MeshBasicMaterial({ side: DoubleSide });
    const solids = lib.parts('moonGate').filter(p => p.collides).map(p => new Mesh(p.geometry,mat));
    const cast = (x: number) => new Raycaster(new Vector3(x,48,35),new Vector3(0,0,-1),0,70).intersectObjects(solids);
    expect(cast(0)).toHaveLength(0);
    expect(cast(11).length).toBeGreaterThan(0);
    let disposed = 0;
    solids[0].geometry.addEventListener('dispose', () => disposed++);
    expect(lib.parts('moonGate')).toBe(lib.parts('moonGate'));
    lib.dispose();
    lib.dispose();
    expect(disposed).toBe(1);
    mat.dispose();
  });

  it('distributes reproducible silhouettes within one district', () => {
    const street = () => Array.from({length:40}, (_,i) => towerModel('moonGate', Math.imul(i,2654435761) >>> 0, .55));
    expect(street()).toEqual(street());
    expect(new Set(street()).size).toBe(5);
    expect(street().filter(name => name === 'moonGate').length).toBeGreaterThan(12);
  });
});

