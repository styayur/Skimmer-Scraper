import * as THREE from 'three';
import profiles from '../../art/district/profiles.json';
import type { WorldMaterialKey } from './materials';

export type ArchitectureModel = keyof typeof profiles;
const towers = ['moonGate', 'foldedFan', 'terraceOrchard', 'lanternCourt', 'needleExchange'] as const;
export type TowerModel = typeof towers[number];

/** Keep a district's dominant silhouette legible while allowing neighbouring lots to differ. */
export function towerModel(dominant: TowerModel, lot: number, garden: number): TowerModel {
  if ((lot >>> 0) % 9 < 4) return dominant;
  if (garden > 0.65 && lot % 3 === 0) return 'terraceOrchard';
  return towers[(lot >>> 8) % towers.length]!;
}

export interface ArchitecturePart {
  geometry: THREE.BufferGeometry;
  material: WorldMaterialKey;
  collides: boolean;
}

interface Bucket {
  positions: number[];
  uvs: number[];
}

function buildModel(model: ArchitectureModel): ArchitecturePart[] {
  const batches = new Map<WorldMaterialKey, Bucket>();
  for (const { outline, rings, material } of profiles[model]) {
    const key = material as WorldMaterialKey;
    const batch = batches.get(key) ?? { positions: [], uvs: [] };
    batches.set(key, batch);
    // Blender (X,Y,Z) to Three (X,Z,-Y) preserves triangle winding.
    const layers = rings.map(([x, y, z, w, d]) =>
      outline.map(([u, v]) => new THREE.Vector3(x + u*w, z, -y - v*d)));
    const emit = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, cap: boolean) => {
      const projectX = Math.abs(b.x-a.x) >= Math.abs(b.z-a.z);
      for (const p of [a,b,c]) {
        batch.positions.push(p.x,p.y,p.z);
        if (cap) batch.uvs.push(0.014,0.98);
        else batch.uvs.push(projectX ? p.x/22 : p.z/22, p.y/44);
      }
    };
    if (key === 'windowWarm' && model !== 'orbit' && model !== 'skyGarden') {
      // These lights sit flush with the south facade. A single luminous quad
      // replaces the bevelled prism after baking, without adding collision faces.
      const front = Math.max(...layers[0].map(p => p.z));
      const edge = layers[0].map((p,i) => ({ p,i })).filter(({p}) => p.z === front);
      if (edge.length === 2) {
        const [left,right] = edge;
        const upper = layers[layers.length-1];
        emit(left.p,right.p,upper[right.i],false);
        emit(upper[right.i],upper[left.i],left.p,false);
        continue;
      }
    }
    const last = layers.at(-1)!;
    for (let i=1; i<outline.length-1; i++) {
      emit(layers[0][0], layers[0][i+1], layers[0][i], true);
      emit(last[0], last[i], last[i+1], true);
    }
    for (let level=1; level<layers.length; level++) {
      const lower=layers[level-1], upper=layers[level];
      for (let i=0; i<outline.length; i++) {
        const j=(i+1)%outline.length;
        emit(lower[i], lower[j], upper[j], false);
        emit(upper[j], upper[i], lower[i], false);
      }
    }
  }
  return [...batches].map(([material, {positions, uvs}]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
    geometry.computeVertexNormals();
    return { material, geometry, collides: !['rose','teal','windowWarm','blossom','wood'].includes(material) };
  });
}

/** A world owns its lazy prototypes. Chunk assembly copies their buffers before transforming them. */
export class ArchitectureLibrary {
  private readonly models = new Map<ArchitectureModel, ArchitecturePart[]>();

  parts(model: ArchitectureModel): readonly ArchitecturePart[] {
    let parts = this.models.get(model);
    if (!parts) {
      parts = buildModel(model);
      this.models.set(model, parts);
    }
    return parts;
  }

  dispose(): void {
    for (const parts of this.models.values()) for (const part of parts) part.geometry.dispose();
    this.models.clear();
  }
}

