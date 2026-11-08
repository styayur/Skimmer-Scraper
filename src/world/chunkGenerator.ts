import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashNumbers, fingerprintValues, seededRandom } from './deterministic';
import { createWorldMaterials, type WorldMaterialKey, type WorldMaterials } from './materials';
import { chance, pick, range, type Random } from './rng';
import {
  createBillboardMaterialSet,
  createBillboardMesh,
  type BillboardMaterialSet,
  type BillboardPlacement,
} from './signage';
import { terrainHeightAt } from './terrain';
import {
  CHUNK_SIZE,
  GENERATOR_VERSION,
  type WorldSettings,
} from './worldConfig';
import type { GeneratedChunk } from './worldTypes';

interface ChunkWork {
  render: Map<WorldMaterialKey, THREE.BufferGeometry[]>;
  collision: THREE.BufferGeometry[];
  bounds: THREE.Box3;
  billboards: BillboardPlacement[];
  signature: Array<number | string | boolean>;
  buildings: number;
  bridges: number;
  islands: number;
}

const matrixAt = (
  x: number,
  y: number,
  z: number,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
): THREE.Matrix4 => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, rotationY, rotationZ, 'YXZ')),
  new THREE.Vector3(scaleX, scaleY, scaleZ),
);

const prepareGeometry = (source: THREE.BufferGeometry): THREE.BufferGeometry => {
  let geometry = source;
  if (geometry.index) {
    geometry = source.toNonIndexed();
    source.dispose();
  }
  for (const attribute of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'uv'].includes(attribute)) geometry.deleteAttribute(attribute);
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
  }
  geometry.clearGroups();
  return geometry;
};

