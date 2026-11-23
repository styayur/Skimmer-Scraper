/** A meandering canyon separates folded rock ridges. Absolute coordinates keep chunk edges continuous. */
export function dragonHeight(x: number, z: number, seed: number): number {
  const phase=(seed%8191)*0.017;
  const channel=74*(Math.sin(z/340+phase)-Math.sin(120/340+phase))+29*(Math.sin(z/157)-Math.sin(120/157));
  const across=Math.abs(x-channel);
  const ridge=(1-Math.cos(across/110))/2;
  const strata=0.5+0.5*Math.sin(z/149+phase+0.7*Math.sin(x/97));
  return -17+ridge*(95+105*strata)+9*Math.sin(z/91+phase)+
    Math.min(across/100,1)*(11*Math.sin(x/23+z/37)+5*Math.cos(z/13-x/41));
}
