import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createWorldMaterials,
  type WorldMaterialKey,
} from './materials';
import { chance, mulberry32, pick, range, type Random } from './rng';
import { createBillboard, type BillboardPlacement } from './signage';
import type { CollisionChunk, WorldData } from './worldTypes';

const WORLD_HALF_X = 760;
const WORLD_HALF_Z = 980;
const CHUNK_SIZE = 220;
const SPAWN = {
  position: { x: 0, y: 24, z: 286 },
  yaw: 0,
  pitch: -0.015,
  speed: 66,
};

interface ChunkWork {
  id: string;
  bounds: THREE.Box3;
  collision: THREE.BufferGeometry[];
  render: Map<WorldMaterialKey, THREE.BufferGeometry[]>;
  buildings: number;
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
): THREE.Matrix4 =>
  new THREE.Matrix4().compose(
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
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  geometry.clearGroups();
  return geometry;
};

const triangleCount = (geometry: THREE.BufferGeometry): number =>
  ((geometry.index?.count ?? geometry.getAttribute('position').count) / 3);

const makeRoundedBox = (
  width: number,
  height: number,
  depth: number,
  radius = 0.5,
): THREE.BufferGeometry =>
  new RoundedBoxGeometry(width, height, depth, 2, Math.min(radius, width * 0.12, depth * 0.12));

