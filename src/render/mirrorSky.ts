import * as THREE from 'three';
import { cityDistrictAt } from '../world/cityDistricts';
import { seededRandom } from '../world/deterministic';
import type { WorldSettings } from '../world/worldConfig';

const GROUND_HEIGHT = 650;
const GROUND_RADIUS = 1530;
const GROUND_SEGMENTS = 64;

function createGround() {
  const geometry = new THREE.CircleGeometry(GROUND_RADIUS, GROUND_SEGMENTS).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uStone: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() },
    },
    vertexShader: `
      varying vec2 vGround;
      void main() {
        vGround = 2.0 * uv - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uStone;
      uniform vec3 uHaze;
      varying vec2 vGround;
      void main() {
        float radius = length(vGround);
        float air = smoothstep(0.22, 0.96, radius);
        vec3 color = mix(uStone, uHaze, air);
        vec2 grid = vGround * 10.0;
        vec2 distanceToStreet = abs(fract(grid + 0.5) - 0.5);
        vec2 filtered = max(fwidth(grid), vec2(0.009));
        vec2 street = 1.0 - smoothstep(vec2(0.012), filtered + 0.023, distanceToStreet);
        color = mix(color, uHaze, max(street.x, street.y) * (1.0 - air) * 0.24);
        float opacity = 0.96 * (1.0 - smoothstep(0.56, 0.99, radius));
        gl_FragColor = vec4(color, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'upside-down-city-ground';
  ground.position.y = GROUND_HEIGHT;
  return ground;
}

/** Seeded, inverted city above the viewer. The renderer owns all of its geometry. */
export class MirrorSky {
  public readonly group = new THREE.Group();
  private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  private seed: number | null = null;
  private triangles = 0;
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  private readonly ground = createGround();

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
    this.ground.material.uniforms.uStone!.value.copy(stone).lerp(new THREE.Color(top), 0.34);
    this.ground.material.uniforms.uHaze!.value.copy(base).lerp(glow, 0.53);
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
        const elevation = GROUND_HEIGHT - foundationDepth - 8;
        const width = 110 + 125 * district.gardens;
        addBox(x, GROUND_HEIGHT - foundationDepth / 2, z, width * 1.07, foundationDepth, 142, haze);
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
    this.group.add(this.mesh, this.ground);
  }

  public follow(camera: THREE.Camera): void {
    this.group.position.copy(camera.position);
  }

  public snapshot(camera: THREE.Camera) {
    return { seed: this.seed, triangles: this.triangles, cameraOffset: this.group.position.distanceTo(camera.position),
      ground: this.mesh ? { height: GROUND_HEIGHT, radius: GROUND_RADIUS, triangles: GROUND_SEGMENTS } : null };
  }

  public clear(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.group.remove(this.ground);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.seed = null;
    this.triangles = 0;
  }

  public dispose(): void {
    this.clear();
    this.material.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
  }
}
