import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fingerprintValues, seededRandom } from './deterministic';
import { CHUNK_SIZE, type WorldSettings } from './worldConfig';
import type { GeneratedChunk } from './worldTypes';
import { dragonHeight } from './dragonTerrain';

const stone = 0x63776d,
  bronze = 0xb4884f,
  shale = 0x465c5c,
  gold = 0xdda852,
  lichen = 0x8fa991;

export class DragonChunkGenerator {
  private readonly material = new T.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.85,
  });
  constructor(private readonly settings: WorldSettings) {}

  generate(cx: number, cz: number, revision: number): GeneratedChunk {
    const seed = this.settings.seed;
    const ox = cx * CHUNK_SIZE,
      oz = cz * CHUNK_SIZE;
    const rng = seededRandom(seed, cx, cz, 'dragonspine-1');
    const parts: T.BufferGeometry[] = [];
    const group = new T.Group();
    group.position.set(ox, 0, oz);
    const ground = (x: number, z: number) => dragonHeight(ox + x, oz + z, seed);
    function piece(
      g: T.BufferGeometry,
      color: number,
      x: number,
      y: number,
      z: number,
      rotation = 0,
    ) {
      g.rotateY(rotation).translate(x, y, z);
      if (g.index) {
        const raw = g.toNonIndexed();
        g.dispose();
        g = raw;
      }
      for (const attribute of Object.keys(g.attributes))
        if (attribute !== 'position') g.deleteAttribute(attribute);
      const positions = g.getAttribute('position');
      const colors = new Float32Array(positions.count * 3);
      const tint = new T.Color(color);
      for (let i = 0; i < positions.count; i += 3) {
        const face = tint
          .clone()
          .multiplyScalar(
            0.9 +
              0.1 *
                Math.sin(0.12 * positions.getY(i) + 0.03 * positions.getX(i)),
          );
        for (let j = 0; j < 3; j++) face.toArray(colors, (i + j) * 3);
      }
      g.setAttribute('color', new T.BufferAttribute(colors, 3));
      parts.push(g);
    }
    const terrain = new T.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 20, 20);
    terrain.rotateX(-Math.PI / 2).translate(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
    const vertices = terrain.getAttribute('position');
    for (let i = 0; i < vertices.count; i++)
      vertices.setY(i, ground(vertices.getX(i), vertices.getZ(i)));
    piece(terrain, stone, 0, 0, 0);
    const x = 95 + rng() * 30,
      z = 85 + rng() * 40;
    const y = ground(x, z);
    const turn = rng() * Math.PI;
    const typeRoll = Math.floor(rng() * 6);
    const kind = cx % 4 === 0 && cz % 4 === 0 ? 3 : typeRoll;
    function pillar(
      px: number,
      pz: number,
      base: number,
      h: number,
      radius: number,
    ) {
      piece(
        new T.CylinderGeometry(radius * 0.74, radius, h, 8),
        shale,
        px,
        base + h / 2,
        pz,
      );
      piece(
        new T.CylinderGeometry(radius * 1.24, radius, 2.5, 8),
        bronze,
        px,
        base + h,
        pz,
      );
    }
    function rock(
      px: number,
      pz: number,
      py: number,
      sx: number,
      sy: number,
      sz: number,
    ) {
      const g = new T.IcosahedronGeometry(1, 1);
      const v = g.getAttribute('position');
      for (let i = 0; i < v.count; i++) {
        const dx = v.getX(i),
          dy = v.getY(i),
          dz = v.getZ(i);
        const s = 1 + 0.13 * Math.sin(5 * dx + 7 * dy + 3 * dz + turn);
        v.setXYZ(i, dx * s * sx, dy * s * sy, dz * s * sz);
      }
      piece(g, shale, px, py, pz, turn);
    }
    if (kind === 0 || (cx === 0 && cz === -1)) {
      // Buttresses and the voussoirs share open air beneath the crown.
      const radius = 43,
        crown = y + 12;
      const arch = new T.TorusGeometry(radius, 7, 6, 14, Math.PI);
      piece(arch, bronze, x, crown, z, turn);
      for (const side of [-1, 1]) {
        const px = x + side * radius * Math.cos(turn),
          pz = z - side * radius * Math.sin(turn);
        const foot = Math.min(ground(px, pz) - 8, crown - 12);
        pillar(px, pz, foot, crown - foot, 10);
      }
    } else if (kind === 1) {
      // Floating shrine with a stepped roof and a clear axial approach.
      const slab = y + 110;
      piece(
        new T.ConeGeometry(32, 44, 9).rotateX(Math.PI),
        shale,
        x,
        slab - 22,
        z,
      );
      piece(new T.CylinderGeometry(34, 31, 5, 9), lichen, x, slab, z);
      for (const dx of [-15, 15])
        for (const dz of [-12, 12]) pillar(x + dx, z + dz, slab + 2, 22, 2.4);
      piece(new T.BoxGeometry(40, 3, 34), bronze, x, slab + 25, z);
      piece(
        new T.ConeGeometry(29, 12, 4).rotateY(Math.PI / 4),
        gold,
        x,
        slab + 32,
        z,
      );
    } else if (kind === 2) {
      for (const side of [-1, 1]) {
        const px = x + side * 38,
          base = ground(px, z) - 8,
          deck = Math.max(y, base) + 52;
        pillar(px, z, base, deck - base, 5);
        piece(new T.BoxGeometry(46, 5, 10), bronze, px, deck, z);
      }
    } else if (kind === 3) {
      // A basalt roost ring perched above the valley floor.
      rock(x, z, y + 19, 34, 31, 32);
      piece(
        new T.TorusGeometry(16, 3.5, 5, 16).rotateX(Math.PI / 2),
        bronze,
        x,
        y + 47,
        z,
      );
    } else if (kind === 4) {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3,
          px = x + 24 * Math.cos(a),
          pz = z + 24 * Math.sin(a);
        pillar(px, pz, ground(px, pz) - 3, 8 + rng() * 16, 3);
      }
    } else {
      rock(x, z, y + 8, 22 + rng() * 12, 27 + rng() * 16, 19 + rng() * 7);
    }
    const geometry = mergeGeometries(parts)!;
    geometry.computeBoundingBox();
    const collision = new T.BufferGeometry().setAttribute(
      'position',
      geometry.getAttribute('position').clone(),
    );
    const bounds = geometry.boundingBox!.clone();
    geometry.dispose();
    const groundMesh = new T.Mesh(parts.shift()!, this.material);
    groundMesh.name = 'dragonspine-ground';
    groundMesh.geometry.computeVertexNormals();
    groundMesh.receiveShadow = true;
    group.add(groundMesh);
    const landmark = new T.Mesh(mergeGeometries(parts)!, this.material);
    landmark.geometry.computeVertexNormals();
    landmark.receiveShadow = true;
    group.add(landmark);
    for (const g of parts) g.dispose();
    const triangles = collision.getAttribute('position').count / 3;
    return {
      key: cx + ':' + cz,
      chunkX: cx,
      chunkZ: cz,
      revision,
      origin: { x: ox, y: 0, z: oz },
      group,
      collisionGeometry: collision,
      bounds,
      fingerprint: fingerprintValues(seed, cx, cz, kind, y),
      stats: {
        buildings: kind === 1 ? 1 : 0,
        bridges: kind === 2 ? 1 : 0,
        islands: kind === 1 ? 1 : 0,
        renderTriangles: triangles,
        collisionTriangles: triangles,
      },
    };
  }
  dispose(): void {
    this.material.dispose();
  }
}
