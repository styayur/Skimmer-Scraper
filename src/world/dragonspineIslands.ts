import { seededRandom } from './deterministic';
import { dragonspineFloor } from './dragonspineTerrain';

export type Vertex = [number,number,number];
export interface Face { vertices: Vertex[]; color: number; }
export type IslandKind = 'citadel'|'ridge'|'chain'|'monolith'|'nest';
export interface Island {id:string;kind:IslandKind;x:number;y:number;z:number;rx:number;rz:number;depth:number;phase:number;}

const descriptions: ReadonlyArray<[IslandKind,number,number,number,number,number,number]> = [
  ['citadel',220,-840,435,248,174,108],
  ['ridge',-470,-520,560,190,256,125],
  ['chain',-115,710,570,86,69,66],
  ['monolith',805,95,865,465,292,240],
  ['nest',-175,185,238,140,105,86],
];

const nestAltitudes=new Map<string,number>();
function nestAltitude(seed:number,x:number,z:number) {
  const key=seed+':'+x+':'+z;
  const cached=nestAltitudes.get(key);
  if(cached!==undefined)return cached;
  let height=238;
  for(let dz=-255;dz<=255;dz+=51)for(let dx=-255;dx<=306;dx+=51)
    height=Math.max(height,dragonspineFloor(x+dx,z+dz,seed)+80);
  nestAltitudes.set(key,height);
  if(nestAltitudes.size>64)nestAltitudes.delete(nestAltitudes.keys().next().value!);
  return height;
}
export function islandsAround(seed:number,x:number,z:number,range:number): Island[] {
  const result:Island[]=[];
  const span=3600;
  for(let rz=Math.floor((z-range-1500)/span);rz<=Math.ceil((z+range+1500)/span);rz++)
    for(let rx=Math.floor((x-range-1500)/span);rx<=Math.ceil((x+range+1500)/span);rx++){
      for(const [kind,dx,dz,altitude,rxSize,rzSize,depth] of descriptions){
        const rng=seededRandom(seed,rx,rz,'island-'+kind);
        const ix=rx*span+dx+(rng()-.5)*70, iz=rz*span+dz+(rng()-.5)*70;
        const satellites=kind==='chain'?5:1;
        for(let n=0;n<satellites;n++){
          const xx=ix+n*133,zz=iz+57*Math.sin(n*1.2);
          const phase=rng()*Math.PI*2;
          if(Math.abs(xx-x)>range+rxSize*1.36 || Math.abs(zz-z)>range+rzSize*1.36)continue;
          const y=kind==='nest' ? nestAltitude(seed,xx,zz) : Math.max(dragonspineFloor(xx,zz,seed)+depth+88,altitude+n*27);
          result.push({id:[kind,rx,rz,n].join(':'),kind,x:xx,y,z:zz,rx:rxSize,rz:rzSize,depth,phase});
        }
      }
    }
  return result;
}

