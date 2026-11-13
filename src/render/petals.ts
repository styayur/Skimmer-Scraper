import * as THREE from 'three';
import type { Vec3 } from '../core/math';

export interface PetalField {
  points: THREE.Points;
  update(dt: number, center: Vec3): void;
  dispose(): void;
}

export const createPetalField = (): PetalField => {
  const count = 380;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const bounds = 165;

  const rose = new THREE.Color(0xff8fae);
  const cream = new THREE.Color(0xffd0c8);
  const petalColor = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.sin(index * 53.2) * 0.5 + 0.5) * bounds * 2 - bounds;
    positions[index * 3 + 1] = (Math.sin(index * 29.3) * 0.5 + 0.5) * 130 - 18;
    positions[index * 3 + 2] = (Math.cos(index * 41.7) * 0.5 + 0.5) * bounds * 2 - bounds;
    speeds[index] = 1.2 + (index % 13) * 0.24;
    phases[index] = index * 0.71;
    petalColor.copy(rose).lerp(cream, (index % 9) / 8);
    colors[index * 3] = petalColor.r;
    colors[index * 3 + 1] = petalColor.g;
    colors[index * 3 + 2] = petalColor.b;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.translate(32, 32);
  ctx.rotate(-0.25);
  const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.7, 'rgba(255,220,230,0.65)');
  gradient.addColorStop(1, 'rgba(255,190,210,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    map: texture,
    size: 0.9,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.82,
    vertexColors: true,
    depthWrite: false,
    alphaTest: 0.04,
    fog: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'petal-field';
  points.frustumCulled = false;

  let elapsed = 0;
  return {
    points,
    update: (dt, center) => {
      elapsed += dt;
      for (let index = 0; index < count; index += 1) {
        const i = index * 3;
        positions[i] += Math.sin(elapsed * 0.8 + phases[index]!) * dt * 1.7 + dt * 1.1;
        positions[i + 1] -= speeds[index]! * dt;
        positions[i + 2] += Math.cos(elapsed * 0.55 + phases[index]!) * dt * 0.8 + dt * 1.6;

        if (positions[i]! > bounds) positions[i] = -bounds;
        if (positions[i + 1]! < -25) positions[i + 1] = 112;
        if (positions[i + 2]! > bounds) positions[i + 2] = -bounds;
      }
      geometry.getAttribute('position').needsUpdate = true;
      points.position.set(center.x, center.y + 18, center.z);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
};