const createIslandGeometry = (
  random: Random,
  radius: number,
  height: number,
): THREE.BufferGeometry => {
  const geometry = new THREE.CylinderGeometry(radius * 0.9, radius * 0.32, height, 12, 4, false);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const phase = range(random, 0, Math.PI * 2);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const vertical = (y + height * 0.5) / height;
    const wobble = 1 + Math.sin(angle * 5 + phase) * 0.1 * (1 - vertical) +
      Math.cos(angle * 7 - phase) * 0.055;
    positions.setX(index, x * wobble);
    positions.setZ(index, z * wobble);
    positions.setY(index, y - Math.max(0, Math.sin(angle * 3 + phase)) * 4 * (1 - vertical));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

const createCity = (seed: number): WorldData => {
  const random = mulberry32(seed);
  const materials = createWorldMaterials();
  const root = new THREE.Group();
  root.name = 'sakura-megacity';

  const billboards: BillboardPlacement[] = [];
  const chunks = new Map<string, ChunkWork>();
  let buildingCount = 0;
  let billboardIndex = 0;

  const getChunk = (x: number, z: number): ChunkWork => {
    const gx = Math.floor((x + WORLD_HALF_X) / CHUNK_SIZE);
    const gz = Math.floor((z + WORLD_HALF_Z) / CHUNK_SIZE);
    const id = `chunk-${gx}-${gz}`;
    let chunk = chunks.get(id);
    if (!chunk) {
      chunk = {
        id,
        bounds: new THREE.Box3().makeEmpty(),
        collision: [],
        render: new Map(),
        buildings: 0,
      };
      chunks.set(id, chunk);
    }
    return chunk;
  };

  const getGroundChunk = (): ChunkWork => {
    let chunk = chunks.get('ground');
    if (!chunk) {
      chunk = {
        id: 'ground',
        bounds: new THREE.Box3(
          new THREE.Vector3(-WORLD_HALF_X, -1, -WORLD_HALF_Z),
          new THREE.Vector3(WORLD_HALF_X, 2, WORLD_HALF_Z),
        ),
        collision: [],
        render: new Map(),
        buildings: 0,
      };
      chunks.set('ground', chunk);
    }
    return chunk;
  };

  const addPiece = (
    chunk: ChunkWork,
    materialKey: WorldMaterialKey,
    source: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    collides: boolean,
  ): THREE.BufferGeometry => {
    const geometry = prepareGeometry(source);
    geometry.applyMatrix4(matrix);
    let bucket = chunk.render.get(materialKey);
    if (!bucket) {
      bucket = [];
      chunk.render.set(materialKey, bucket);
    }
    bucket.push(geometry);

    if (collides) {
      const collider = geometry.clone();
      collider.computeBoundingBox();
      if (collider.boundingBox) chunk.bounds.union(collider.boundingBox);
      chunk.collision.push(collider);
    }
    return geometry;
  };

  const addBox = (
    chunk: ChunkWork,
    materialKey: WorldMaterialKey,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    rotationY = 0,
    collides = true,
  ): void => {
    addPiece(
      chunk,
      materialKey,
      new THREE.BoxGeometry(width, height, depth),
      matrixAt(x, y, z, 0, rotationY),
      collides,
    );
  };

  const addRoundedTowerPiece = (
    chunk: ChunkWork,
    materialKey: WorldMaterialKey,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    rotationY = 0,
  ): void => {
    addPiece(
      chunk,
      materialKey,
      makeRoundedBox(width, height, depth),
      matrixAt(x, y, z, 0, rotationY),
      true,
    );
  };

  const addFacadeWindows = (
    chunk: ChunkWork,
    x: number,
    z: number,
    width: number,
    depth: number,
    y0: number,
    y1: number,
    randomValue: Random,
  ): void => {
    const floorStep = range(randomValue, 4.4, 6.2);
    const innerFace = x < 0 ? 2 : 3;
    const faces = [0, innerFace];
    if (chance(randomValue, 0.42)) faces.push(x < 0 ? 3 : 2);
    if (chance(randomValue, 0.28)) faces.push(1);

    for (const face of faces) {
      const span = face < 2 ? width : depth;
      const columns = Math.max(1, Math.floor(span / 6.4));
      for (let y = y0 + 3.1; y < y1 - 2.0; y += floorStep) {
        if (chance(randomValue, 0.14)) continue;
        const count = Math.min(columns, 1 + Math.floor(randomValue() * 3));
        for (let c = 0; c < count; c += 1) {
          const offset = ((c + 0.5) / count - 0.5) * span * 0.8;
          const windowWidth = range(randomValue, 1.35, 2.8);
          const windowHeight = range(randomValue, 0.9, 1.65);
          let px = x;
          let pz = z;
          let rotationY = 0;

          if (face === 0) {
            px += offset;
            pz += depth * 0.5 + 0.045;
          } else if (face === 1) {
            px -= offset;
            pz -= depth * 0.5 + 0.045;
            rotationY = Math.PI;
          } else if (face === 2) {
            px += width * 0.5 + 0.045;
            pz += offset;
            rotationY = Math.PI * 0.5;
          } else {
            px -= width * 0.5 + 0.045;
            pz -= offset;
            rotationY = -Math.PI * 0.5;
          }

          addPiece(
            chunk,
            'windowWarm',
            new THREE.PlaneGeometry(windowWidth, windowHeight),
            matrixAt(px, y, pz, 0, rotationY),
            false,
          );
        }
      }
    }
  };

  const addBillboardAt = (
    x: number,
    y: number,
    z: number,
    rotationY: number,
    width = 18,
    height = 9,
  ): void => {
    billboards.push({ x, y, z, rotationY, width, height, index: billboardIndex });
    billboardIndex += 1;
  };

  const addTower = (x: number, z: number): void => {
    const chunk = getChunk(x, z);
    buildingCount += 1;
    chunk.buildings += 1;

    const centerFactor = 1.16 - Math.min(0.52, Math.abs(x) / 950);
    const height = range(random, 54, 190) * centerFactor;
    const width = range(random, 26, 47);
    const depth = range(random, 25, 43);
    const materialKey = pick(random, ['shellCeladon', 'shellPlum', 'shellIvory'] as const);
    const accent: WorldMaterialKey = chance(random, 0.52) ? 'rose' : 'teal';
    const style = pick(random, ['setback', 'setback', 'faceted', 'lantern'] as const);
    const rotationY = chance(random, 0.55) ? range(random, -0.16, 0.16) : 0;

    if (style === 'faceted') {
      const radius = width * 0.45;
      addPiece(
        chunk,
        materialKey,
        new THREE.CylinderGeometry(radius * 0.76, radius, height, 8, 5, false),
        matrixAt(x, height * 0.5, z, 0, rotationY),
        true,
      );
      addPiece(
        chunk,
        'glass',
        new THREE.CylinderGeometry(radius * 0.42, radius * 0.62, height * 0.22, 8, 2, false),
        matrixAt(x, height * 0.86, z, 0, rotationY),
        true,
      );
      const bands = Math.max(3, Math.floor(height / 19));
      for (let i = 1; i <= bands; i += 1) {
        const y = (height / (bands + 1)) * i;
        const ringRadius = radius * (1 - (y / height) * 0.2) + 0.08;
        addPiece(
          chunk,
          i % 3 === 0 ? accent : 'teal',
          new THREE.TorusGeometry(ringRadius, 0.13, 4, 32),
          matrixAt(x, y, z, Math.PI * 0.5),
          false,
        );
      }
      addPiece(
        chunk,
        accent,
        new THREE.ConeGeometry(radius * 0.22, range(random, 8, 22), 5),
        matrixAt(x, height + 6, z, 0, rotationY),
        true,
      );
      if (chance(random, 0.45)) {
        addBillboardAt(x, height * 0.72, z + radius + 0.2, 0, width * 0.55, width * 0.26);
      }
      return;
    }

    const podiumHeight = range(random, 8, 14);
    addRoundedTowerPiece(
      chunk,
      materialKey,
      width + range(random, 4, 10),
      podiumHeight,
      depth + range(random, 4, 9),
      x,
      0 + podiumHeight * 0.5,
      z,
      rotationY,
    );

    let cursorY = podiumHeight;
    let sectionWidth = width;
    let sectionDepth = depth;
    const usableHeight = height - podiumHeight;
    const sections = Math.max(1, Math.min(4, Math.floor(usableHeight / 34) + (chance(random, 0.35) ? 1 : 0)));
    let finalRoofY = cursorY;

    for (let section = 0; section < sections; section += 1) {
      const remainingSections = sections - section;
      const sectionHeight = (height - cursorY) / remainingSections * range(random, 0.82, 1.12);
      const offsetX = range(random, -1.8, 1.8);
      const offsetZ = range(random, -1.8, 1.8);
      const sectionX = x + offsetX;
      const sectionZ = z + offsetZ;
      addRoundedTowerPiece(
        chunk,
        materialKey,
        sectionWidth,
        sectionHeight,
        sectionDepth,
        sectionX,
        cursorY + sectionHeight * 0.5,
        sectionZ,
        rotationY,
      );
      addFacadeWindows(
        chunk,
        sectionX,
        sectionZ,
        sectionWidth,
        sectionDepth,
        cursorY,
        cursorY + sectionHeight,
        random,
      );

      if (chance(random, 0.55)) {
        const stripX = sectionX + sectionWidth * 0.5 + 0.08;
        addPiece(
          chunk,
          accent,
          new THREE.BoxGeometry(0.16, sectionHeight * 0.9, 0.18),
          matrixAt(stripX, cursorY + sectionHeight * 0.5, sectionZ + sectionDepth * 0.32),
          false,
        );
      }

      cursorY += sectionHeight;
      finalRoofY = cursorY;
      sectionWidth *= range(random, 0.78, 0.9);
      sectionDepth *= range(random, 0.79, 0.91);
    }

    if (style === 'lantern') {
      const lanternWidth = Math.max(7, sectionWidth * 1.3);
      addPiece(
        chunk,
        'glass',
        new THREE.BoxGeometry(lanternWidth, 10, Math.max(7, sectionDepth * 1.25)),
        matrixAt(x, finalRoofY + 5, z, 0, rotationY),
        true,
      );
      addBox(chunk, accent, lanternWidth + 0.35, 0.3, sectionDepth * 1.25 + 0.35, x, finalRoofY + 10, z, rotationY, false);
      addBox(chunk, accent, lanternWidth + 0.35, 0.3, sectionDepth * 1.25 + 0.35, x, finalRoofY, z, rotationY, false);
      finalRoofY += 10;
    }

    addPiece(
      chunk,
      accent,
      new THREE.TorusGeometry(Math.max(2.5, Math.min(sectionWidth, sectionDepth) * 0.5), 0.22, 5, 36),
      matrixAt(x, finalRoofY + 0.3, z, Math.PI * 0.5),
      false,
    );

    if (chance(random, 0.42)) {
      const gardenWidth = Math.max(4, sectionWidth * 0.46);
      addBox(chunk, 'wood', gardenWidth, 1.1, 4.2, x - sectionWidth * 0.18, finalRoofY + 0.55, z + sectionDepth * 0.18, rotationY, false);
      for (let bloom = 0; bloom < 4; bloom += 1) {
        const angle = range(random, 0, Math.PI * 2);
        addPiece(
          chunk,
          'blossom',
          new THREE.IcosahedronGeometry(range(random, 1.3, 2.4), 1),
          matrixAt(
            x - sectionWidth * 0.18 + Math.cos(angle) * gardenWidth * 0.28,
            finalRoofY + range(random, 1.4, 3.0),
            z + sectionDepth * 0.18 + Math.sin(angle) * 1.5,
            0,
            0,
            0,
            1.1,
            0.8,
            1.1,
          ),
          false,
        );
      }
      addBox(chunk, 'teal', 0.14, 0.12, 3.4, x - sectionWidth * 0.18, finalRoofY + 1.2, z + 2.1, rotationY, false);
    }

    if (chance(random, 0.7)) {
      const spireHeight = range(random, 6, 25);
      addPiece(
        chunk,
        accent,
        new THREE.ConeGeometry(range(random, 0.35, 0.9), spireHeight, 5),
        matrixAt(x, finalRoofY + spireHeight * 0.5, z, 0, rotationY),
        true,
      );
      finalRoofY += spireHeight;
    }

    if (chance(random, 0.32)) {
      addBillboardAt(
        x,
        finalRoofY + 7,
        z + Math.max(sectionDepth, 8) * 0.45 + 0.6,
        0,
        Math.max(13, sectionWidth * 0.8),
        Math.max(6.5, sectionWidth * 0.4),
      );
    }

    if (chance(random, 0.32)) {
      addPiece(
        chunk,
        materialKey,
        new THREE.BoxGeometry(0.5, 4.5, 8),
        matrixAt(x + width * 0.35, finalRoofY + 2.2, z, 0, rotationY),
        true,
      );
    }
  };

  const addBridge = (z: number, y: number, length = 138): void => {
    const chunk = getChunk(0, z);
    addBox(chunk, 'bridge', length, 1.7, 7.5, 0, y, z, 0, true);
    addBox(chunk, 'teal', length - 4, 0.14, 0.2, 0, y + 1.0, z + 3.65, 0, false);
    addBox(chunk, 'teal', length - 4, 0.14, 0.2, 0, y + 1.0, z - 3.65, 0, false);
    addBox(chunk, 'windowWarm', length - 22, 2.2, 0.18, 0, y + 2.4, z + 3.66, 0, false);
    for (const supportX of [-length * 0.36, length * 0.36]) {
      addBox(chunk, 'bridge', 2.2, y, 2.2, supportX, y * 0.5, z, 0, true);
    }
    if (chance(random, 0.5)) {
      addBillboardAt(0, y + 7, z + 3.8, 0, 24, 6.5);
    }
  };

  const addIslandTree = (
    chunk: ChunkWork,
    x: number,
    y: number,
    z: number,
    scale: number,
  ): void => {
    const trunkHeight = range(random, 5, 9) * scale;
    addPiece(
      chunk,
      'wood',
      new THREE.CylinderGeometry(0.24 * scale, 0.5 * scale, trunkHeight, 5),
      matrixAt(x, y + trunkHeight * 0.5, z),
      false,
    );
    const crownY = y + trunkHeight + 1.5 * scale;
    const crownRadius = range(random, 2.2, 3.8) * scale;
    for (let i = 0; i < 4; i += 1) {
      const angle = range(random, 0, Math.PI * 2);
      addPiece(
        chunk,
        'blossom',
        new THREE.IcosahedronGeometry(crownRadius * range(random, 0.55, 0.9), 1),
        matrixAt(
          x + Math.cos(angle) * crownRadius * 0.55,
          crownY + range(random, -0.7, 1.3) * scale,
          z + Math.sin(angle) * crownRadius * 0.55,
          0,
          0,
          0,
          range(random, 0.8, 1.25),
          range(random, 0.55, 0.9),
          range(random, 0.8, 1.25),
        ),
        false,
      );
    }
  };

  const addIsland = (
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
  ): void => {
    const chunk = getChunk(x, z);
    addPiece(
      chunk,
      'rock',
      createIslandGeometry(random, radius, height),
      matrixAt(x, y, z),
      true,
    );
    const top = y + height * 0.5;
    addPiece(
      chunk,
      'soil',
      new THREE.CylinderGeometry(radius * 0.84, radius * 0.8, 2.4, 12),
      matrixAt(x, top + 0.9, z),
      true,
    );

    addPiece(
      chunk,
      'teal',
      new THREE.TorusGeometry(radius * 0.62, 0.24, 5, 36),
      matrixAt(x, y - height * 0.2, z, Math.PI * 0.5),
      false,
    );
    addPiece(
      chunk,
      'teal',
      new THREE.ConeGeometry(radius * 0.14, 18, 5),
      matrixAt(x, y - height * 0.5 - 9, z, Math.PI),
      false,
    );
    for (let root = 0; root < 5; root += 1) {
      const angle = (root / 5) * Math.PI * 2 + 0.35;
      const rootX = x + Math.cos(angle) * radius * 0.58;
      const rootZ = z + Math.sin(angle) * radius * 0.58;
      const rootLength = range(random, 8, 22);
      addPiece(
        chunk,
        'rose',
        new THREE.CylinderGeometry(0.15, 0.48, rootLength, 5),
        matrixAt(rootX, y - height * 0.5 - rootLength * 0.5, rootZ, 0.07, 0, angle * 0.08),
        false,
      );
      addPiece(
        chunk,
        'teal',
        new THREE.IcosahedronGeometry(range(random, 0.55, 1.3), 1),
        matrixAt(rootX, y - height * 0.5 - rootLength, rootZ),
        false,
      );
    }

    const treeCount = Math.max(3, Math.floor(radius / 11));
    for (let index = 0; index < treeCount; index += 1) {
      const angle = range(random, 0, Math.PI * 2);
      const distance = range(random, radius * 0.25, radius * 0.72);
      addIslandTree(
        chunk,
        x + Math.cos(angle) * distance,
        top + 2.1,
        z + Math.sin(angle) * distance,
        range(random, 0.75, 1.35),
      );
    }

    if (chance(random, 0.7)) {
      const pavilionX = x + range(random, -radius * 0.3, radius * 0.3);
      const pavilionZ = z + range(random, -radius * 0.3, radius * 0.3);
      addBox(chunk, 'wood', 9, 0.9, 7, pavilionX, top + 3.0, pavilionZ, 0, true);
      for (const [px, pz] of [[-3.2, -2.2], [3.2, -2.2], [-3.2, 2.2], [3.2, 2.2]]) {
        addBox(chunk, 'wood', 0.45, 5, 0.45, pavilionX + px, top + 5.5, pavilionZ + pz, 0, false);
      }
      addPiece(
        chunk,
        'rose',
        new THREE.ConeGeometry(7, 3.4, 4),
        matrixAt(pavilionX, top + 8.6, pavilionZ, 0, Math.PI * 0.25),
        false,
      );
    }

    if (chance(random, 0.75)) {
      const side = chance(random, 0.5) ? -1 : 1;
      const fallX = x + side * radius * 0.66;
      const fallHeight = range(random, 32, 72);
      const waterfallMaterial: WorldMaterialKey = 'water';
      addPiece(
        chunk,
        waterfallMaterial,
        new THREE.PlaneGeometry(range(random, 4, 9), fallHeight),
        matrixAt(fallX, top - fallHeight * 0.5, z + radius * 0.2, 0, range(random, -0.3, 0.3)),
        false,
      );
      addPiece(
        chunk,
        'teal',
        new THREE.BoxGeometry(0.13, fallHeight, 0.13),
        matrixAt(fallX - 3, top - fallHeight * 0.46, z + radius * 0.2),
        false,
      );
    }
  };

  const addGround = (): void => {
    const chunk = getGroundChunk();
    addPiece(
      chunk,
      'ground',
      new THREE.PlaneGeometry(WORLD_HALF_X * 2 + 400, WORLD_HALF_Z * 2 + 400),
      matrixAt(0, 0, 0, -Math.PI * 0.5),
      true,
    );

    for (let x = -WORLD_HALF_X; x <= WORLD_HALF_X; x += 110) {
      addBox(chunk, 'teal', 0.12, 0.06, WORLD_HALF_Z * 2, x, 0.07, 0, 0, false);
    }
    for (let z = -WORLD_HALF_Z; z <= WORLD_HALF_Z; z += 110) {
      addBox(chunk, 'rose', WORLD_HALF_X * 2, 0.06, 0.12, 0, 0.075, z, 0, false);
    }

    for (const canalX of [-260, -90, 190, 390]) {
      addBox(chunk, 'water', 14, 0.08, WORLD_HALF_Z * 1.8, canalX, 0.12, 0, 0, false);
      addBox(chunk, 'teal', 0.18, 0.11, WORLD_HALF_Z * 1.8, canalX - 7.2, 0.15, 0, 0, false);
      addBox(chunk, 'rose', 0.18, 0.11, WORLD_HALF_Z * 1.8, canalX + 7.2, 0.15, 0, 0, false);
    }

    addBox(chunk, 'teal', 0.28, 0.1, 650, -22, 0.16, 95, 0, false);
    addBox(chunk, 'rose', 0.28, 0.1, 650, 22, 0.16, 95, 0, false);
  };

  addGround();

  const columns = [-540, -420, -300, -190, -106, -56, 56, 106, 190, 300, 420, 540];
  for (let z = 390; z >= -880; z -= 98) {
    for (const baseX of columns) {
      const x = baseX + range(random, -13, 13);
      const zz = z + range(random, -18, 18);
      const skipProbability = Math.abs(baseX) <= 56 ? 0.24 : 0.16;
      if (chance(random, skipProbability)) continue;
      addTower(x, zz);
    }
  }

  for (const bridge of [
    { z: 188, y: 42 },
    { z: 4, y: 53 },
    { z: -178, y: 47 },
    { z: -356, y: 72 },
    { z: -566, y: 60 },
    { z: -760, y: 96 },
  ]) {
    addBridge(bridge.z, bridge.y, bridge.y > 80 ? 156 : 132);
  }

  const islands = [
    { x: 0, y: 105, z: 92, radius: 38, height: 30 },
    { x: -165, y: 215, z: -70, radius: 48, height: 42 },
    { x: 194, y: 155, z: -260, radius: 57, height: 48 },
    { x: -286, y: 286, z: -470, radius: 68, height: 56 },
    { x: 82, y: 252, z: 128, radius: 40, height: 36 },
    { x: 360, y: 180, z: -620, radius: 51, height: 44 },
    { x: -430, y: 330, z: -150, radius: 76, height: 62 },
    { x: 470, y: 308, z: 190, radius: 62, height: 54 },
  ];
  for (const island of islands) {
    addIsland(island.x, island.y, island.z, island.radius, island.height);
  }

  for (const billboard of billboards) {
    root.add(createBillboard(billboard));
  }

  const collisionChunks: CollisionChunk[] = [];
  let collisionTriangles = 0;
  let renderTriangles = 0;

  for (const chunk of chunks.values()) {
    const group = new THREE.Group();
    group.name = chunk.id;

    for (const [materialKey, geometries] of chunk.render) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) throw new Error(`Unable to merge render geometry for ${chunk.id}/${materialKey}.`);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials.byKey[materialKey]);
      mesh.name = `${chunk.id}-${materialKey}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.castShadow = !['rose', 'teal', 'windowWarm', 'water'].includes(materialKey);
      mesh.receiveShadow = ['ground', 'shellCeladon', 'shellPlum', 'shellIvory', 'bridge', 'rock', 'soil'].includes(materialKey);
      group.add(mesh);
      renderTriangles += triangleCount(merged);
    }

    if (chunk.collision.length > 0) {
      const mergedCollision = mergeGeometries(chunk.collision, false);
      for (const geometry of chunk.collision) geometry.dispose();
      if (!mergedCollision) throw new Error(`Unable to merge collision geometry for ${chunk.id}.`);
      mergedCollision.computeBoundingBox();
      mergedCollision.computeBoundingSphere();
      collisionTriangles += triangleCount(mergedCollision);
      collisionChunks.push({
        id: chunk.id,
        bounds: chunk.bounds,
        geometry: mergedCollision,
      });
    }

    root.add(group);
  }

  return {
    seed,
    root,
    chunks: collisionChunks,
    spawn: SPAWN,
    stats: {
      chunks: collisionChunks.length,
      buildings: buildingCount,
      collisionTriangles,
      renderTriangles,
    },
  };
};

export const generateSakuraMegacity = (seed = 0x51a7a): WorldData => createCity(seed);





