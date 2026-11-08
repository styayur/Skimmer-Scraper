import * as THREE from 'three';
import { damp, forwardFromAttitude, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';

export class ChaseCamera {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly right = new THREE.Vector3();
  private initialized = false;

  public constructor(public readonly camera: THREE.PerspectiveCamera) {}

  public snapTo(state: Pick<FlightState, 'position' | 'attitude'>): void {
    const forward = forwardFromAttitude(state.attitude);
    this.forward.set(forward.x, forward.y, forward.z);
    this.right.crossVectors(this.forward, this.up).normalize();
    this.desiredPosition
      .set(state.position.x, state.position.y, state.position.z)
      .addScaledVector(this.forward, -14.5)
      .addScaledVector(this.up, 4.3)
      .addScaledVector(this.right, -state.attitude.roll * 0.5);
    this.desiredLook
      .set(state.position.x, state.position.y, state.position.z)
      .addScaledVector(this.forward, 16)
      .addScaledVector(this.up, 2.1);
    this.camera.position.copy(this.desiredPosition);
    this.smoothLook.copy(this.desiredLook);
    this.camera.up.copy(this.up).applyAxisAngle(this.forward, -state.attitude.roll * 0.18);
    this.camera.lookAt(this.smoothLook);
    this.initialized = true;
  }

  public update(dt: number, state: FlightState): void {
    if (!this.initialized) this.snapTo(state);
    const forward = forwardFromAttitude(state.attitude);
    this.forward.set(forward.x, forward.y, forward.z);
    this.right.crossVectors(this.forward, this.up).normalize();

    const speedRatio = Math.max(0, state.speed - 60) / 45;
    const chaseDistance = 14.5 + speedRatio * 3.0;
    const chaseHeight = 4.3 + Math.abs(state.attitude.roll) * 0.18;
    this.desiredPosition
      .set(state.position.x, state.position.y, state.position.z)
      .addScaledVector(this.forward, -chaseDistance)
      .addScaledVector(this.up, chaseHeight)
      .addScaledVector(this.right, -state.attitude.roll * 0.7);
    this.desiredLook
      .set(state.position.x, state.position.y, state.position.z)
      .addScaledVector(this.forward, 15)
      .addScaledVector(this.up, 2.2);

    const positionAlpha = 1 - Math.exp(-6.8 * dt);
    const lookAlpha = 1 - Math.exp(-9.0 * dt);
    this.camera.position.lerp(this.desiredPosition, positionAlpha);
    this.smoothLook.lerp(this.desiredLook, lookAlpha);
    this.camera.up.copy(this.up).applyAxisAngle(this.forward, -state.attitude.roll * 0.2);
    this.camera.lookAt(this.smoothLook);

    const targetFov = 64 + Math.min(11, speedRatio * 9) + (state.boosting ? 5 : 0);
    this.camera.fov = damp(this.camera.fov, targetFov, 3.4, dt);
    this.camera.updateProjectionMatrix();
  }

  public updateAttract(time: number, center: Vec3): void {
    const x = center.x + 42 + Math.sin(time * 0.00013) * 12;
    const y = center.y + 22 + Math.sin(time * 0.00021) * 2.5;
    const z = center.z + 58 + Math.cos(time * 0.00011) * 10;
    this.camera.position.set(x, y, z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(center.x - 10, center.y + 22, center.z - 190);
    this.camera.fov = damp(this.camera.fov, 52, 2.5, 0.016);
    this.camera.updateProjectionMatrix();
    this.initialized = false;
  }
}
