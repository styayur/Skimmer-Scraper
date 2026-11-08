import * as THREE from 'three';
import { damp } from '../core/math';

interface Streak {
  x: number;
  y: number;
  z: number;
  length: number;
  speed: number;
}

export interface SpeedRibbons {
  object: THREE.LineSegments;
  update(speed: number, boosting: boolean, dt: number): void;
  hide(): void;
  dispose(): void;
}

export const createSpeedRibbons = (): SpeedRibbons => {
  const count = 64;
  const positions = new Float32Array(count * 6);
  const streaks: Streak[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.39996;
    const radius = 4 + (index % 17) * 1.15;
    streaks.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.55,
      z: -24 + (index % 29) * 1.6,
      length: 2.2 + (index % 9) * 0.75,
      speed: 0.72 + (index % 13) * 0.075,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xa8fff0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.name = 'speed-ribbons';
  object.frustumCulled = false;
  let opacity = 0;

  return {
    object,
    update: (speed, boosting, dt) => {
      const targetOpacity = Math.max(0, Math.min(1, (speed - 72) / 34)) * 0.22 + (boosting ? 0.22 : 0);
      opacity = damp(opacity, targetOpacity, 5, Math.max(0, dt));
      material.opacity = opacity;
      object.visible = opacity > 0.004;
      if (!object.visible) return;

      for (let index = 0; index < count; index += 1) {
        const streak = streaks[index]!;
        streak.z += (48 + speed * 1.35) * streak.speed * dt;
        if (streak.z > 18) streak.z = -36 - (index % 7) * 1.4;
        const start = index * 6;
        positions[start] = streak.x;
        positions[start + 1] = streak.y;
        positions[start + 2] = streak.z;
        positions[start + 3] = streak.x * 0.93;
        positions[start + 4] = streak.y * 0.93;
        positions[start + 5] = streak.z - streak.length;
      }
      geometry.getAttribute('position').needsUpdate = true;
    },
    hide: () => {
      object.visible = false;
      opacity = 0;
      material.opacity = 0;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};
