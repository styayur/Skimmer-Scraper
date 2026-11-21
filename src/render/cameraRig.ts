import * as THREE from 'three';
import { EXPERIENCE_CONFIG, type CameraMode } from '../config/experience';
import { clamp, damp, forwardFromAttitude, type Vec3 } from '../core/math';
import type { FlightState } from '../flight/flightModel';

export interface CameraRigSnapshot {
  mode: CameraMode;
  fov: number;
  blend: number;
  anchor: Vec3 | null;
  orientation: [number, number, number, number];
  position: Vec3;
}

const speedFactor = (speed: number): number => clamp((speed - 58) / 58, 0, 1);

export const targetFovForMode = (
  mode: CameraMode,
  speed: number,
  boosting: boolean,
  comfortMode = false,
): number => {
  const settings = EXPERIENCE_CONFIG.camera[mode];
  const gainScale = comfortMode ? EXPERIENCE_CONFIG.camera.comfortFovScale : 1;
  const dynamic = settings.speedGain * speedFactor(speed) + (boosting ? settings.boostGain : 0);
  return clamp(settings.minFov + dynamic * gainScale, settings.minFov, settings.maxFov);
};

/** Shared chase/cockpit camera with a smooth mode blend. */
export class FlightCameraRig {
  private readonly desiredChasePosition = new THREE.Vector3();
  private readonly smoothedChasePosition = new THREE.Vector3();
  private readonly desiredChaseLook = new THREE.Vector3();
  private readonly smoothedChaseLook = new THREE.Vector3();
  private readonly cockpitPosition = new THREE.Vector3();
  private readonly cockpitLook = new THREE.Vector3();
  private readonly blendedLook = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly orientedRight = new THREE.Vector3();
  private readonly orientedUp = new THREE.Vector3();
  private readonly aircraftQuaternion = new THREE.Quaternion();
  private readonly aircraftEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private mode: CameraMode = 'chase';
  private modeBlend = 0;
  private initialized = false;
  private comfortMode = false;
  private currentFov: number = EXPERIENCE_CONFIG.camera.chase.minFov;
  private speed = 0;
  private boosting = false;
  private anchor: Vec3 | null = null;

  public constructor(public readonly camera: THREE.PerspectiveCamera) {}
  public setAnchor(anchor: Vec3 | null): void { this.anchor = anchor; this.initialized = false; }

