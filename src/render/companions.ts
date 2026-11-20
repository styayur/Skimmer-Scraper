import * as THREE from 'three';
import type { AgentState } from '../companions/AgentController';
import type { Vec3 } from '../core/math';

/** Three lightweight aircraft share one geometry/material and one instanced draw. */
export class CompanionRenderer {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.35, emissive: 0x173534 });
  public readonly mesh: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  public constructor() {
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0,0,-4, -0.7,-0.4,2, 0.7,-0.4,2,
      0,0.5,1, -0.7,-0.4,2, 0,0,-4,
      0,0.5,1, 0,0,-4, 0.7,-0.4,2,
      0,0.2,-1, -4.2,0.1,1.9, -0.7,-0.4,2,
      0,0.2,-1, 0.7,-0.4,2, 4.2,0.1,1.9,
      -0.7,-0.4,2, -4.2,0.1,1.9, 0,0,0,
      0.7,-0.4,2, 0,0,0, 4.2,0.1,1.9,
      0,0.4,1, 0,2,2.5, 0,0,3.3,
      0,0,3.3, 0,2,2.5, 0,0.4,1,
    ], 3));
    this.geometry.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, 3);
    this.mesh.name = 'local-autonomous-companions'; this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    [0x53e5cf, 0xffc67d, 0xff76aa].forEach((color, index) => this.mesh.setColorAt(index, new THREE.Color(color)));
  }
  public update(agents: readonly AgentState[], origin: Vec3): void {
    this.mesh.count = Math.min(3, agents.length);
    for (let index = 0; index < this.mesh.count; index++) {
      const agent = agents[index]!;
      const state = agent.flight;
      this.transform.position.set(state.position.x - origin.x, state.position.y - origin.y, state.position.z - origin.z);
      this.transform.rotation.set(state.attitude.pitch, state.attitude.yaw, state.attitude.roll, 'YXZ');
      this.transform.scale.setScalar(agent.deployed ? 0.7 : 0); this.transform.updateMatrix();
      this.mesh.setMatrixAt(index, this.transform.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  public dispose(): void { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); this.mesh.dispose(); }
}