const shale=0x485b61, moss=0x738f79, pale=0xb1ba9a, bronze=0xb1844c, gold=0xe1ba71, water=0x68babb;
export function islandFaces(site:Island,detail:'far'|'middle'|'near'): Face[]{
  const out:Face[]=[];
  const {x,y,z,rx,rz,phase,depth,kind}=site;
  const face=(vertices:Vertex[],color:number)=>out.push({vertices,color});
  // The same main contour, upper deck and passage openings anchor all levels.
  const segments=24;
  const ring=(i:number,scale:number,dy:number,inner=false):Vertex=>{
    const a=i*2*Math.PI/segments;
    const profile=1+.10*Math.sin(3*a+phase)+.065*Math.cos(7*a-phase);
    const shoulder=kind==='ridge'? Math.max(0,Math.cos(a-.8))*37:0;
    return [x+Math.cos(a)*rx*scale*profile,y+dy+(inner?0:shoulder)+4*Math.sin(3*a+phase),
      z+Math.sin(a)*rz*scale*profile];
  };
  const shaft=kind==='monolith'?.34:kind==='citadel'?.20:.16;
  const step=detail==='far'?2:1;
  for(let i=0;i<segments;i+=step){
    const j=i+step;
    const outer=(k:number)=>ring(k,1,0);
    const waist=(k:number)=>ring(k,.89,-depth*.31);
    const base=(k:number)=>ring(k,.62,-depth*.83);
    const lower=(k:number)=>ring(k,.40,-depth,true);
    const inner=(k:number)=>ring(k,shaft,-2,true);
    const under=(k:number)=>ring(k,shaft*.92,-depth*.80,true);
    face([outer(i),inner(i),inner(j),outer(j)],kind==='ridge'?pale:moss);
    face([outer(i),outer(j),waist(j),waist(i)],i%4===0?bronze:pale);
    face([lower(i),lower(j),under(j),under(i)],shale);
    const gate=(i%12===0 || i%12===1);
    if(!gate){
      face([waist(i),waist(j),base(j),base(i)],i%5===0?0x755f56:shale);
      face([inner(i),under(i),under(j),inner(j)],shale);
    } else {
      face([waist(i),inner(i),inner(j),waist(j)],0x536766);
      face([base(i),base(j),under(j),under(i)],0x647475);
      for(const k of [i,j]){
        if(k%12===0 || k%12===2) face([waist(k),base(k),under(k),inner(k)],shale);
      }
    }
    face([base(i),base(j),lower(j),lower(i)],shale);
    if(detail==='near' && i%3===0){
      const a=ring(i,.89,-depth*.30),b=ring(i+1,.89,-depth*.31);
      const spur=ring(i+.6,.99,-depth*.61);
      face([a,b,spur],0x8d7c62);
    }
  }
  function tower(cx:number,cz:number,base:number,r:number,height:number,sides:number,color:number,top=.71) {
    const lower:Vertex[]=[],upper:Vertex[]=[];
    for(let k=0;k<sides;k++){
      const a=2*Math.PI*k/sides+Math.PI/4;
      lower.push([cx+r*Math.cos(a),base,cz+r*Math.sin(a)]);
      upper.push([cx+r*top*Math.cos(a),base+height,cz+r*top*Math.sin(a)]);
    }
    for(let k=0;k<sides;k++){
      const next=(k+1)%sides;
      face([lower[k]!,lower[next]!,upper[next]!,upper[k]!],color);
    }
    face(upper,pale); face(lower.slice().reverse(),color);
  }
  function deck(cx:number,cy:number,cz:number,dx:number,dz:number,width:number,height:number){
    const length=Math.hypot(dx,dz), nx=-dz/length*width/2, nz=dx/length*width/2;
    const corners:Vertex[]=[[cx+nx,cy,cz+nz],[cx+dx+nx,cy,cz+dz+nz],[cx+dx-nx,cy,cz+dz-nz],[cx-nx,cy,cz-nz]];
    face(corners,pale);
    const bottom=corners.map(([xx,yy,zz]):Vertex=>[xx,yy-height,zz]);
    face(bottom.slice().reverse(),shale);
    for(let i=0;i<4;i++)face([corners[i]!,corners[(i+1)%4]!,bottom[(i+1)%4]!,bottom[i]!],bronze);
  }
  if(kind==='citadel'){
    for(let k=0;k<12;k++){
      const a=k*Math.PI/6, px=x+rx*.61*Math.cos(a),pz=z+rz*.61*Math.sin(a);
      const h=(k%3===0?59:27)+8*Math.sin(a+phase);
      tower(px,pz,y-5,16,h,6,shale);
      tower(px,pz,y+h-5,20,8,6,bronze,.22);
      if(detail==='near'){
        tower(px,pz,y+h+2,3,14,4,gold,.1);
        deck(px,y+3,pz,(x-px)*.50,(z-pz)*.50,9,4);
      }
    }
    // Arcaded courts join the three tall watchtowers. Missing spans open sightlines
    // from the lower galleries into the central shaft.
    for(let ward=0;ward<3;ward++){
      const angle=ward*2*Math.PI/3+.28;
      const px=x+rx*.55*Math.cos(angle),pz=z+rz*.55*Math.sin(angle);
      const forwardX=Math.cos(angle+Math.PI/2),forwardZ=Math.sin(angle+Math.PI/2);
      deck(px-38*forwardX,y+9,pz-38*forwardZ,76*forwardX,76*forwardZ,26,9);
      for(let bay=0;bay<4;bay++){
        const bx=px+(bay-1.5)*19*forwardX,bz=pz+(bay-1.5)*19*forwardZ;
        for(const side of [-1,1]){
          const ax=bx+side*11*forwardZ,az=bz-side*11*forwardX;
          tower(ax,az,y+7,3.5,21,5,pale,.82);
          if(detail==='near')tower(ax,az,y+27,4.1,2.4,5,bronze);
        }
      }
      deck(px-40*forwardX,y+31,pz-40*forwardZ,80*forwardX,80*forwardZ,29,4);
      tower(px,pz,y+30,17,15,4,0x967965,.17);
      const next=angle+2*Math.PI/3;
      const qx=x+rx*.55*Math.cos(next),qz=z+rz*.55*Math.sin(next);
      deck(px,y+3,pz,(qx-px)*.35,(qz-pz)*.35,13,3);
    }
    // Broken processional bridge terminates on both sides of the eye.
    deck(x-rx*.80,y+12,z,rx*.66,0,23,8);deck(x+rx*.13,y+12,z,rx*.63,0,23,8);
  } else if(kind==='ridge'){
    for(let k=0;k<4;k++)tower(x+rx*(k/5-.5),z+rz*.39,y+3,44-k*4,76+k*13,7,shale,.035);
    // A thin hanging waterfall sheet catches sky light along the cliff edge.
    const a=ring(17,1,0),b=ring(17.5,1,0);
    face([a,b,[b[0]+7,b[1]-depth*1.1,b[2]-8],[a[0]+7,a[1]-depth*1.1,a[2]-8]],water);
  } else if(kind==='monolith'){
    for(let k=0;k<6;k++){
      const a=k*Math.PI/3+.2;
      tower(x+rx*.68*Math.cos(a),z+rz*.68*Math.sin(a),y,19,95,5,shale,.53);
    }
    deck(x-rx*.62,y+51,z-rz*.45,rx*.94,0,21,9);
    // Weathered brackets and bronze bands make the underside legible at speed.
    for(let k=0;k<12;k++){
      const a=k*Math.PI/6, px=x+rx*.69*Math.cos(a),pz=z+rz*.69*Math.sin(a);
      tower(px,pz,y-depth*.73,13,depth*.49,5,shale,1.85);
      if(detail!=='far')tower(px,pz,y-depth*.55,17,5,5,bronze,1.1);
    }
  } else if(kind==='nest'){
    for(let k=0;k<9;k++) {
      const a=Math.PI*.68+k*Math.PI*.08;
      tower(x+rx*.83*Math.cos(a),z+rz*.82*Math.sin(a),y-3,8,9+4*Math.cos(2*a),5,bronze,.12);
    }
  } else {
    tower(x+rx*.50,z,y-3,11,18,6,pale,.5);
  }
  return out;
}
