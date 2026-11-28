import { Box3, Color, DoubleSide, Group, LOD, Mesh, MeshStandardMaterial } from 'three';
import { ArchitectureLibrary, towerModel } from '../architectureLibrary';
import { hashNumbers } from '../deterministic';
import type { WorldMaterialKey } from '../materials';
import { packGeometry, unpackGeometry } from '../packedGeometry';
import { CHUNK_SIZE, type WorldSettings } from '../worldConfig';
import type { CollisionSurfaceSpan, GeneratedChunk, TopologyHint } from '../worldTypes';
import { boundarySocket, kineticLayout, KINETIC_RECIPE } from './recipe';
import { appendSweep, kineticLibrary, MeshBuffer, smooth, stationPoint,
  type KineticModule, type Placement, type Point, type Station, type Sweep } from './sweep';

const facade: Record<WorldMaterialKey, Color> = {
  shellCeladon: new Color(0x6daca2), shellPlum: new Color(0x9e6e84), shellIvory: new Color(0xe9ceb6),
  glass: new Color(0x385e72), rose: new Color(0xff7998), teal: new Color(0x71efce),
  windowWarm: new Color(0xffcf88), bridge: new Color(0xb3c4b0), rock: new Color(0x435062),
  soil: new Color(0x726667), wood: new Color(0xa87b63), blossom: new Color(0xeab2be),
  water: new Color(0x416572), ground: new Color(0x48636b),
};
const identity: Placement = point => point;

function quad(target: MeshBuffer, points: Point[], color: Color) {
  const [a, b, c, d] = points.map(([x, y, z]) => target.vertex(x, y, z, color));
  target.indices.push(a!, b!, c!, a!, c!, d!);
}

function arm(a: Point, b: Point, alongX: boolean, profile: number[][]): Sweep {
  const stations: Station[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, s = smooth(t);
    stations.push({ t, right: alongX ? [0, 0, -1] : [1, 0, 0], up: [0, 1, 0], center: [
      a[0] + (b[0] - a[0]) * (alongX ? t : s), a[1] + (b[1] - a[1]) * s,
      a[2] + (b[2] - a[2]) * (alongX ? s : t),
    ] });
  }
  return { id: 'arm', stations, section: profile, closedSection: true };
}

/** Test the XZ footprint against every actual swept triangle, including the helix return and vault. */
function overlapsRoute(target: MeshBuffer, x: number, z: number, radius: number) {
  const p = target.positions;
  for (let i = 0; i < target.indices.length; i += 3) {
    const a = target.indices[i]! * 3, b = target.indices[i + 1]! * 3, c = target.indices[i + 2]! * 3;
    if (Math.max(p[a]!, p[b]!, p[c]!) >= x - radius && Math.min(p[a]!, p[b]!, p[c]!) <= x + radius &&
        Math.max(p[a+2]!, p[b+2]!, p[c+2]!) >= z - radius && Math.min(p[a+2]!, p[b+2]!, p[c+2]!) <= z + radius) return true;
  }
  return false;
}

