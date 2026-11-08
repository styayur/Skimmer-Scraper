import * as THREE from 'three';

const SIGN_COPY = [
  ['SKIM UNIT', '#ff5d8f'],
  ['LOW//FLIGHT', '#53e5cf'],
  ['SAKURA DRIVE', '#ffb58f'],
  ['NIGHT RIVER', '#ff7aa2'],
  ['AIRBORNE', '#7df3dc'],
  ['ALTITUDE CLUB', '#ffc58a'],
] as const;

const createSignTexture = (label: string, accent: string): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');

  const gradient = ctx.createLinearGradient(0, 0, 768, 320);
  gradient.addColorStop(0, '#17111e');
  gradient.addColorStop(0.55, '#2b182a');
  gradient.addColorStop(1, '#101722');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 768, 320);

  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  for (let x = -200; x < 900; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, 320);
    ctx.lineTo(x + 230, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = accent;
  ctx.fillRect(34, 34, 8, 252);
  ctx.fillRect(726, 34, 8, 252);
  ctx.fillRect(34, 34, 700, 4);
  ctx.fillRect(34, 282, 700, 4);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  for (let y = 70; y < 280; y += 30) ctx.fillRect(64, y, 640, 1);

  ctx.font = '600 24px "IBM Plex Sans", sans-serif';
  ctx.fillStyle = '#ffece4';
  ctx.globalAlpha = 0.72;
  ctx.fillText('DISTRICT SIGNAL / LOCAL NIGHT NETWORK', 62, 78);
  ctx.globalAlpha = 1;

  ctx.font = '800 76px Syne, sans-serif';
  ctx.fillStyle = '#fff7ef';
  ctx.fillText(label, 62, 178);

  ctx.font = '500 24px "IBM Plex Sans", sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText('CHANNEL 07  /  FLY CLOSER', 62, 238);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
};

export interface BillboardPlacement {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  width: number;
  height: number;
  index: number;
}

export const createBillboard = (placement: BillboardPlacement): THREE.Mesh => {
  const [label, accent] = SIGN_COPY[placement.index % SIGN_COPY.length]!;
  const texture = createSignTexture(label, accent);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(placement.width, placement.height);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(placement.x, placement.y, placement.z);
  mesh.rotation.y = placement.rotationY;
  mesh.name = `billboard-${placement.index}`;
  return mesh;
};
