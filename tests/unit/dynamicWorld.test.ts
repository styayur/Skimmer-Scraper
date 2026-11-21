import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFlightState } from '../../src/flight/flightModel';
import { flightWouldCollide, resolveShield } from '../../src/game/shield';
import { DynamicColliderRegistry } from '../../src/world/dynamicColliderRegistry';
import { ImportedMotion } from '../../src/world/imports/importedMotion';
import { ImportedWorldAdapter } from '../../src/world/imports/importedWorldAdapter';
import { analyzeWorldScene } from '../../src/world/imports/sceneAnalyzer';
import { defaultWorldImportOptions, type WorldManifest } from '../../src/world/imports/worldManifest';
import { MAX_MOVING_STRUCTURES, ProceduralArchitecture } from '../../src/world/proceduralArchitecture';
import { UnifiedSurfaceQuery } from '../../src/world/unifiedSurfaceQuery';
import { resolveWorldSettings } from '../../src/world/worldConfig';

describe('moving surface geometry', () => {
  it('reports exact world distance when a scaled and rotated surface is queried', () => {
    const registry = new DynamicColliderRegistry();
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.62);
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(20, -2, 9), rotation, new THREE.Vector3(3, 0.5, 1.9));
    registry.add('solid', 'test', new THREE.BoxGeometry(2, 2, 2), transform, true);
    const point = new THREE.Vector3(1, 0, 0).applyMatrix4(transform);
    const approach = point.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(rotation), 7);
    expect(registry.queryNearest(approach, 7.1)?.distance).toBeCloseTo(7, 9);
    expect(registry.queryNearest(approach, 6.9)).toBeNull();
    registry.dispose();
  });

  it('catches a high-speed moving wall whose previous and current poses both miss the aircraft', () => {
    const world = new UnifiedSurfaceQuery({ queryNearest: () => null });
    const transform = (x: number) => new THREE.Matrix4().makeTranslation(x, 0, 0);
    world.dynamic.add('gate', 'test', new THREE.BoxGeometry(0.5, 30, 30), transform(-24), false);
    const incoming = createFlightState({ position: { x: 0, y: 0, z: 6 }, yaw: 0, speed: 116 });
    const end = { ...incoming, position: { x: 0, y: 0, z: -6 } };
    expect(world.queryNearest(incoming.position, 5)).toBeNull();
    world.dynamic.setTransform('gate', transform(24), 1 / 120);
    expect(world.queryNearest(end.position, 5)).toBeNull();
    const contact = world.sweepDynamic(incoming.position, end.position, 3.2);
    expect(contact?.hit.surfaceId).toBe('gate');
    expect(contact?.fraction).toBeGreaterThan(0.4);
    expect(contact?.fraction).toBeLessThan(0.5);
    expect(flightWouldCollide(incoming, end, world)).toBe(true);
    const shield = resolveShield(incoming, end, world);
    expect(shield.impact).toBe(true);
    expect(shield.flight.velocity.x).toBeGreaterThan(0);
    world.dynamic.dispose();
  });

  it('keeps a rotating ring aperture clear and finds a surface on the rotation arc', () => {
    const registry = new DynamicColliderRegistry();
    registry.add('ring', 'test', new THREE.TorusGeometry(20, 2, 8, 48), new THREE.Matrix4(), true);
    registry.setTransform('ring', new THREE.Matrix4().makeRotationY(Math.PI * 0.5), 1 / 120);
    const center = { x: 0, y: 0, z: 0 };
    const arc = { x: Math.SQRT1_2 * 20, y: 0, z: -Math.SQRT1_2 * 20 };
    expect(registry.sweep(center, center, 3.2)).toBeNull();
    expect(registry.sweep(arc, arc, 3.2)?.hit.surfaceId).toBe('ring');
    registry.dispose();
  });
});

