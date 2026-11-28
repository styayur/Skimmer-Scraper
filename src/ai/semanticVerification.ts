import { distance, type Vec3 } from '../core/math';
import type { CompanionWorld } from '../companions/AgentController';
import { hashString } from '../world/deterministic';
import { readMotionSemantic, type MotionSemanticCandidate } from '../world/motionSemantic';
import type { SurfaceQuery } from '../world/worldTypes';
import type { PerceivedTarget } from './contracts';
import { clearApproach, covered } from './flightClearance';

export type VerifiedCapability = NonNullable<PerceivedTarget['capabilities']>[number];
export interface VerifiedSite {
  target: PerceivedTarget;
  paths: Partial<Record<VerifiedCapability, Vec3[]>>;
  anchor: Vec3;
  direction: Vec3;
  candidate: MotionSemanticCandidate;
  authored: boolean;
  epoch: number;
  surface?: { chunk: string; id: string };
}
const dot = (a: Vec3, b: Vec3) => a.x*b.x + a.y*b.y + a.z*b.z;
const offset = (p: Vec3, v: Vec3, scale: number): Vec3 => ({ x: p.x + v.x*scale, y: p.y + v.y*scale, z: p.z + v.z*scale });
const unit = (v: Vec3) => {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 0.001 ? { x: v.x/length, y: v.y/length, z: v.z/length } : undefined;
};
function surfaceNormal(hit: SurfaceQuery, eye: Vec3) {
  let n = hit.contact && unit(hit.contact.normal);
  const toward = { x: eye.x - hit.point.x, y: eye.y - hit.point.y, z: eye.z - hit.point.z };
  if (n && dot(n, toward) < 0) n = { x: -n.x, y: -n.y, z: -n.z };
  return n ?? unit(toward);
}

// Follow the observed tangent with a parallel flight path. Neighboring chunks can own adjacent triangles.
function glidePath(world: CompanionWorld, hit: SurfaceQuery, direction: Vec3, normal: Vec3, position: Vec3) {
  const tangent = unit(offset(direction, normal, -dot(direction, normal)));
  if (!tangent || !world.queryGlide || !hit.contact) return;
  let previous = position;
  const path: Vec3[] = [];
  for (let along = 4; along <= 40; along += 4) {
    const probe = offset(position, tangent, along);
    const next = world.queryGlide(probe, 35);
    if (!covered(world, probe) || !next?.contact || Math.abs(next.distance - 26) > 4
      || Math.abs(dot(next.contact.normal, normal)) < 0.92
      || distance(next.point, offset(hit.point, tangent, along)) > 2) return;
    if (!clearApproach(world, previous, probe)) return;
    if (along === 16 || along === 40) path.push(probe);
    previous = probe;
  }
  return path;
}

export function verifySite(world: CompanionWorld, c: MotionSemanticCandidate, direction: Vec3, eye: Vec3,
  epoch: number, authored: boolean): VerifiedSite | undefined {
  const semantic = readMotionSemantic(c.semantic);
  if (!semantic || typeof c.lease !== 'string' || !c.lease.length || c.lease.length > 256
    || !Number.isFinite(distance(eye, c.position)) || !covered(world, c.position)) return;
  const has = (cap: (typeof semantic.capabilities)[number]) => semantic.capabilities.includes(cap);
  const paths: VerifiedSite['paths'] = {};
  const solidSite = semantic.kind === 'landmark' || semantic.kind === 'surface';
  // On-mesh anchors can be exactly coplanar. Probe from slightly above so a BVH can return a contact frame.
  const anchor = c.position;
  const probe = { ...anchor, y: anchor.y + 1 };
  const solid = world.queryNearest(probe, solidSite ? 18 : 42);
  const lowLane = !solidSite && world.queryNearest(anchor, 18);
  const glide = has('glide') || lowLane ? world.queryGlide?.(probe, solidSite ? 18 : 42) : undefined;
  if (solidSite && !solid) return;
  const sameSurface = glide && solid && distance(glide.point, solid.point) <= 2;
  const normal = solid && surfaceNormal(sameSurface ? glide : solid, lowLane ? anchor : eye);
  let position = solidSite && solid && normal ? offset(solid.point, normal, 26) : { ...anchor };
  if (lowLane) {
    // A player's low deck socket may have a safe parallel wingmate route above the measured surface.
    if (!sameSurface || !normal || normal.y < 0.6 || lowLane.distance < 3.2) return;
    position = offset(glide.point, normal, 26);
    if (!clearApproach(world, anchor, position, 3.2)) return;
  }
  if (!covered(world, position) || world.queryNearest(position, 10)) return;
  if (solidSite && has('observe')) paths.inspect = [];
  if (has('guide') && (solidSite || semantic.kind === 'route' || semantic.kind === 'socket')) paths.guide = [];
  if (has('glide') && sameSurface && normal) {
    const routeStart = offset(glide.point, normal, 26);
    const path = glidePath(world, glide, direction, normal, routeStart);
    if (path && clearApproach(world, position, routeStart)) paths.glide = path;
  }
  const forward = unit({ x: direction.x, y: 0, z: direction.z });
  if (forward && has('scout') && (semantic.kind === 'route' || semantic.kind === 'socket')) {
    const center = offset(position, forward, 32), right = { x: -forward.z, y: 0, z: forward.x };
    const branches = [-1, 1].map(side => offset(center, right, side*24));
    if (branches.every(end => clearApproach(world, position, end, 10))) paths.scout = [branches[0]!];
  }
  if (forward && has('release')) {
    const end = offset(position, forward, 38);
    end.y += 22;
    if (clearApproach(world, position, end, 10) && !world.queryNearest(end, 22)
      && (world.isGlideVolumeCovered?.(end, 22) ?? covered(world, end))) paths.release = [end];
  }
  const capabilities = Object.keys(paths) as VerifiedCapability[];
  if (!capabilities.length) return;
  const target: PerceivedTarget = {
    id: `site-${epoch}-${hashString(JSON.stringify([c.lease, semantic.id]))}`,
    kind: solidSite ? 'structure' : 'route', semanticKind: semantic.kind,
    position, clearance: world.queryNearest(position, 65)?.distance ?? null, capabilities,
  };
  if (solidSite && solid && /^moving:-?\d+:-?\d+:garden$/.test(solid.surfaceId)) target.kind = 'floating-island';
  return { target, paths, anchor: { ...anchor }, direction: { ...direction }, candidate: c, authored, epoch,
    surface: solidSite && solid ? { chunk: solid.chunkId, id: solid.surfaceId } : undefined };
}

export function resolveSite(world: CompanionWorld, old: VerifiedSite, eye: Vec3, cap: VerifiedCapability, rebind: boolean) {
  const c = old.authored ? world.semanticCandidates?.(old.anchor).slice(0, 12).find(item =>
    item.semantic.id === old.candidate.semantic.id && item.semantic.kind === old.candidate.semantic.kind
    && (item.lease === old.candidate.lease || rebind) && distance(old.anchor, item.position) <= 12) : old.candidate;
  if (!c || distance(eye, c.position) > 240) return;
  const site = verifySite(world, c, old.direction, eye, old.epoch, old.authored);
  if (!old.authored && old.surface && (old.surface.chunk !== site?.surface?.chunk || old.surface.id !== site?.surface?.id)) return;
  if (site?.paths[cap]) return site;
}
