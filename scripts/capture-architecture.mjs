import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });
  await page.route('**/architecture-review', route => route.fulfill({ contentType:'text/html',
    body:'<!doctype html><body style="margin:0;overflow:hidden"><canvas></canvas></body>' }));
  await page.goto(new URL('/architecture-review',process.argv[2] ?? 'http://127.0.0.1:5179').href);
  const record = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { ArchitectureLibrary } = await import('/src/world/architectureLibrary.ts');
    const { createWorldMaterials } = await import('/src/world/materials.ts');
    const models=['moonGate','foldedFan','terraceOrchard','lanternCourt','needleExchange','skyGarden','span','orbit'];
    const library=new ArchitectureLibrary(), materials=createWorldMaterials(0,true);
    const scene=new THREE.Scene(), canvas=document.querySelector('canvas');
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(innerWidth,innerHeight);
    scene.background=new THREE.Color(0xf4b5b0);
    scene.add(new THREE.HemisphereLight(0xffe8e0,0xac95a7,2.5));
    const sun=new THREE.DirectionalLight(0xffe2cd,3.1);
    sun.position.set(-100,190,160); scene.add(sun);
    const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,1,1000);
    camera.position.set(64,102,264); camera.lookAt(0,45,0);
    const counts={};
    models.forEach((name,i)=>{
      counts[name]=0;
      const group=new THREE.Group();
      if(i<5) group.position.set((i-2)*46,0,-22);
      else group.position.set((i-6)*64,18,40);
      if(name==='orbit') group.rotation.x=1.2;
      for(const part of library.parts(name)){
        group.add(new THREE.Mesh(part.geometry,materials.byKey[part.material]));
        counts[name]+=part.geometry.getAttribute('position').count/3;
      }
      scene.add(group);
    });
    renderer.render(scene,camera);
    const gl=renderer.getContext();
    return {triangles:counts, drawCalls:renderer.info.render.calls,
      renderer:gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)};
  });
  assert(Object.keys(record.triangles).length===8);
  mkdirSync('evidence/v0.7/pr2',{recursive:true});
  await page.screenshot({path:'evidence/v0.7/pr2/architecture.jpg',quality:89});
  writeFileSync('acceptance/v0.7/pr2.json',JSON.stringify(record,null,2)+'\n');
} finally {await browser.close();}

