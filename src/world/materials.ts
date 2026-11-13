import * as THREE from 'three';

export type WorldMaterialKey =
  | 'shellCeladon'
  | 'shellPlum'
  | 'shellIvory'
  | 'glass'
  | 'rose'
  | 'teal'
  | 'windowWarm'
  | 'bridge'
  | 'rock'
  | 'soil'
  | 'wood'
  | 'blossom'
  | 'water'
  | 'ground';

const createGroundTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');

  ctx.fillStyle = '#171622';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(104, 221, 205, 0.13)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 181, 143, 0.2)';
  ctx.lineWidth = 3;
  for (let i = 64; i < 512; i += 128) {
    ctx.beginPath();
    ctx.arc(256, 256, i, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255, 93, 143, 0.08)';
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 83) % 512;
    const y = (i * 137) % 512;
    ctx.fillRect(x, y, 18, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
};

const createFacadeTexture = (base: string, trim: string, accent: string): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');

  const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
  gradient.addColorStop(0, base);
  gradient.addColorStop(0.48, base);
  gradient.addColorStop(1, '#2a2232');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 1024);

  ctx.strokeStyle = trim;
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 3;
  for (let x = 0; x <= 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.23;
  ctx.lineWidth = 2;
  for (let y = 32; y < 1024; y += 52) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (let row = 0; row < 18; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const seed = Math.abs(Math.sin((row + 3) * 91.7 + (column + 5) * 37.1));
      const x = 13 + column * 72;
      const y = 47 + row * 52;
      ctx.fillStyle = seed > 0.72 ? 'rgba(255, 190, 138, 0.5)' : 'rgba(12, 18, 28, 0.58)';
      ctx.fillRect(x, y, 38, 22);
      if (seed > 0.86) {
        ctx.fillStyle = 'rgba(255, 233, 199, 0.25)';
        ctx.fillRect(x + 4, y + 3, 30, 3);
      }
    }
  }

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, 1008, 512, 16);
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
};

export interface WorldMaterials {
  byKey: Record<WorldMaterialKey, THREE.Material>;
  dispose(): void;
}

export const createWorldMaterials = (): WorldMaterials => {
  const groundMap = createGroundTexture();
  const celadonMap = createFacadeTexture('#5c8881', '#a3d6ca', '#53e5cf');
  const plumMap = createFacadeTexture('#79506d', '#d397b3', '#ff5d8f');
  const ivoryMap = createFacadeTexture('#9c8274', '#e2c4ae', '#ffb58f');
  const byKey: Record<WorldMaterialKey, THREE.Material> = {
    shellCeladon: new THREE.MeshStandardMaterial({
      color: 0x355b5b,
      roughness: 0.48,
      metalness: 0.46,
    }),
    shellPlum: new THREE.MeshStandardMaterial({
      color: 0x3b253f,
      roughness: 0.58,
      metalness: 0.33,
    }),
    shellIvory: new THREE.MeshStandardMaterial({
      color: 0x8b7871,
      roughness: 0.7,
      metalness: 0.12,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x70d9d0,
      roughness: 0.08,
      metalness: 0.24,
      transmission: 0.3,
      transparent: true,
      opacity: 0.46,
      emissive: 0x214a50,
      emissiveIntensity: 0.55,
    }),
    rose: new THREE.MeshBasicMaterial({ color: 0xff5d8f, toneMapped: false }),
    teal: new THREE.MeshBasicMaterial({ color: 0x53e5cf, toneMapped: false }),
    windowWarm: new THREE.MeshBasicMaterial({
      color: 0xffc58a,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    bridge: new THREE.MeshStandardMaterial({
      color: 0x594b5c,
      roughness: 0.34,
      metalness: 0.62,
    }),
    rock: new THREE.MeshStandardMaterial({
      color: 0x4b3946,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    }),
    soil: new THREE.MeshStandardMaterial({
      color: 0x694248,
      roughness: 0.95,
      metalness: 0,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x3d2827,
      roughness: 0.9,
    }),
    blossom: new THREE.MeshStandardMaterial({
      color: 0xffa1bd,
      emissive: 0x8c2949,
      emissiveIntensity: 0.72,
      roughness: 0.72,
    }),
    water: new THREE.MeshPhysicalMaterial({
      color: 0x4dc9d2,
      emissive: 0x0e464f,
      emissiveIntensity: 0.32,
      roughness: 0.12,
      metalness: 0.1,
      transmission: 0.45,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
    }),
    ground: new THREE.MeshStandardMaterial({
      color: 0x7b6770,
      map: groundMap,
      roughness: 0.82,
      metalness: 0.17,
    }),
  };

  return {
    byKey,
    dispose: () => {
      groundMap.dispose();
      celadonMap.dispose();
      plumMap.dispose();
      ivoryMap.dispose();
      for (const material of Object.values(byKey)) material.dispose();
    },
  };
};
