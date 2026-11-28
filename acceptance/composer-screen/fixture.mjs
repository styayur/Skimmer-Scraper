import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { GameRenderer } from '../src/render/GameRenderer.ts';
import { createFlightState, stepFlight } from '../src/flight/flightModel.ts';
import { worldSettingsFromSearch } from '../src/world/worldConfig.ts';
import { WorldStreamer } from '../src/world/worldStreamer.ts';
import { InlineChunkSource } from '../src/world/chunkSource.ts';
import { observeStorage } from './targets.mjs';

async function setup() {
  const settings = worldSettingsFromSearch('?theme=kinetic-city&seed=334458&gen=4');
  const world = new WorldStreamer(settings,{source:new InlineChunkSource(settings),renderRadius:1,collisionRadius:1,maxLoadedChunks:9});
  const spawn = world.getDefaultSpawn();
  world.updateCoverage(spawn.position,{x:0,y:0,z:0},{inFlight:false});
  for (let attempt=0; attempt<3000; attempt++) {
    const states = world.getChunkStates();
    if (states.length === 9 && states.every(s=>s.state==='ACTIVE')) break;
    if (attempt === 2999) throw Error('Incomplete fixed scene: '+JSON.stringify(states));
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  const canvas = document.getElementById('scene');
  const getContext = canvas.getContext.bind(canvas);
  let gl, ledger;
  canvas.getContext = (...args) => {
    const context = getContext(...args);
    if (!gl && args[0] === 'webgl2' && context) {
      gl = context;
      ledger = observeStorage(gl);
    }
    return context;
  };
  const game = new GameRenderer(canvas,world);
  const {renderer,composer,bloomPass} = game;
  const [scenePass,,output] = composer.passes;
  const targets = () => [composer.renderTarget1,composer.renderTarget2].map(t=>ledger.inspect(renderer,t));
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  let state = createFlightState(world.getSpawn());
  const geometry = world.getChunkStates();
  const bound = [];
  const nativeSet = renderer.setRenderTarget.bind(renderer);
  renderer.setRenderTarget = (target,...args) => {
    bound.push(target?.texture.name || (target ? '(unnamed)' : 'screen'));
    return nativeSet(target,...args);
  };
  const initial = {threeRevision:THREE.REVISION,renderer:ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
    vendor:ext && gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),attributes:gl.getContextAttributes(),
    dpr:window.devicePixelRatio,settings,geometry,spawn,worldStats:world.getStats(),initialTargets:targets(),
    passFlags:{sceneClear:scenePass.clear,sceneSwap:scenePass.needsSwap,bloomSwap:bloomPass.needsSwap}};
  const copy = new ShaderPass(CopyShader);
  copy.needsSwap = false;
  let lastStep = -1;
  function step(s) {
    window.probeStep=s.name;
    if (s.index !== ++lastStep) throw Error('Unordered step');
    window.probeTime=1000+(s.index+1)*1000/60;
    if (s.resize) {
      canvas.style.width=s.resize[0]+'px'; canvas.style.height=s.resize[1]+'px';
      game.resize();
    }
    if (s.quality) game.setQuality(s.quality);
    const offscreen = s.control==='offscreen', appended = s.control==='appended';
    composer.renderToScreen=!offscreen;
    if (appended) composer.addPass(copy);
    bound.length=0;
    const before = composer.readBuffer.texture.name;
    if (s.mode==='title') game.renderTitle(window.probeTime);
    else {
      state=stepFlight(state,state.control,1/120);
      state=stepFlight(state,state.control,1/120);
      if (s.snap) game.snapCamera(state);
      game.renderFlight(state,1/60,window.probeTime);
    }
    const renderTargets=bound.slice();
    if (offscreen) {
      // Present the actual output left in the composer's read buffer for a pixel comparison.
      copy.renderToScreen=true;
      copy.render(renderer,composer.writeBuffer,composer.readBuffer,0,false);
    }
    if (appended) composer.removePass(copy);
    if (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) || gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING))
      throw Error('Canvas readback requires the default framebuffer');
    const width=gl.drawingBufferWidth, height=gl.drawingBufferHeight;
    const pixels=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const measured=targets(), stats=game.getStats();
    const error=gl.getError();
    return {name:s.name,mode:s.mode,control:s.control??'screen',before,after:composer.readBuffer.texture.name,
      outputToScreen:output.renderToScreen,outputNeedsSwap:output.needsSwap,renderTargets,targets:measured,
      payloadBytes:measured.reduce((sum,t)=>sum+(t.payloadBytes||0),0),width,height,time:window.probeTime,
      quality:game.getQuality(),state:state.position,camera:game.camera.matrixWorld.elements.slice(),
      projection:game.camera.projectionMatrix.elements.slice(),draw:{calls:stats.calls,triangles:stats.triangles,points:stats.points,lines:stats.lines},
      textures:stats.textures,geometries:stats.geometries,bloom:bloomPass.enabled,shadow:[renderer.shadowMap.enabled,renderer.shadowMap.type],
      antialias:gl.getContextAttributes().antialias,error,rgba:pixels.toBase64()};
  }
  window.measure={initial,step,events:ledger.events};
}
setup().catch(error=>{window.probeError=String(error.stack||error)});