  public setMode(mode: CameraMode, immediate = false): void {
    this.mode = mode;
    if (immediate) {
      this.modeBlend = mode === 'chase' ? 0 : 1;
      this.initialized = false;
    }
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public toggleMode(): CameraMode {
    this.setMode(this.mode === 'chase' ? 'cockpit' : 'chase');
    return this.mode;
  }

  public setComfortMode(comfort: boolean): void {
    this.comfortMode = comfort;
  }

  public snapTo(state: Pick<FlightState, 'position' | 'attitude' | 'speed' | 'boosting' | 'elapsed'>): void {
    this.updateTargets(state);
    this.modeBlend = this.mode === 'chase' ? 0 : 1;
    const blend = this.smoothBlend();
    this.smoothedChasePosition.copy(this.desiredChasePosition);
    this.smoothedChaseLook.copy(this.desiredChaseLook);
    this.camera.position.lerpVectors(this.smoothedChasePosition, this.cockpitPosition, blend);
    this.blendedLook.lerpVectors(this.smoothedChaseLook, this.cockpitLook, blend);
    this.camera.up.copy(this.orientedUp);
    this.camera.lookAt(this.blendedLook);
    this.currentFov = this.targetFov();
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.initialized = true;
  }

  public update(dt: number, state: FlightState, proximity = 0, visualScale = 1): void {
    if (!this.initialized) this.snapTo(state);
    this.updateTargets(state);
    const targetBlend = this.mode === 'chase' ? 0 : 1;
    this.modeBlend = damp(this.modeBlend, targetBlend, EXPERIENCE_CONFIG.camera.transitionLambda, Math.max(0, dt));
    const blend = this.smoothBlend();

    const positionAlpha = 1 - Math.exp(-6.8 * Math.max(0, dt));
    const lookAlpha = 1 - Math.exp(-9.0 * Math.max(0, dt));
    this.smoothedChasePosition.lerp(this.desiredChasePosition, positionAlpha);
    this.smoothedChaseLook.lerp(this.desiredChaseLook, lookAlpha);

    this.camera.position.lerpVectors(this.smoothedChasePosition, this.cockpitPosition, blend);
    this.blendedLook.lerpVectors(this.smoothedChaseLook, this.cockpitLook, blend);
    this.camera.up.copy(this.orientedUp);

    const shakeScale = clamp(visualScale, 0, 1) *
      (this.comfortMode ? EXPERIENCE_CONFIG.camera.reducedShake : EXPERIENCE_CONFIG.camera.standardShake);
    if (shakeScale > 0) {
      const speedShake = clamp((state.speed - 78) / 38, 0, 1) * 0.012;
      const proximityShake = clamp(proximity, 0, 1) * 0.035;
      const magnitude = (speedShake + proximityShake + (state.boosting ? 0.008 : 0)) * shakeScale;
      if (magnitude > 0.0001) {
        const t = state.elapsed;
        this.camera.position.x += Math.sin(t * 53.1) * magnitude;
        this.camera.position.y += Math.cos(t * 47.7) * magnitude * 0.65;
        this.blendedLook.x += Math.sin(t * 39.3) * magnitude * 0.35;
        this.blendedLook.y += Math.cos(t * 43.9) * magnitude * 0.35;
      }
    }

    this.camera.lookAt(this.blendedLook);
    this.currentFov = damp(this.currentFov, this.targetFov(), 3.4, Math.max(0, dt));
    this.camera.fov = clamp(
      this.currentFov,
      EXPERIENCE_CONFIG.camera.chase.minFov,
      EXPERIENCE_CONFIG.camera.cockpit.maxFov,
    );
    this.currentFov = this.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  public updateAttract(time: number, center: Vec3): void {
    const x = center.x + 42 + Math.sin(time * 0.00013) * 12;
    const y = center.y + 22 + Math.sin(time * 0.00021) * 2.5;
    const z = center.z + 58 + Math.cos(time * 0.00011) * 10;
    this.camera.position.set(x, y, z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(center.x - 8, center.y + 52, center.z - 220);
    this.currentFov = damp(this.currentFov, 56, 2.5, 0.016);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    this.initialized = false;
  }

  public shiftRenderOrigin(delta: Vec3): void {
    this.camera.position.x -= delta.x;
    this.camera.position.y -= delta.y;
    this.camera.position.z -= delta.z;
    this.smoothedChasePosition.x -= delta.x;
    this.smoothedChasePosition.y -= delta.y;
    this.smoothedChasePosition.z -= delta.z;
    this.smoothedChaseLook.x -= delta.x;
    this.smoothedChaseLook.y -= delta.y;
    this.smoothedChaseLook.z -= delta.z;
  }

  public getSnapshot(): CameraRigSnapshot {
    return {
      mode: this.mode, fov: this.camera.fov, blend: this.modeBlend, anchor: this.anchor && { ...this.anchor },
      orientation: this.camera.quaternion.toArray(),
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
    };
  }

  private updateTargets(state: Pick<FlightState, 'position' | 'attitude' | 'speed' | 'boosting' | 'elapsed'>): void {
    this.speed = state.speed;
    this.boosting = state.boosting;
    const forward = forwardFromAttitude(state.attitude);
    this.forward.set(forward.x, forward.y, forward.z);
    const speedRatio = Math.max(0, state.speed - 60) / 45;
    const chase = EXPERIENCE_CONFIG.camera.chase;
    const cockpit = EXPERIENCE_CONFIG.camera.cockpit;
    this.aircraftEuler.set(state.attitude.pitch, state.attitude.yaw, state.attitude.roll, 'YXZ');
    this.aircraftQuaternion.setFromEuler(this.aircraftEuler);
    this.orientedUp.set(0, 1, 0).applyQuaternion(this.aircraftQuaternion);
    this.orientedRight.set(1, 0, 0).applyQuaternion(this.aircraftQuaternion);
    this.desiredChasePosition
      .set(state.position.x, state.position.y, state.position.z)
      .addScaledVector(this.forward, -(chase.distance + speedRatio * chase.distanceSpeedGain))
      .addScaledVector(this.orientedUp, chase.height);
    this.desiredChaseLook
      .set(state.position.x, state.position.y, state.position.z)
      .addScaledVector(this.forward, 15)
      .addScaledVector(this.orientedUp, 2.2);
    this.cockpitPosition
      .set(state.position.x, state.position.y, state.position.z)
      .addScaledVector(this.forward, this.anchor ? -this.anchor.z : cockpit.forwardOffset)
      .addScaledVector(this.orientedUp, this.anchor?.y ?? cockpit.upOffset)
      .addScaledVector(this.orientedRight, this.anchor?.x ?? 0);
    this.cockpitLook
      .copy(this.cockpitPosition)
      .addScaledVector(this.forward, 100)
      .addScaledVector(this.orientedUp, 0.1);

  }

  private targetFov(): number {
    const blend = this.smoothBlend();
    const chaseFov = targetFovForMode('chase', this.speed, this.boosting, this.comfortMode);
    const cockpitFov = targetFovForMode('cockpit', this.speed, this.boosting, this.comfortMode);
    return chaseFov + (cockpitFov - chaseFov) * blend;
  }

  private smoothBlend(): number {
    const x = clamp(this.modeBlend, 0, 1);
    return x * x * (3 - 2 * x);
  }
}

