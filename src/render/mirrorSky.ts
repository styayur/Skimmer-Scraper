import * as THREE from 'three';
import { cityDistrictAt } from '../world/cityDistricts';
import { seededRandom } from '../world/deterministic';
import type { WorldSettings } from '../world/worldConfig';

export const MIRROR_GROUND = Object.freeze({ height: 650, radius: 1530 });

export interface MirrorGroundPalette {
  stone: THREE.Color;
  haze: THREE.Color;
}

/** Seeded, inverted city above the viewer. The renderer owns all of its geometry. */
export class MirrorSky {
  public readonly group = new THREE.Group();
  private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  private seed: number | null = null;
  private triangles = 0;
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  private readonly groundPalette: MirrorGroundPalette = { stone: new THREE.Color(), haze: new THREE.Color() };

  public get ground(): MirrorGroundPalette | null {
    return this.seed === null ? null : this.groundPalette;
  }

  public setWorld(settings: WorldSettings, top: number, mid: number): void {
    this.clear();
    this.seed = settings.seed;
    const random = seededRandom(settings.seed, 'mirror-sky');
    const positions: number[] = [];
    const colors: number[] = [];
    const box = new THREE.BoxGeometry();
    const indices = box.index!;
    const vertices = box.getAttribute('position');
    const normals = box.getAttribute('normal');
    const base = new THREE.Color(top).lerp(new THREE.Color(mid), 0.34);
    const blue = new THREE.Color().setHSL(settings.paletteHue ?? 0.74, 0.29, 0.28);
    const stone = base.clone().lerp(blue, 0.22);
    const glow = new THREE.Color(mid).lerp(new THREE.Color(0xb5a1bc), 0.15);
    const shade = new THREE.Color();
    this.groundPalette.stone.copy(stone).lerp(new THREE.Color(top), 0.34);
    this.groundPalette.haze.copy(base).lerp(glow, 0.53);
    const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, haze: number) => {
      for (let index = 0; index < indices.count; index++) {
        const vertex = indices.getX(index);
        positions.push(x + w * vertices.getX(vertex), y + h * vertices.getY(vertex), z + d * vertices.getZ(vertex));
        const litFace = normals.getY(vertex) < 0 ? 0.09 : normals.getX(vertex) < 0 ? -0.045 : 0.01;
        shade.copy(stone).lerp(glow, haze + litFace);
        colors.push(shade.r, shade.g, shade.b);
      }
    };

    const rotation = random() * Math.PI * 2;
    for (let layer = 0; layer < 2; layer++) {
      const radius = 510 + layer * 340;
      const haze = 0.14 + layer * 0.15;
      for (let sector = 0; sector < 10; sector++) {
        const angle = rotation + (sector + layer * 0.45) / 10 * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const district = cityDistrictAt(settings.seed, x, z);
        const foundationDepth = 14 + random() * 18;
        const elevation = MIRROR_GROUND.height - foundationDepth - 8;
        const width = 110 + 125 * district.gardens;
        addBox(x, MIRROR_GROUND.height - foundationDepth / 2, z, width * 1.07, foundationDepth, 142, haze);
        addBox(x, elevation + 4, z, width * 0.9, 12, 112, haze + 0.06);
        let shortestTower = Infinity;
        for (const offset of [-0.3, 0, 0.31]) {
          const height = 80 + district.towers * 127 + random() * 95;
          shortestTower = Math.min(shortestTower, height);
          const towerWidth = 28 + random() * 22;
          const towerZ = z + (random() - 0.5) * 53;
          const towerX = x + width * offset;
          addBox(towerX, elevation - height / 2, towerZ, towerWidth, height, towerWidth * 0.8, haze);
          addBox(towerX, elevation - height - 10, towerZ, towerWidth * 0.65, 20, towerWidth * 0.56, haze + 0.025);
          if (offset === 0) addBox(towerX, elevation - height - 33, towerZ, 6, 29, 6, haze + 0.08);
        }
        const bridgeDrop = Math.min(54 + 52 * district.crossings, shortestTower - 12);
        const bridgeHeight = elevation - bridgeDrop;
        // Both decks run through the three tower footprints.
        addBox(x, bridgeHeight, z, width * 0.75, 9, 66, haze + 0.06);
        addBox(x, bridgeHeight + 22, z, width * 0.68, 6, 64, haze + 0.1);
      }
    }

    box.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    this.triangles = positions.length / 9;
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'upside-down-skyline';
    this.group.add(this.mesh);
  }

  public follow(camera: THREE.Camera): void {
    this.group.position.copy(camera.position);
  }

  public snapshot(camera: THREE.Camera) {
    return { seed: this.seed, triangles: this.triangles, cameraOffset: this.group.position.distanceTo(camera.position),
      ground: this.ground ? MIRROR_GROUND : null };
  }

  public clear(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.seed = null;
    this.triangles = 0;
  }

  public dispose(): void {
    this.clear();
    this.material.dispose();
  }
}
