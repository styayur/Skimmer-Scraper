import { CHUNK_SIZE } from './worldConfig';

export const VALLEY_SPACING = CHUNK_SIZE * 8;
const gaussian = (v: number) => Math.exp(-v*v);
const smooth = (v: number) => { const t=Math.min(1,Math.max(0,v)); return t*t*(3-2*t); };

export function valleyAxis(z: number, seed: number, valley: number) {
  const phase=(seed % 919)*.012 + valley*1.7;
  return valley*VALLEY_SPACING + 92*(Math.sin(z/530+phase)-Math.sin(120/530+phase))
    + 43*(Math.sin(z/256+phase)-Math.sin(120/256+phase));
}

/** Bedrock is shared by collision tiles and the distant horizon. The overhanging
 * shelves and vaults are separate closed surfaces above this floor. */
export function ascendantFloor(x: number,z: number,seed: number) {
  const valley=Math.round(x/VALLEY_SPACING);
  // Blend the neighbouring valley's field at the watershed. A single nearest-axis
  // lookup would change height abruptly halfway between meandering canyons.
  const phase=(seed%2017)*.008;
  const field=(lane: number) => {
    const axis=valleyAxis(z,seed,lane);
    const across=Math.abs(x-axis);
    const wall=smooth((across-54)/161);
    const terraces=smooth((across-245)/55);
    const ridge=smooth((across-345)/325);
    const fold=.5+.5*Math.sin(z/340+lane*.9+phase);
    const summit=gaussian((across-695)/154)*Math.pow(fold,3);
    return -192 + 24*Math.sin(z/315+phase)+14*Math.cos((x-axis)/54+z/180)
      + wall*(235+55*fold) + terraces*(75+40*fold)
      + ridge*(115+125*fold) + summit*630
      + wall*(15*Math.sin(x/37+z/82)+8*Math.cos(x/63-z/22));
  };
  const local=x-valley*VALLEY_SPACING;
  const blend=.5*smooth((Math.abs(local)-660)/(VALLEY_SPACING/2-660));
  const height=field(valley);
  return blend===0 ? height : height*(1-blend)+field(valley+Math.sign(local))*blend;
}
