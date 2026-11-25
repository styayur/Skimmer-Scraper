import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';

const [candidate,previous,output]=process.argv.slice(2);
const s=await createServer({server:{middlewareMode:true},logLevel:'error'});
const {islandsAround}=await s.ssrLoadModule('/src/world/dragonspineIslands.ts');
const {dragonspineFloor,valleyAxis}=await s.ssrLoadModule('/src/world/dragonspineTerrain.ts');
const seed=334458, islands=islandsAround(seed,0,0,1550);
await s.close();
const site=kind=>islands.find(item=>item.kind===kind);
const point=(x,y,z)=>({x,y,z});
let peak=point(0,0,0);
for(let x=-900;x<=900;x+=35)for(let z=-1100;z<1100;z+=35){
  const y=dragonspineFloor(x,z,seed);if(y>peak.y)peak=point(x,y,z);
}
const browser=await chromium.launch({channel:'msedge',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
const frames=[];
try{
  for(const [theme,base] of [['dragonspine',candidate],['dragon',previous]]){
    const folder=path.join(output,theme);await mkdir(folder,{recursive:true});
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url=new URL(base);url.search='?debug=1&gen=4&seed='+seed+'&theme='+theme;
    await page.goto(url.href);
    await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().dynamicStructures.length);
    await page.evaluate(()=>window.__SKIMMER_SCRAPER__.pause());
    // The pause overlay alone is hidden while photographing the stationary camera.
    await page.addStyleTag({content:'#pause-panel{visibility:hidden!important}'});
    const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');
      return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
    assert.match(gpu,/780M/);
    const batch=[];
    for(let i=0;i<14;i++){
      if(theme==='dragonspine'){
        if(i===3)await page.evaluate(async()=>{const g=window.__SKIMMER_SCRAPER__;g.resume();await g.advance(2.8,{holdPosition:true});g.pause();});
        const hero=await page.evaluate(()=>window.__SKIMMER_SCRAPER__.snapshot().dynamicStructures.find(d=>d.id==='crownback').position);
        const gorge=point(valleyAxis(-230,seed,0),dragonspineFloor(valleyAxis(-230,seed,0),-230,seed)+95,-230);
        const subjects=[hero,hero,hero,hero,peak,gorge,gorge,site('citadel'),site('citadel'),site('monolith'),site('chain'),site('ridge'),site('nest'),gorge];
        const names=['scale','silhouette','close','wingbeat','peak','gorge','vault','ruins','citadel','underside','clouds','high-domain','chase','cockpit'];
        const offsets=[[150,76,315],[490,250,680],[95,45,170],[95,45,170],[-450,135,475],[0,14,195],
          [0,-25,170],[12,85,220],[180,120,450],[0,-305,300],[250,105,410],[-190,180,420],[20,50,280],[0,-34,155]];
        const target=subjects[i], [dx,dy,dz]=offsets[i];
        const aim=point(target.x,target.y,target.z);
        const camera=point(aim.x+dx,aim.y+dy,aim.z+dz);
        // Find a clear line to above-ground landmarks. The underside and canyon
        // use fixed deliberately low approaches.
        if(![5,6,9,13].includes(i)){
          for(let k=1;k<=16;k++){
            const t=k/16, x=aim.x+dx*t,z=aim.z+dz*t;
            camera.y=Math.max(camera.y,aim.y+(dragonspineFloor(x,z,seed)+12-aim.y)/t);
          }
        }
        frames.push({name:names[i],camera,aim,view:i===13?'cockpit':'chase'});
      }
      const frame=frames[i];
      const sample=await page.evaluate(async({camera,aim,view})=>{
        const g=window.__SKIMMER_SCRAPER__;
        const dx=aim.x-camera.x, dz=aim.z-camera.z;
        g.setCameraMode(view);
        await g.setPose(camera,{yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(aim.y-camera.y,Math.hypot(dx,dz)),roll:0});
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const state=g.snapshot();
        return {cameraMode:state.cameraMode,position:state.position,attitude:state.attitude,cameraPosition:state.cameraPosition,
          world:state.world,origin:state.renderOrigin,coverage:state.streaming.coverageComplete,dragon:state.dynamicStructures[0]};
      },frame);
      assert(sample.coverage);
      await page.screenshot({path:path.join(folder,frame.name+'.jpg'),quality:88});
      batch.push({...frame,...sample});
    }
    assert.deepEqual(errors,[]);
    await writeFile(path.join(folder,'views.json'),JSON.stringify({gpu,base,seed,theme,views:batch,errors},null,2));
    await page.close();
  }
} finally {await browser.close();}
