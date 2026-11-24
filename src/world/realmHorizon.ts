import * as T from 'three';
import type { Vec3 } from '../core/math';
import { dragonHeight } from './dragonTerrain';
import { ascendantFloor } from './ascendantTerrain';

/** Coarse terrain outside the collision ring and a translucent deck of valley cloud. */
export class RealmHorizon {
  readonly group = new T.Group();
  private readonly mountains: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  private readonly cloud: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  private cx = NaN;
  private cz = NaN;
  private readonly origin = new T.Vector3();
  constructor(private readonly seed: number, private readonly ascendant = false) {
    const side = 64,
      count = (side + 1) ** 2;
    const g = new T.BufferGeometry();
    g.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(count * 3), 3),
    );
    const indices: number[] = [];
    for (let z = 0; z < side; z++)
      for (let x = 0; x < side; x++) {
        // The inner collision tiles already draw the high-resolution mountains.
        if (x >= 30 && x < 34 && z >= 30 && z < 34) continue;
        const a = z * (side + 1) + x,
          b = a + side + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    g.setIndex(indices);
    this.mountains = new T.Mesh(
      g,
      new T.MeshStandardMaterial({
        color: 0x63766c,
        roughness: 0.99,
        flatShading: true,
      }),
    );
    const clouds = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: {
        worldOffset: { value: new T.Vector2() },
        phase: { value: (seed % 1024) * 0.01 },
      },
      vertexShader: `varying vec2 p; uniform vec2 worldOffset;
        void main(){p=position.xy+worldOffset;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 p; uniform float phase;
        float h(vec2 a){return fract(sin(dot(a,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
        void main(){vec2 q=p*.006+phase;float n=.57*noise(q)+.3*noise(q*2.7)+.13*noise(q*6.);
        gl_FragColor=vec4(mix(vec3(.61,.68,.65),vec3(.96,.88,.69),n),smoothstep(.29,.74,n)*.42);}`,
    });
    this.cloud = new T.Mesh(new T.PlaneGeometry(4200, 4200), clouds);
    this.cloud.rotation.x = -Math.PI / 2;
    this.group.add(this.mountains, this.cloud);
  }
  cover(p: Vec3): void {
    const cx = Math.floor(p.x / 220),
      cz = Math.floor(p.z / 220);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const x = (cx + 0.5) * 220,
      z = (cz + 0.5) * 220;
    const positions = this.mountains.geometry.getAttribute('position');
    for (let j = 0; j <= 64; j++)
      for (let i = 0; i <= 64; i++) {
        const dx = (i - 32) * 55,
          dz = (j - 32) * 55;
        positions.setXYZ(
          j * 65 + i,
          dx,
          (this.ascendant ? ascendantFloor : dragonHeight)(x + dx, z + dz, this.seed) - 14,
          dz,
        );
      }
    positions.needsUpdate = true;
    this.mountains.geometry.computeVertexNormals();
    this.mountains.geometry.computeBoundingSphere();
    this.mountains.position.set(x, 0, z);
    this.cloud.position.set(x, this.ascendant ? 430 : 35, z);
    this.cloud.material.uniforms.worldOffset!.value.set(x, -z);
  }
  shiftOrigin(p: Vec3): void {
    this.origin.set(p.x, p.y, p.z);
    this.group.position.copy(this.origin).multiplyScalar(-1);
  }
  dispose(): void {
    this.mountains.geometry.dispose();
    this.mountains.material.dispose();
    this.cloud.geometry.dispose();
    this.cloud.material.dispose();
    this.group.clear();
  }
}
