import * as THREE from 'three';

export interface SkyAtmosphere {
  group: THREE.Group;
  sunDirection: THREE.Vector3;
  update(time: number): void;
  dispose(): void;
}

export const createSkyAtmosphere = (): SkyAtmosphere => {
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const sunDirection = new THREE.Vector3(-0.45, 0.24, -0.86).normalize();

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDirection: { value: sunDirection },
      uTop: { value: new THREE.Color(0x21152e) },
      uMid: { value: new THREE.Color(0x9f4f66) },
      uHorizon: { value: new THREE.Color(0xffb58f) },
      uSun: { value: new THREE.Color(0xffd0a1) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      varying vec3 vWorldPosition;

      void main() {
        vec3 direction = normalize(vWorldPosition - cameraPosition);
        float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
        float horizonBand = smoothstep(0.34, 0.58, height);
        vec3 color = mix(uHorizon, uMid, smoothstep(0.42, 0.61, height));
        color = mix(color, uTop, smoothstep(0.56, 1.0, height));

        float sunCore = pow(max(dot(direction, uSunDirection), 0.0), 380.0);
        float sunGlow = pow(max(dot(direction, uSunDirection), 0.0), 18.0);
        vec3 haze = uSun * (sunGlow * 0.42 + sunCore * 2.8);
        float cloudBand = sin(direction.x * 11.0 + direction.z * 7.0 + uTime * 0.012) *
          sin(direction.z * 15.0 - direction.x * 4.0 - uTime * 0.008);
        cloudBand = smoothstep(0.52, 0.86, cloudBand) * smoothstep(0.44, 0.76, height) * (1.0 - height * 0.7);
        color += haze + vec3(cloudBand) * vec3(0.16, 0.075, 0.13);
        color = mix(color, uHorizon, (1.0 - horizonBand) * 0.1);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(2100, 40, 24), skyMaterial);
  sky.frustumCulled = false;
  group.add(sky);

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 128;
  cloudCanvas.height = 128;
  const ctx = cloudCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255, 225, 220, 0.7)');
  gradient.addColorStop(0.45, 'rgba(255, 181, 185, 0.28)');
  gradient.addColorStop(1, 'rgba(255, 181, 185, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;

  const cloudPositions = new Float32Array(180 * 3);
  for (let index = 0; index < 180; index += 1) {
    const angle = (index / 180) * Math.PI * 2 + (index % 9) * 0.07;
    const radius = 420 + (index % 17) * 23;
    cloudPositions[index * 3] = Math.cos(angle) * radius;
    cloudPositions[index * 3 + 1] = 165 + (index % 11) * 5.7;
    cloudPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const cloudGeometry = new THREE.BufferGeometry();
  cloudGeometry.setAttribute('position', new THREE.BufferAttribute(cloudPositions, 3));
  const cloudMaterial = new THREE.PointsMaterial({
    color: 0xffd0c8,
    map: cloudTexture,
    size: 64,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
    fog: true,
  });
  const cloudLayer = new THREE.Points(cloudGeometry, cloudMaterial);
  cloudLayer.name = 'low-cloud-bloom';
  group.add(cloudLayer);

  return {
    group,
    sunDirection,
    update: (time) => {
      skyMaterial.uniforms.uTime!.value = time;
      cloudLayer.rotation.y = time * 0.0018;
    },
    dispose: () => {
      sky.geometry.dispose();
      skyMaterial.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
      cloudTexture.dispose();
    },
  };
};
