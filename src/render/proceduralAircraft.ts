import * as THREE from 'three';

export interface ProceduralAircraft {
  group: THREE.Group;
  exhaust: THREE.Mesh;
  dispose(): void;
}

export const createProceduralAircraft = (): ProceduralAircraft => {
  const group = new THREE.Group();
  group.name = 'aircraft-procedural';

  const shell = new THREE.MeshStandardMaterial({
    color: 0x376e6c,
    roughness: 0.27,
    metalness: 0.72,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x171522,
    roughness: 0.38,
    metalness: 0.68,
  });
  const accent = new THREE.MeshBasicMaterial({ color: 0xff5d8f, toneMapped: false });
  const teal = new THREE.MeshBasicMaterial({ color: 0x53e5cf, toneMapped: false });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x5ac9c5,
    roughness: 0.08,
    metalness: 0.25,
    transmission: 0.25,
    transparent: true,
    opacity: 0.58,
    emissive: 0x113b42,
    emissiveIntensity: 0.65,
  });
  const exhaustMaterial = new THREE.MeshBasicMaterial({
    color: 0xff7c9f,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const addMesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const bodyGeometry = new THREE.CapsuleGeometry(0.46, 3.3, 5, 10);
  bodyGeometry.rotateX(Math.PI * 0.5);
  addMesh(bodyGeometry, shell, 0, 0, 0.2);

  const noseGeometry = new THREE.ConeGeometry(0.46, 1.4, 10, 1, false);
  noseGeometry.rotateX(-Math.PI * 0.5);
  addMesh(noseGeometry, shell, 0, 0, -2.45);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -2.05);
  wingShape.lineTo(-4.75, 0.98);
  wingShape.lineTo(-4.42, 1.58);
  wingShape.lineTo(0, 0.52);
  wingShape.lineTo(4.42, 1.58);
  wingShape.lineTo(4.75, 0.98);
  wingShape.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.07,
    bevelThickness: 0.07,
  });
  wingGeometry.center();
  wingGeometry.rotateX(Math.PI * 0.5);
  wingGeometry.translate(0, -0.04, 0);
  addMesh(wingGeometry, shell, 0, 0, 0.25);

  const underwing = new THREE.Mesh(wingGeometry.clone(), dark);
  underwing.scale.set(0.94, 0.8, 0.86);
  underwing.position.y = -0.13;
  underwing.position.z = 0.22;
  group.add(underwing);

  const canardShape = new THREE.Shape();
  canardShape.moveTo(0, -0.8);
  canardShape.lineTo(-1.25, 0.35);
  canardShape.lineTo(-1.08, 0.53);
  canardShape.lineTo(0, 0.15);
  canardShape.lineTo(1.08, 0.53);
  canardShape.lineTo(1.25, 0.35);
  canardShape.closePath();
  const canardGeometry = new THREE.ExtrudeGeometry(canardShape, {
    depth: 0.1,
    bevelEnabled: false,
  });
  canardGeometry.center();
  canardGeometry.rotateX(Math.PI * 0.5);
  addMesh(canardGeometry, teal, 0, 0.02, -1.8);

  const fin = addMesh(
    new THREE.BoxGeometry(0.14, 1.18, 1.55),
    shell,
    0,
    0.62,
    1.66,
  );
  fin.rotation.x = -0.22;

  for (const side of [-1, 1]) {
    const tail = addMesh(
      new THREE.BoxGeometry(1.65, 0.1, 0.9),
      dark,
      side * 0.78,
      0.16,
      1.62,
    );
    tail.rotation.z = side * 0.17;
    tail.rotation.x = -0.08;

    addMesh(
      new THREE.BoxGeometry(0.08, 0.025, 3.9),
      side === -1 ? accent : teal,
      side * 4.15,
      -0.03,
      0.62,
    );
    addMesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      side === -1 ? accent : teal,
      side * 4.3,
      0,
      0.95,
    );
  }

  const canopy = addMesh(
    new THREE.SphereGeometry(0.56, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    glass,
    0,
    0.31,
    -0.36,
  );
  canopy.scale.set(0.82, 0.72, 1.7);
  canopy.rotation.x = -0.1;

  const engineRing = addMesh(
    new THREE.TorusGeometry(0.39, 0.075, 6, 24),
    accent,
    0,
    0,
    2.2,
  );
  engineRing.rotation.x = 0;
  const innerRing = addMesh(
    new THREE.TorusGeometry(0.23, 0.035, 4, 20),
    teal,
    0,
    0,
    2.23,
  );
  innerRing.rotation.x = 0;

  const exhaustGeometry = new THREE.ConeGeometry(0.28, 1.7, 12, 1, true);
  exhaustGeometry.rotateX(Math.PI * 0.5);
  const exhaust = addMesh(exhaustGeometry, exhaustMaterial, 0, 0, 3.0);
  exhaust.castShadow = false;
  exhaust.receiveShadow = false;

  const allMaterials = [shell, dark, accent, teal, glass, exhaustMaterial];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = object !== exhaust;
      object.receiveShadow = object !== exhaust;
    }
  });

  return {
    group,
    exhaust,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of allMaterials) material.dispose();
    },
  };
};