export class KineticChunkGenerator {
  private disposed = false;
  private readonly architecture = new ArchitectureLibrary();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, flatShading: true, roughness: 0.78 });
  constructor(private readonly settings: WorldSettings) {}

  async prepare(cx: number, cz: number, revision: number) {
    const modules = await kineticLibrary();
    if (this.disposed) throw new Error('Kinetic source disposed');
    const { seed } = this.settings;
    const layout = kineticLayout(seed, cx, cz, revision);
    const footprint = modules.find(m => m.id === 's-curve')!;
    const origin = { x: cx * CHUNK_SIZE, y: 0, z: cz * CHUNK_SIZE };
    const localSocket = (face: 'N' | 'W', x: number, z: number): Point => {
      const p = boundarySocket(seed, face, x, z);
      return [p.x - origin.x, p.y, p.z - origin.z];
    };
    const north = localSocket('N', cx, cz), south = localSocket('N', cx, cz + 1);
    const near = new MeshBuffer(true), far = new MeshBuffer(true), collision = new MeshBuffer(false);
    const skyline = new MeshBuffer(true);
    const hints: TopologyHint[] = [];
    const surfaceSpans: CollisionSurfaceSpan[] = [];
    const spine = [KINETIC_RECIPE, seed, 'spine', cx].join('.');
    const feature = [KINETIC_RECIPE, seed, cx, cz, layout].join('.');
    const hint = (kind: TopologyHint['kind'], id: string, [x, y, z]: Point) =>
      hints.push({ kind, id, position: { x: origin.x + x, y, z: origin.z + z } });
    // Each shared socket has one semantic owner.
    hint('socket', [KINETIC_RECIPE, seed, 'N', cx, cz].join('.'), [north[0], north[1] + 6, north[2]]);
    const add = (surface: Sweep, place: Placement, id: string, caps = false) => {
      appendSweep(near, surface, place, caps);
      if (layout !== 'junction') appendSweep(far, surface, place, caps, true);
      const first = collision.positions.length / 3;
      appendSweep(collision, surface, place, caps);
      surfaceSpans.push({first, end:collision.positions.length / 3, id});
    };
    if (layout === 'junction') {
      const west = localSocket('W', cx, cz), east = localSocket('W', cx + 1, cz);
      hint('socket', [KINETIC_RECIPE, seed, 'W', cx, cz].join('.'), [west[0], west[1] + 6, west[2]]);
      const mid = CHUNK_SIZE / 2, half = footprint.width / 2;
      const low = mid - half, high = mid + half, y = (north[1] + south[1] + west[1] + east[1]) / 4;
      for (const [i, path] of [
        arm(north, [mid, y, low], false, footprint.section), arm([mid, y, high], south, false, footprint.section),
        arm(west, [low, y, mid], true, footprint.section), arm([high, y, mid], east, true, footprint.section),
      ].entries()) {
        add(path, identity, i < 2 ? spine : [KINETIC_RECIPE, seed, 'crossing', cz].join('.'));
        hint('route', feature + '.arm.' + i, stationPoint(path.stations[4]!, 0, 6));
      }
      const plazaStart = collision.positions.length / 3;
      for (const target of [near, collision]) {
        quad(target, [[low,y,low],[low,y,high],[high,y,high],[high,y,low]], facade.shellIvory);
        const underside = y + Math.min(...footprint.section.map(p => p[1]!));
        quad(target, [[low,underside,low],[high,underside,low],[high,underside,high],[low,underside,high]], facade.shellPlum);
      }
      surfaceSpans.push({first:plazaStart,end:collision.positions.length / 3,id:feature+'.plaza'});
      hint('surface', feature + '.plaza', [mid, y, mid]);
    } else {
      const module: KineticModule = modules.find(m => m.id === layout)!;
      const place: Placement = ([x, y, z], t) => {
        const s = smooth(t);
        return [x + north[0] + (south[0] - north[0]) * s, y + north[1] + (south[1] - north[1]) * s, z];
      };
      add(module, place, spine);
      for (const shell of module.shells) add(shell, place, feature+'.'+shell.id, true);
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const row = module.stations.find(s => s.t >= t)!;
        hint('route', feature + '.route.' + t, place(stationPoint(row, 0, 6), row.t));
        if (t === 0.5) hint('surface', feature + '.deck', place(stationPoint(row, 0, 0), row.t));
      }
    }
    const district = hashNumbers(seed, 0x44, Math.floor(cx / 4), Math.floor(cz / 4));
    const parcel = hashNumbers(seed, cx, cz, revision, district);
    let buildings = 0;
    for (const x of [29, 191]) for (const z of [29, 110, 191]) {
      const lot = hashNumbers(parcel, x, z);
      const width = 27 + lot % 21, height = 65 + ((lot >>> 8) % 150);
      if (overlapsRoute(near, x, z, width / 2 + 9)) continue;
      const dominant = (['moonGate', 'needleExchange', 'terraceOrchard', 'foldedFan'] as const)[district % 4]!;
      const parts = this.architecture.parts(towerModel(dominant, lot, (district % 100) / 100));
      const bounds = new Box3();
      for (const { geometry } of parts) {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox!);
      }
      for (const { geometry, material, collides } of parts) {
        const positions = geometry.getAttribute('position');
        for (const target of collides ? [skyline, collision] : [skyline]) {
          for (let i = 0; i < positions.count; i++) {
            const u = ((positions.getX(i) - bounds.min.x) / (bounds.max.x - bounds.min.x) - 0.5) * width;
            const v = ((positions.getZ(i) - bounds.min.z) / (bounds.max.z - bounds.min.z) - 0.5) * width;
            const y = (positions.getY(i) - bounds.min.y) * height / (bounds.max.y - bounds.min.y);
            target.indices.push(target.vertex(x + (lot % 2 ? -v : u), y, z + (lot % 2 ? u : v), facade[material]));
          }
        }
      }
      buildings++;
    }
    for (const target of [skyline, collision]) {
      quad(target, [[0,0,0],[0,0,CHUNK_SIZE],[CHUNK_SIZE,0,CHUNK_SIZE],[CHUNK_SIZE,0,0]], facade.ground);
    }
    const key = 'chunk:' + cx + ':' + cz + ':r' + revision;
    return { kinetic: true as const, key, chunkX: cx, chunkZ: cz, revision, origin, topology: { layout, hints }, surfaceSpans,
      render: packGeometry(skyline.geometry()), road: packGeometry(near.geometry()),
      distantRoad: far.indices.length ? packGeometry(far.geometry()) : null,
      collision: packGeometry(collision.geometry()),
      fingerprint: hashNumbers(parcel, near.indices.length, skyline.indices.length, collision.indices.length),
      stats: { buildings, bridges: layout === 'junction' ? 4 : 1, islands: 0,
        renderTriangles: (skyline.indices.length + near.indices.length) / 3, collisionTriangles: collision.indices.length / 3 } };
  }

  assemble(packet: KineticPacket): GeneratedChunk {
    const { key, chunkX, chunkZ, revision, origin, fingerprint, stats, topology, surfaceSpans } = packet;
    const group = new Group();
    group.position.set(origin.x, origin.y, origin.z);
    const surface = (geometry: KineticPacket['render'], name: string) => {
      const mesh = new Mesh(unpackGeometry(geometry), this.material);
      mesh.name = name;
      mesh.receiveShadow = true;
      return mesh;
    };
    group.add(surface(packet.render, 'kinetic-district'));
    const road = surface(packet.road, 'kinetic-' + topology.layout);
    if (packet.distantRoad) {
      const lod = new LOD();
      lod.position.set(CHUNK_SIZE / 2, 85, CHUNK_SIZE / 2);
      const distant = surface(packet.distantRoad, road.name + '-distant');
      for (const mesh of [road, distant]) mesh.position.copy(lod.position).negate();
      lod.addLevel(road, 0).addLevel(distant, 310, 0.1);
      group.add(lod);
    } else group.add(road);
    const collisionGeometry = unpackGeometry(packet.collision);
    collisionGeometry.computeBoundingBox();
    return { key, chunkX, chunkZ, revision, origin, fingerprint, stats, group, topology, surfaceSpans, collisionGeometry,
      bounds: collisionGeometry.boundingBox! };
  }

  async generate(x: number, z: number, revision: number) { return this.assemble(await this.prepare(x, z, revision)); }
  dispose() { this.disposed = true; this.architecture.dispose(); this.material.dispose(); }
}

export type KineticPacket = Awaited<ReturnType<KineticChunkGenerator['prepare']>>;