describe('dynamic world lifecycle', () => {
  it('keeps regional architecture across chunk seams and resets from the same seed', () => {
    const registry = new DynamicColliderRegistry();
    const world = new ProceduralArchitecture(resolveWorldSettings({ seed: '334458' }), registry);
    world.cover({ x: 219, y: 260, z: 90 }, []);
    const initial = world.snapshot();
    expect(new Set(initial.map(s => s.type)).size).toBeGreaterThanOrEqual(3);
    expect(registry.count).toBe(MAX_MOVING_STRUCTURES);
    world.cover({ x: 221, y: 260, z: 90 }, []);
    expect(world.snapshot()).toEqual(initial);
    world.step(0.65);
    expect(world.snapshot()).not.toEqual(initial);
    world.reset();
    expect(world.snapshot()).toEqual(initial);
    world.cover({ x: 50_000, y: 260, z: 90 }, []);
    expect(registry.count).toBe(MAX_MOVING_STRUCTURES);
    expect(world.snapshot().every(s => !initial.some(o => o.id === s.id))).toBe(true);
    world.dispose();
    expect(registry.count).toBe(0);
  });

  it('drives local rigid collision with a glTF clip and preserves restart and pause', () => {
    const scene = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200));
    floor.position.y = 0.5;
    const lift = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 12));
    lift.name = 'Lift';
    lift.position.set(32, 10, 0);
    scene.add(floor, lift);
    const clip = new THREE.AnimationClip('Lift', 1, [new THREE.VectorKeyframeTrack('Lift.position', [0, 1], [32, 10, 0, 32, 50, 0])]);
    const options = { ...defaultWorldImportOptions, motion: { clip: 0, loop: false } };
    const motion = new ImportedMotion(scene, [clip], options.motion);
    const analyzed = analyzeWorldScene(scene, options, motion);
    const manifest: WorldManifest = {
      id: 'b'.repeat(64), name: 'Lift', options, bytes: 0, nodes: 3, triangles: analyzed.triangles,
      collisionTriangles: analyzed.collisionTriangles, materials: 2, textures: 0, texturePixels: 0, bounds: { x: 200, y: 14, z: 200 },
      meshRoles: analyzed.meshRoles, animations: motion.clips,
    };
    const world = new ImportedWorldAdapter(manifest, analyzed, [scene], motion);
    expect(world.getDynamicSnapshot()[0]?.position.y).toBe(10);
    expect(world.queryProximity({ x: 32, y: 16, z: 0 }, 3)?.surfaceId).toBe('glb:2');
    world.stepMotion(0.5);
    expect(world.getDynamicSnapshot()[0]?.position.y).toBe(30);
    expect(world.queryProximity({ x: 32, y: 36, z: 0 }, 3)?.distance).toBeCloseTo(2);
    expect(world.queryProximity({ x: 32, y: 16, z: 0 }, 3)).toBeNull();
    world.setMotionRunning(false);
    world.stepMotion(0.4);
    expect(world.getDynamicSnapshot()[0]?.position.y).toBe(30);
    world.setMotionRunning(true);
    world.stepMotion(1.4);
    expect(world.getDynamicSnapshot()[0]?.position.y).toBe(50);
    world.resetMotion();
    expect(world.getDynamicSnapshot()[0]?.position.y).toBe(10);
    world.dispose();
    expect(world.getDynamicSnapshot()).toEqual([]);
    expect(world.getAdapterStats().bvhCount).toBe(0);
  });

  it('marks morph collision as a reference pose and uses explicit motion metadata instead of object names', () => {
    const scene = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
    const fabric = new THREE.Mesh(geometry);
    fabric.name = 'Fabric';
    const untagged = new THREE.Mesh(new THREE.BoxGeometry());
    untagged.name = 'moving_elevator';
    untagged.position.x = 5;
    const tagged = new THREE.Mesh(new THREE.BoxGeometry());
    tagged.userData.skimmerMotion = { offset: { x: 10, y: 0, z: 0 }, seconds: 2 };
    tagged.position.x = 10;
    scene.add(fabric, untagged, tagged);
    const clip = new THREE.AnimationClip('Fabric', 1, [new THREE.NumberKeyframeTrack('Fabric.morphTargetInfluences[0]', [0, 1], [0, 1])]);
    const motion = new ImportedMotion(scene, [clip]);
    const analyzed = analyzeWorldScene(scene, defaultWorldImportOptions, motion);
    expect(analyzed.meshRoles.map(mesh => mesh.motion)).toEqual(['reference-pose', undefined, 'rigid']);
    expect(analyzed.dynamic.map(entry => entry.mesh)).toEqual([tagged]);
    const registry = new DynamicColliderRegistry();
    motion.attach(registry, analyzed.dynamic, new THREE.Group());
    motion.step(1);
    expect(tagged.position.x).toBe(20);
    expect(untagged.position.x).toBe(5);
    motion.dispose();
    registry.dispose();
    analyzed.surfaces?.dispose();
    for (const mesh of [fabric, untagged, tagged]) mesh.geometry.dispose();
  });
});
