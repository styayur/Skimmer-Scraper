import { hashNumbers } from '../deterministic';

// Winding north–south canyons, transverse saddles and oblique branch routes.
// Distances are world-space quantities, including on the negative side of a seam.
const distanceToBand = (v: number, period: number) => Math.abs(v - Math.round(v / period) * period);
export function forgeLanes(seed: number) {
  const bits = hashNumbers(seed, 0x5746);
  return { spacing: 560 + (bits & 7) * 66, crossings: 740 + ((bits >>> 3) & 7) * 115,
    bend: 36 + ((bits >>> 6) & 7) * 8, direction: (bits & 2048) ? 1 : -1,
    diagonal: (bits & 4096) !== 0, phase: ((bits >>> 13) & 255) / 42 };
}
type Plan = ReturnType<typeof forgeLanes>;
export const FORGE_CRUISE_HEIGHT = 132;
export const FORGE_CRUISE_CLEARANCE = 20;

export function forgeLaneOffset(x: number, z: number, plan: Plan) {
  const offset = plan.bend * (Math.sin((z-120)/480+plan.phase)-Math.sin(plan.phase));
  const north = distanceToBand(x-offset, plan.spacing);
  const east = distanceToBand(z+90*Math.sin(x/570+plan.phase), plan.crossings);
  const branch = plan.diagonal ? distanceToBand(x*.72+plan.direction*z*.48, plan.spacing*1.54) : Infinity;
  return Math.min(north, east, branch);
}

export function forgeFloor(x: number, z: number, plan: Plan) {
  const width = forgeLaneOffset(x, z, plan);
  const u = Math.min(1,Math.max(0,(width-48)/163));
  const bed = 9*Math.sin(z/320+plan.phase)+5*Math.sin(x/210);
  return bed + u*u*(3-2*u)*(230+102*Math.cos(x/610-z/490+plan.phase));
}
