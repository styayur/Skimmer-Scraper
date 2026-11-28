import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import type { Vec3 } from '../../core/math';

export interface Station {
  t: number;
  center: number[];
  right: number[];
  up: number[];
  section?: number[][];
}

export interface Sweep {
  id: string;
  section: number[][];
  closedSection: boolean;
  stations: Station[];
  collisionStations?: Station[];
}

export interface KineticModule extends Sweep {
  width: number;
  collisionTolerance: number;
  shells: Sweep[];
}

// Only the Kinetic City and canyon span generators request this local asset.
export async function kineticLibrary(): Promise<readonly KineticModule[]> {
  return (await import('./kinetic-flight-modules.r2.json')).default.modules;
}

export type Point = [number, number, number];
export type Placement = (point: Point, t: number) => Point;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const asVec = ([x, y, z]: Point): Vec3 => ({ x, y, z });

/** A ring shares vertices with the next strip. The proxy has positions and indices only. */
export class MeshBuffer {
  readonly positions: number[] = [];
  readonly indices: number[] = [];
  private readonly colors: number[] = [];

  constructor(readonly visible: boolean) {}

  vertex(x: number, y: number, z: number, tint: Color): number {
    const index = this.positions.length / 3;
    this.positions.push(x, y, z);
    if (this.visible) this.colors.push(tint.r, tint.g, tint.b);
    return index;
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setIndex(this.indices);
    if (this.visible) {
      geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
      geometry.computeVertexNormals();
    }
    return geometry;
  }
}

export const stationPoint = (row: Station, side: number, height: number): Point => [
  row.center[0]! + side * row.right[0]! + height * row.up[0]!,
  row.center[1]! + side * row.right[1]! + height * row.up[1]!,
  row.center[2]! + side * row.right[2]! + height * row.up[2]!,
];

const ivory = new Color(0xffddb0), jade = new Color(0x77d6c3), plum = new Color(0x47334d);
const coral = new Color(0xe38877), brass = new Color(0xe7b96d);

export function appendSweep(target: MeshBuffer, surface: Sweep, place: Placement, capEnds = false, coarse = !target.visible) {
  const rows = coarse ? surface.collisionStations ?? surface.stations : surface.stations;
  const start = target.positions.length / 3;
  const n = surface.section.length;
  for (const row of rows) {
    const profile = row.section ?? surface.section;
    for (const [side, height] of profile) {
      const [x, y, z] = place(stationPoint(row, side!, height!), row.t);
      const tint = capEnds ? (height! > 12 ? brass : coral) : height! < -0.5 ? plum : side! < 0 ? jade : ivory;
      target.vertex(x, y, z, tint);
    }
  }
  for (let j = 1; j < rows.length; j++) {
    for (let i = 0; i < (surface.closedSection ? n : n - 1); i++) {
      const base = start + (j - 1) * n;
      const a = base + i, b = base + (i + 1) % n;
      target.indices.push(a, a + n, b, b, a + n, b + n);
    }
  }
  // Deck ends are shared sockets. An internal cap would create a transverse collider.
  if (capEnds && surface.closedSection) {
    for (const end of [0, rows.length - 1]) {
      const contour = (rows[end]!.section ?? surface.section).map(([x, y]) => new Vector2(x, y));
      const base = start + end * n;
      for (const [a, b, c] of ShapeUtils.triangulateShape(contour, [])) {
        target.indices.push(base + (end ? a! : c!), base + b!, base + (end ? c! : a!));
      }
    }
  }
}
