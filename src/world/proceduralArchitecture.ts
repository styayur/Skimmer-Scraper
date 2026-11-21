import * as THREE from 'three';
import type { Vec3 } from '../core/math';
import { seededRandom } from './deterministic';
import type { DynamicColliderRegistry } from './dynamicColliderRegistry';
import { CHUNK_SIZE, type WorldSettings } from './worldConfig';

const areaSize = CHUNK_SIZE * 2;
const types = ['garden', 'shuttle', 'ring', 'lift'] as const;
type StructureType = typeof types[number];
interface Structure {
  id: string;
  type: StructureType;
  mesh: THREE.Mesh;
  anchor: Vec3;
  phase: number;
  period: number;
  angle: number;
}

export const MAX_MOVING_STRUCTURES = 8;

/** Structures are owned by an airspace region larger than a streamed city chunk. */
export class ProceduralArchitecture {
  public readonly group = new THREE.Group();
  private readonly active = new Map<string, Structure>();
  private readonly archetypes: Record<StructureType, { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }>;
  private previousCoverage = '';
  private time = 0;

  public constructor(private readonly world: WorldSettings, private readonly colliders: DynamicColliderRegistry) {
    const finish = (geometry: THREE.BufferGeometry, hue: number) => ({
      geometry,
      material: new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.43, 0.32),
        roughness: 0.62, metalness: 0.25, emissive: new THREE.Color().setHSL(hue, 0.72, 0.22), emissiveIntensity: 0.48 }),
    });
    const hue = world.paletteHue ?? 0.49;
    this.archetypes = {
      garden: finish(new THREE.CylinderGeometry(21, 14, 11, 9, 1), hue),
      shuttle: finish(new THREE.CapsuleGeometry(5.8, 36, 3, 9).rotateZ(Math.PI / 2), (hue + 0.37) % 1),
      ring: finish(new THREE.TorusGeometry(23, 3.2, 8, 32), (hue + 0.48) % 1),
      lift: finish(new THREE.CylinderGeometry(10, 17, 32, 6, 1), (hue + 0.12) % 1),
    };
    this.group.name = 'moving-architecture';
  }

  public cover(player: Vec3, wings: readonly Vec3[]): void {
    const centers = [player, ...wings].map(point => [Math.floor(point.x / areaSize), Math.floor(point.z / areaSize)] as const);
    const coverage = centers.map(([x, z]) => `${x}:${z}`).join('/');
    if (coverage === this.previousCoverage) return;
    this.previousCoverage = coverage;
    const options = new Map<string, { x: number; z: number; rank: number }>();
    centers.forEach(([x, z], index) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const key = `${x + dx}:${z + dz}`;
        const rank = dx * dx + dz * dz + (index > 0 ? 0.2 : 0);
        if ((options.get(key)?.rank ?? Infinity) > rank) options.set(key, { x: x + dx, z: z + dz, rank });
      }
    });
    const desired = new Map([...options].sort(([, a], [, b]) => a.rank - b.rank || a.x - b.x || a.z - b.z).slice(0, MAX_MOVING_STRUCTURES));
    for (const [key, structure] of this.active) {
      if (desired.has(key)) continue;
      this.group.remove(structure.mesh);
      this.colliders.remove(structure.id);
      this.active.delete(key);
    }
    for (const [key, region] of desired) {
      if (this.active.has(key)) continue;
      const random = seededRandom(this.world.seed, this.world.generatorVersion, 'architecture', region.x, region.z);
      const type = types[((region.x + region.z * 3) % types.length + types.length) % types.length]!;
      const anchor = { x: (region.x + 0.5) * areaSize, y: this.world.config.buildingHeightMax + 66 + random() * 42,
        z: (region.z + 0.5) * areaSize + (random() - 0.5) * 70 };
      const archetype = this.archetypes[type];
      const mesh = new THREE.Mesh(archetype.geometry, archetype.material);
      const id = `moving:${key}:${type}`;
      mesh.name = id;
      const structure: Structure = { id, mesh, type, anchor, phase: random() * Math.PI * 2, period: 7 + random() * 9, angle: random() * Math.PI * 2 };
      this.place(structure);
      this.group.add(mesh);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', mesh.geometry.getAttribute('position').clone());
      geometry.setIndex(mesh.geometry.index?.clone() ?? null);
      this.colliders.add(id, key, geometry, mesh.matrix, true);
      this.active.set(key, structure);
    }
  }

  public step(dt: number): void {
    this.time += dt;
    for (const structure of this.active.values()) {
      this.place(structure);
      this.colliders.setTransform(structure.id, structure.mesh.matrix, dt);
    }
  }

  public reset(): void {
    this.time = 0;
    this.step(0);
  }

  public shiftOrigin(origin: Vec3): void { this.group.position.set(-origin.x, -origin.y, -origin.z); }

  public snapshot() {
    return [...this.active.values()].map(({ id, type, mesh }) => ({
      id, type, position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }, yaw: mesh.rotation.y,
    }));
  }

  public dispose(): void {
    for (const structure of this.active.values()) this.colliders.remove(structure.id);
    for (const item of Object.values(this.archetypes)) {
      item.geometry.dispose();
      item.material.dispose();
    }
    this.active.clear();
    this.group.clear();
  }

  private place({ type, mesh, anchor, phase, period, angle }: Structure): void {
    const cycle = this.time / period * Math.PI * 2 + phase;
    const wave = Math.sin(cycle);
    const shift = type === 'shuttle' ? wave * 61 : 0;
    const climb = type === 'lift' ? wave * 36 : type === 'garden' ? wave * 19 : Math.sin(cycle * 2) * 9;
    mesh.position.set(anchor.x + Math.cos(angle) * shift, anchor.y + climb, anchor.z + Math.sin(angle) * shift);
    mesh.rotation.y = type === 'ring' ? angle + this.time * 0.43 : angle;
    mesh.updateMatrix();
  }
}