const triangleCount = (geometry: THREE.BufferGeometry): number =>
  (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;

const makeRoundedBox = (width: number, height: number, depth: number): THREE.BufferGeometry =>
  new RoundedBoxGeometry(width, height, depth, 2, Math.min(0.5, width * 0.1, depth * 0.1));

const createIslandGeometry = (random: Random, radius: number, height: number): THREE.BufferGeometry => {
  const geometry = new THREE.CylinderGeometry(radius * 0.9, radius * 0.32, height, 12, 4, false);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const phase = range(random, 0, Math.PI * 2);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const vertical = (y + height * 0.5) / height;
    const wobble = 1 + Math.sin(angle * 5 + phase) * 0.1 * (1 - vertical) + Math.cos(angle * 7 - phase) * 0.055;
    positions.setX(index, x * wobble);
    positions.setZ(index, z * wobble);
    positions.setY(index, y - Math.max(0, Math.sin(angle * 3 + phase)) * 4 * (1 - vertical));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

const createGroundTile = (
  settings: WorldSettings,
  chunkX: number,
  chunkZ: number,
  segments = 6,
): THREE.BufferGeometry => {
  const x0 = chunkX * CHUNK_SIZE;
  const z0 = chunkZ * CHUNK_SIZE;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const localX = (ix / segments) * CHUNK_SIZE;
      const localZ = (iz / segments) * CHUNK_SIZE;
      const worldX = x0 + localX;
      const worldZ = z0 + localZ;
      positions.push(localX, terrainHeightAt(worldX, worldZ, settings), localZ);
      uvs.push(worldX / 96, worldZ / 96);
    }
  }
  for (let iz = 0; iz < segments; iz += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = iz * (segments + 1) + ix;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const inSpawnSafetyCorridor = (worldX: number, worldZ: number): boolean =>
  worldZ > -120 && worldZ < 220 && Math.abs(worldX) < 92;

export class ChunkGenerator {
  private readonly materials: WorldMaterials;
  private readonly billboardMaterials: BillboardMaterialSet;

  public constructor(
    public readonly settings: WorldSettings,
    materials = createWorldMaterials(),
    billboardMaterials = createBillboardMaterialSet(),
  ) {
    this.materials = materials;
    this.billboardMaterials = billboardMaterials;
  }

  public generate(chunkX: number, chunkZ: number, revision = 0): GeneratedChunk {
    const key = `chunk:${chunkX}:${chunkZ}:r${revision}`;
    const origin = { x: chunkX * CHUNK_SIZE, y: 0, z: chunkZ * CHUNK_SIZE };
    const work: ChunkWork = {
      render: new Map(),
      collision: [],
      bounds: new THREE.Box3().makeEmpty(),
      billboards: [],
      signature: [this.settings.seed, this.settings.generatorVersion, this.settings.preset, chunkX, chunkZ, revision],
      buildings: 0,
      bridges: 0,
      islands: 0,
    };
    const group = new THREE.Group();
    group.name = `chunk-${chunkX}-${chunkZ}-r${revision}`;
    group.position.set(origin.x, origin.y, origin.z);

    const addPiece = (
      materialKey: WorldMaterialKey,
      source: THREE.BufferGeometry,
      matrix: THREE.Matrix4,
      collides: boolean,
    ): void => {
      const geometry = prepareGeometry(source);
      geometry.applyMatrix4(matrix);
      let bucket = work.render.get(materialKey);
      if (!bucket) {
        bucket = [];
        work.render.set(materialKey, bucket);
      }
      bucket.push(geometry);
      if (collides) {
        const collider = geometry.clone();
        collider.computeBoundingBox();
        if (collider.boundingBox) work.bounds.union(collider.boundingBox);
        work.collision.push(collider);
      }
    };

    const addBox = (
      materialKey: WorldMaterialKey,
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      rotationY = 0,
      collides = true,
    ): void => addPiece(materialKey, new THREE.BoxGeometry(width, height, depth), matrixAt(x, y, z, 0, rotationY), collides);

    addPiece('ground', createGroundTile(this.settings, chunkX, chunkZ), matrixAt(0, 0, 0), true);

    if (this.settings.config.terrainAmplitude <= 0.001) {
      const lineRandom = seededRandom(this.settings.seed, GENERATOR_VERSION, 'lane', chunkX, chunkZ);
      const x0 = chunkX * CHUNK_SIZE;
      const z0 = chunkZ * CHUNK_SIZE;
      for (const [axis, color] of [['x', 'teal'], ['z', 'rose']] as const) {
        const spacing = this.settings.config.streetSpacing;
        const start = Math.floor((axis === 'x' ? x0 : z0) / spacing) - 1;
        const end = Math.ceil(((axis === 'x' ? x0 : z0) + CHUNK_SIZE) / spacing) + 1;
        for (let line = start; line <= end; line += 1) {
          const worldPosition = line * spacing;
          if (axis === 'x' && worldPosition >= x0 && worldPosition < x0 + CHUNK_SIZE) {
            if (chance(lineRandom, 0.72)) {
              addBox(color, 0.12, 0.06, CHUNK_SIZE + 1.2, worldPosition - x0, terrainHeightAt(worldPosition, z0 + CHUNK_SIZE * 0.5, this.settings) + 0.06, CHUNK_SIZE * 0.5, 0, false);
            }
          } else if (axis === 'z' && worldPosition >= z0 && worldPosition < z0 + CHUNK_SIZE) {
            if (chance(lineRandom, 0.72)) {
              addBox(color, CHUNK_SIZE + 1.2, 0.06, 0.12, CHUNK_SIZE * 0.5, terrainHeightAt(x0 + CHUNK_SIZE * 0.5, worldPosition, this.settings) + 0.07, worldPosition - z0, 0, false);
            }
          }
        }
      }
    }

    const addBillboard = (x: number, y: number, z: number, rotationY: number, width = 18, height = 9): void => {
      work.billboards.push({ x, y, z, rotationY, width, height, index: work.billboards.length });
    };

    const addFacadeWindows = (
      x: number,
      z: number,
      width: number,
      depth: number,
      baseY: number,
      topY: number,
      random: Random,
    ): void => {
      const floorStep = range(random, 5.1, 7.4);
      const face = pick(random, [0, 1, 2, 3]);
      const faces = [face, (face + 2) % 4];
      for (const side of faces) {
        const span = side < 2 ? width : depth;
        const columns = Math.max(1, Math.floor(span / 7));
        for (let y = baseY + 3.2; y < topY - 1.8; y += floorStep) {
          if (chance(random, 0.08 + (1 - this.settings.config.farDensity) * 0.25)) continue;
          const count = Math.min(columns, 1 + Math.floor(random() * 3));
          for (let column = 0; column < count; column += 1) {
            const offset = ((column + 0.5) / count - 0.5) * span * 0.78;
            const windowWidth = range(random, 1.2, 2.5);
            const windowHeight = range(random, 0.8, 1.5);
            let px = x;
            let pz = z;
            let rotationY = 0;
            if (side === 0) { px += offset; pz += depth * 0.5 + 0.05; }
            else if (side === 1) { px -= offset; pz -= depth * 0.5 + 0.05; rotationY = Math.PI; }
            else if (side === 2) { px += width * 0.5 + 0.05; pz += offset; rotationY = Math.PI * 0.5; }
            else { px -= width * 0.5 + 0.05; pz -= offset; rotationY = -Math.PI * 0.5; }
            addPiece('windowWarm', new THREE.PlaneGeometry(windowWidth, windowHeight), matrixAt(px, y, pz, 0, rotationY), false);
          }
        }
      }
    };

    const addTower = (
      worldX: number,
      worldZ: number,
      width: number,
      depth: number,
      height: number,
      lotSize: number,
      random: Random,
      lotSignature: number,
    ): void => {
      const localX = worldX - origin.x;
      const localZ = worldZ - origin.z;
      const groundValues = [
        terrainHeightAt(worldX - width * 0.5, worldZ - depth * 0.5, this.settings),
        terrainHeightAt(worldX + width * 0.5, worldZ - depth * 0.5, this.settings),
        terrainHeightAt(worldX - width * 0.5, worldZ + depth * 0.5, this.settings),
        terrainHeightAt(worldX + width * 0.5, worldZ + depth * 0.5, this.settings),
      ];
      const baseY = Math.max(...groundValues);
      const foundationDepth = baseY - Math.min(...groundValues) + 5;
      const materialKey = pick(random, ['shellCeladon', 'shellPlum', 'shellIvory'] as const);
      const accent: WorldMaterialKey = chance(random, 0.5) ? 'rose' : 'teal';
      const style = pick(random, ['setback', 'setback', 'faceted', 'lantern'] as const);
      const rotationY = chance(random, 0.55) ? range(random, -0.16, 0.16) : 0;
      work.buildings += 1;
      work.signature.push('b', lotSignature, Math.round(worldX), Math.round(worldZ), Math.round(height), materialKey, style);

      const foundationWidth = Math.min(lotSize * 0.94, width + 6);
      const foundationDepthSize = Math.min(lotSize * 0.94, depth + 6);
      addBox(materialKey, foundationWidth, foundationDepth, foundationDepthSize, localX, baseY - foundationDepth * 0.5, localZ, rotationY, true);

      if (style === 'faceted') {
        const radius = width * 0.46;
        addPiece(materialKey, new THREE.CylinderGeometry(radius * 0.76, radius, height, 8, 5, false), matrixAt(localX, baseY + height * 0.5, localZ, 0, rotationY), true);
        addPiece('glass', new THREE.CylinderGeometry(radius * 0.42, radius * 0.62, height * 0.22, 8, 2, false), matrixAt(localX, baseY + height * 0.87, localZ, 0, rotationY), true);
        const bands = Math.max(3, Math.floor(height / 20));
        for (let band = 1; band <= bands; band += 1) {
          const y = baseY + (height / (bands + 1)) * band;
          const ringRadius = radius * (1 - (band / bands) * 0.18) + 0.08;
          addPiece(band % 3 === 0 ? accent : 'teal', new THREE.TorusGeometry(ringRadius, 0.13, 4, 30), matrixAt(localX, y, localZ, Math.PI * 0.5), false);
        }
        const spireHeight = range(random, 7, 22);
        addPiece(accent, new THREE.ConeGeometry(radius * 0.22, spireHeight, 5), matrixAt(localX, baseY + height + spireHeight * 0.5, localZ, 0, rotationY), true);
        if (chance(random, 0.34)) addBillboard(localX, baseY + height * 0.72, localZ + radius + 0.2, 0, width * 0.55, width * 0.26);
        return;
      }

      const podiumHeight = range(random, 8, 14);
      const podiumWidth = Math.min(lotSize * 0.96, width + range(random, 4, 10));
      const podiumDepth = Math.min(lotSize * 0.96, depth + range(random, 4, 9));
      addPiece(materialKey, makeRoundedBox(podiumWidth, podiumHeight, podiumDepth), matrixAt(localX, baseY + podiumHeight * 0.5, localZ, 0, rotationY), true);
      let cursorY = baseY + podiumHeight;
      let sectionWidth = width;
      let sectionDepth = depth;
      const usable = height - podiumHeight;
      const sections = Math.max(1, Math.min(4, Math.floor(usable / 36) + (chance(random, 0.35) ? 1 : 0)));
      let roofY = cursorY;
      for (let section = 0; section < sections; section += 1) {
        const sectionHeight = (baseY + height - cursorY) / (sections - section) * range(random, 0.84, 1.1);
        const sectionX = localX + range(random, -1.4, 1.4);
        const sectionZ = localZ + range(random, -1.4, 1.4);
        addPiece(materialKey, makeRoundedBox(sectionWidth, sectionHeight, sectionDepth), matrixAt(sectionX, cursorY + sectionHeight * 0.5, sectionZ, 0, rotationY), true);
        addFacadeWindows(sectionX, sectionZ, sectionWidth, sectionDepth, cursorY, cursorY + sectionHeight, random);
        if (chance(random, 0.48)) {
          addPiece(accent, new THREE.BoxGeometry(0.14, sectionHeight * 0.86, 0.14), matrixAt(sectionX + sectionWidth * 0.5 + 0.08, cursorY + sectionHeight * 0.48, sectionZ + sectionDepth * 0.3), false);
        }
        cursorY += sectionHeight;
        roofY = cursorY;
        sectionWidth *= range(random, 0.79, 0.91);
        sectionDepth *= range(random, 0.8, 0.92);
      }

      if (style === 'lantern') {
        const lanternWidth = Math.max(7, sectionWidth * 1.3);
        addPiece('glass', new THREE.BoxGeometry(lanternWidth, 10, Math.max(7, sectionDepth * 1.25)), matrixAt(localX, roofY + 5, localZ, 0, rotationY), true);
        addBox(accent, lanternWidth + 0.3, 0.26, sectionDepth * 1.25 + 0.3, localX, roofY, localZ, rotationY, false);
        addBox(accent, lanternWidth + 0.3, 0.26, sectionDepth * 1.25 + 0.3, localX, roofY + 10, localZ, rotationY, false);
        roofY += 10;
      }

      addPiece(accent, new THREE.TorusGeometry(Math.max(2.5, Math.min(sectionWidth, sectionDepth) * 0.5), 0.2, 5, 32), matrixAt(localX, roofY + 0.25, localZ, Math.PI * 0.5), false);
      if (chance(random, 0.33)) {
        addBox('wood', Math.max(4, sectionWidth * 0.5), 1, 4, localX, roofY + 0.5, localZ + sectionDepth * 0.18, rotationY, false);
        for (let bloom = 0; bloom < 3; bloom += 1) {
          addPiece('blossom', new THREE.IcosahedronGeometry(range(random, 1.2, 2.2), 1), matrixAt(localX + range(random, -2.5, 2.5), roofY + range(random, 1.4, 2.8), localZ + range(random, -1.5, 2.5), 0, 0, 0, 1.05, 0.8, 1.05), false);
        }
      }
      if (chance(random, 0.68)) {
        const spireHeight = range(random, 6, 23);
        addPiece(accent, new THREE.ConeGeometry(range(random, 0.35, 0.85), spireHeight, 5), matrixAt(localX, roofY + spireHeight * 0.5, localZ, 0, rotationY), true);
        roofY += spireHeight;
      }
      if (chance(random, 0.28)) addBillboard(localX, roofY + 6, localZ + Math.max(sectionDepth, 8) * 0.45 + 0.5, 0, Math.max(13, sectionWidth * 0.8), Math.max(6.5, sectionWidth * 0.4));
    };

    const spacing = this.settings.config.streetSpacing;
    const streetWidth = this.settings.config.streetWidth;
    const lotSize = Math.max(10, (spacing - streetWidth) / 2);
    const x0 = chunkX * CHUNK_SIZE;
    const z0 = chunkZ * CHUNK_SIZE;
    const blockStartX = Math.floor(x0 / spacing) - 1;
    const blockEndX = Math.ceil((x0 + CHUNK_SIZE) / spacing) + 1;
    const blockStartZ = Math.floor(z0 / spacing) - 1;
    const blockEndZ = Math.ceil((z0 + CHUNK_SIZE) / spacing) + 1;

    for (let blockX = blockStartX; blockX <= blockEndX; blockX += 1) {
      for (let blockZ = blockStartZ; blockZ <= blockEndZ; blockZ += 1) {
        for (let subX = 0; subX < 2; subX += 1) {
          for (let subZ = 0; subZ < 2; subZ += 1) {
            const lotRandom = seededRandom(this.settings.seed, this.settings.generatorVersion, revision, 'lot', blockX, blockZ, subX, subZ);
            const effectiveDensity = Math.min(0.78, this.settings.config.buildingDensity * (0.78 + this.settings.config.farDensity * 0.28));
            if (!chance(lotRandom, effectiveDensity)) continue;
            const centerX = blockX * spacing + streetWidth * 0.5 + lotSize * (subX + 0.5);
            const centerZ = blockZ * spacing + streetWidth * 0.5 + lotSize * (subZ + 0.5);
            const maxWidth = lotSize * range(lotRandom, 0.56, 0.82) * Math.min(1.18, this.settings.config.buildingVariation);
            const maxDepth = lotSize * range(lotRandom, 0.56, 0.82) * Math.min(1.18, this.settings.config.buildingVariation);
            if (centerX - maxWidth * 0.5 < x0 + 2 || centerX + maxWidth * 0.5 > x0 + CHUNK_SIZE - 2) continue;
            if (centerZ - maxDepth * 0.5 < z0 + 2 || centerZ + maxDepth * 0.5 > z0 + CHUNK_SIZE - 2) continue;
            if (inSpawnSafetyCorridor(centerX, centerZ)) continue;
            const heightVariation = 0.72 + lotRandom() * 0.56 * this.settings.config.buildingVariation;
            const height = range(lotRandom, this.settings.config.buildingHeightMin, this.settings.config.buildingHeightMax) * heightVariation;
            addTower(centerX, centerZ, maxWidth, maxDepth, height, lotSize, lotRandom, hashNumbers(blockX, blockZ, subX, subZ));
          }
        }
      }
    }

    const bridgeLine = (axis: 'x' | 'z', lineIndex: number): { enabled: boolean; height: number } => {
      const random = seededRandom(this.settings.seed, this.settings.generatorVersion, 'bridge-line', axis === 'x' ? 1 : 2, lineIndex);
      return {
        enabled: random() < this.settings.config.bridgeFrequency,
        height: range(random, this.settings.config.bridgeHeightMin, this.settings.config.bridgeHeightMax),
      };
    };

    const addBridgeSegment = (axis: 'x' | 'z', lineIndex: number): void => {
      const line = bridgeLine(axis, lineIndex);
      if (!line.enabled) return;
      const lineWorld = lineIndex * spacing;
      const localLine = lineWorld - (axis === 'x' ? z0 : x0);
      const centerLocal = CHUNK_SIZE * 0.5;
      const length = CHUNK_SIZE + 4;
      const y = line.height;
      if (axis === 'x') {
        addBox('bridge', length, 1.7, 7.5, centerLocal, y, localLine, 0, true);
        addBox('teal', length, 0.12, 0.18, centerLocal, y + 0.95, localLine + 3.6, 0, false);
        addBox('rose', length, 0.12, 0.18, centerLocal, y + 0.95, localLine - 3.6, 0, false);
        for (const supportX of [CHUNK_SIZE * 0.25, CHUNK_SIZE * 0.75]) {
          const ground = terrainHeightAt(x0 + supportX, lineWorld, this.settings);
          addBox('bridge', 2.1, Math.max(4, y - ground), 2.1, supportX, ground + (y - ground) * 0.5, localLine, 0, true);
        }
      } else {
        addBox('bridge', 7.5, 1.7, length, localLine, y, centerLocal, 0, true);
        addBox('teal', 0.18, 0.12, length, localLine + 3.6, y + 0.95, centerLocal, 0, false);
        addBox('rose', 0.18, 0.12, length, localLine - 3.6, y + 0.95, centerLocal, 0, false);
        for (const supportZ of [CHUNK_SIZE * 0.25, CHUNK_SIZE * 0.75]) {
          const ground = terrainHeightAt(lineWorld, z0 + supportZ, this.settings);
          addBox('bridge', 2.1, Math.max(4, y - ground), 2.1, localLine, ground + (y - ground) * 0.5, supportZ, 0, true);
        }
      }
      if (lineIndex % 4 === 0 && chance(seededRandom(this.settings.seed, revision, 'bridge-sign', axis, lineIndex), 0.35)) {
        addBillboard(axis === 'x' ? centerLocal : localLine, y + 7, axis === 'x' ? localLine + 4 : centerLocal, axis === 'x' ? 0 : Math.PI * 0.5, 22, 7);
      }
      work.bridges += 1;
      work.signature.push('bridge', axis, lineIndex, Math.round(y * 10));
    };

    for (let line = Math.floor(z0 / spacing) - 1; line <= Math.ceil((z0 + CHUNK_SIZE) / spacing) + 1; line += 1) {
      if (line * spacing >= z0 && line * spacing < z0 + CHUNK_SIZE) addBridgeSegment('x', line);
    }
    for (let line = Math.floor(x0 / spacing) - 1; line <= Math.ceil((x0 + CHUNK_SIZE) / spacing) + 1; line += 1) {
      if (line * spacing >= x0 && line * spacing < x0 + CHUNK_SIZE) addBridgeSegment('z', line);
    }

    const islandRandom = seededRandom(this.settings.seed, this.settings.generatorVersion, revision, 'island', chunkX, chunkZ);
    if (chance(islandRandom, this.settings.config.islandFrequency)) {
      const radius = Math.min(CHUNK_SIZE * 0.22, range(islandRandom, 24, 44));
      const margin = radius + 8;
      if (margin * 2 < CHUNK_SIZE) {
        const localX = range(islandRandom, margin, CHUNK_SIZE - margin);
        const localZ = range(islandRandom, margin, CHUNK_SIZE - margin);
        const worldX = x0 + localX;
        const worldZ = z0 + localZ;
        if (!inSpawnSafetyCorridor(worldX, worldZ)) {
          const height = range(islandRandom, 26, 50);
          const minimumY = Math.max(this.settings.config.suspendedHeightMin, this.settings.config.buildingHeightMax + height * 0.5 + 15);
          if (minimumY <= this.settings.config.suspendedHeightMax) {
            const y = range(islandRandom, minimumY, this.settings.config.suspendedHeightMax);
            addPiece('rock', createIslandGeometry(islandRandom, radius, height), matrixAt(localX, y, localZ), true);
            addPiece('soil', new THREE.CylinderGeometry(radius * 0.84, radius * 0.8, 2.4, 12), matrixAt(localX, y + height * 0.5 + 0.9, localZ), true);
            addPiece('teal', new THREE.TorusGeometry(radius * 0.62, 0.22, 5, 32), matrixAt(localX, y - height * 0.2, localZ, Math.PI * 0.5), false);
            const treeCount = Math.max(2, Math.floor(radius / 12));
            for (let tree = 0; tree < treeCount; tree += 1) {
              const angle = range(islandRandom, 0, Math.PI * 2);
              const distance = range(islandRandom, radius * 0.2, radius * 0.68);
              const treeX = localX + Math.cos(angle) * distance;
              const treeZ = localZ + Math.sin(angle) * distance;
              const treeHeight = range(islandRandom, 5, 10);
              addPiece('wood', new THREE.CylinderGeometry(0.25, 0.5, treeHeight, 5), matrixAt(treeX, y + height * 0.5 + 2 + treeHeight * 0.5, treeZ), false);
              for (let crown = 0; crown < 3; crown += 1) {
                addPiece('blossom', new THREE.IcosahedronGeometry(range(islandRandom, 1.4, 3), 1), matrixAt(treeX + range(islandRandom, -1.8, 1.8), y + height * 0.5 + treeHeight + range(islandRandom, 1, 3), treeZ + range(islandRandom, -1.8, 1.8), 0, 0, 0, 1.1, 0.75, 1.1), false);
              }
            }
            work.islands += 1;
            work.signature.push('island', Math.round(localX), Math.round(localZ), Math.round(y), Math.round(radius));
          }
        }
      }
    }

    for (const placement of work.billboards) group.add(createBillboardMesh(placement, this.billboardMaterials.materials));

    let renderTriangles = 0;
    for (const [materialKey, geometries] of work.render) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.materials.byKey[materialKey]);
      mesh.name = `${key}-${materialKey}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.castShadow = !['rose', 'teal', 'windowWarm', 'water'].includes(materialKey);
      mesh.receiveShadow = ['ground', 'shellCeladon', 'shellPlum', 'shellIvory', 'bridge', 'rock', 'soil'].includes(materialKey);
      group.add(mesh);
      renderTriangles += triangleCount(merged);
    }

    const mergedCollision = mergeGeometries(work.collision, false);
    for (const geometry of work.collision) geometry.dispose();
    if (!mergedCollision) throw new Error(`Chunk ${key} produced no collision geometry.`);
    mergedCollision.computeBoundingBox();
    mergedCollision.computeBoundingSphere();
    const collisionTriangles = triangleCount(mergedCollision);

    return {
      key,
      chunkX,
      chunkZ,
      revision,
      origin,
      group,
      bounds: work.bounds.clone(),
      collisionGeometry: mergedCollision,
      fingerprint: fingerprintValues(...work.signature),
      stats: {
        buildings: work.buildings,
        bridges: work.bridges,
        islands: work.islands,
        collisionTriangles,
        renderTriangles,
      },
    };
  }

  public dispose(): void {
    this.materials.dispose();
    this.billboardMaterials.dispose();
  }
}




