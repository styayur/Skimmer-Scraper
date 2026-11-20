import * as THREE from 'three';
/** Original light sculpture, deliberately non-solid light rather than an invisible obstacle. */
export class JourneyGate {
 public readonly group=new THREE.Group();
 private readonly material=new THREE.MeshStandardMaterial({color:0xffdf9a,emissive:0xb67d32,emissiveIntensity:1.5,metalness:.6,roughness:.25});
 private readonly geometry=new THREE.TorusGeometry(18,.65,8,64);
 public constructor(){
  this.group.name='fifth-sky-light-signature';
  for(let i=0;i<3;i++){const ring=new THREE.Mesh(this.geometry,this.material);ring.rotation.y=i*Math.PI/3;ring.position.y=i*4;this.group.add(ring);}
  this.group.visible=false;
 }
 public dispose():void{this.group.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
