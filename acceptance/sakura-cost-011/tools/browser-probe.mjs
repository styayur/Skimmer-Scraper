// Runs only in the hosted Chromium test context, before any application scripts.
export function installProbe({graphics}) {
  const now = performance.now.bind(performance);
  let active = false, calls = {}, inclusiveMs = {};
  window.__meter = {
    hit(k) { if (active) calls[k] = (calls[k] || 0) + 1; },
    start() { return active ? now() : -1; },
    end(k,t) { if (t >= 0 && active) inclusiveMs[k] = (inclusiveMs[k] || 0) + now()-t; },
    reset() { calls={}; inclusiveMs={}; active=true; },
    take() { active=false; return {calls,inclusiveMs}; },
  };
  // Hold only rAF delivery. The real keyboard, workers, timers and collision-coverage waits continue.
  let held = false, queue = new Map(), next = 1;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const cancel = (id) => { queue.delete(id); };
  window.requestAnimationFrame = cb => {
    const id=next++;
    queue.set(id,cb);
    if (!held) nativeRaf(t => {
      if (!held && queue.has(id)) { queue.delete(id); cb(t); }
    });
    return id;
  };
  window.cancelAnimationFrame = cancel;
  window.__delivery = {
    hold() { held=true; },
    pulse(t) {
      if (!held) throw Error('presentation is not held');
      const work=[...queue];
      for (const [id,cb] of work) if (queue.delete(id)) cb(t);
      return work.length;
    },
  };
  if (!graphics) return;
  const p = WebGL2RenderingContext.prototype;
  const contexts = new WeakMap();
  function state(gl) {
    if (!contexts.has(gl)) contexts.set(gl,{
      shaders:new WeakMap(), attached:new WeakMap(), programs:new WeakMap(), sources:[],
      uniformNames:new WeakMap(), program:-1, viewport:[0,0,gl.drawingBufferWidth,gl.drawingBufferHeight],
      fbo:false, enable:{}, depthFunc:gl.LESS, depthMask:true, cullFace:gl.BACK,
      frontFace:gl.CCW, blend:[gl.ONE,gl.ZERO,gl.ONE,gl.ZERO], mask:[true,true,true,true],
    });
    return contexts.get(gl);
  }
  function wrap(name,before,after) {
    const orig=p[name];
    if (typeof orig!=='function') return;
    p[name]=function(...args) {
      const s=state(this);
      if (before) before(s,args,this);
      const result=Reflect.apply(orig,this,args);
      if (after) after(s,args,result,this);
      return result;
    };
  }
  wrap('createShader',null,(s,[kind],obj)=>{if(obj)s.shaders.set(obj,{kind,source:''});});
  wrap('shaderSource',(s,[obj,source])=>{ s.shaders.get(obj).source=source; });
  wrap('attachShader',(s,[program,shader])=>{
    const list=s.attached.get(program)||[]; list.push(s.shaders.get(shader)); s.attached.set(program,list);
  });
  wrap('linkProgram',(s,[program])=>{
    const key=s.sources.length;
    s.sources.push((s.attached.get(program)||[]).map(({kind,source})=>[kind,source]));
    s.programs.set(program,key);
  });
  wrap('useProgram',(s,[program])=>{s.program=program?s.programs.get(program):-1;});
  wrap('bindFramebuffer',(s,[target,fbo],gl)=>{if(target!==gl.READ_FRAMEBUFFER)s.fbo=!!fbo;});
  wrap('viewport',(s,args)=>{s.viewport=args;});
  for (const [name,on] of [['enable',true],['disable',false]]) wrap(name,(s,[cap])=>{s.enable[cap]=on;});
  for (const name of ['depthFunc','depthMask','cullFace','frontFace']) wrap(name,(s,[v])=>{s[name]=v;});
  wrap('colorMask',(s,args)=>{s.mask=args;});
  wrap('blendFunc',(s,[a,b])=>{s.blend=[a,b,a,b];});
  wrap('blendFuncSeparate',(s,args)=>{s.blend=args;});
  wrap('getUniformLocation',null,(s,[,name],obj)=>{if(obj)s.uniformNames.set(obj,name);});
  let capture;
  for(const name of Object.getOwnPropertyNames(p).concat(Object.getOwnPropertyNames(WebGLRenderingContext.prototype))) {
    if (!/^uniform(?:Matrix|[1234])/.test(name) || !p[name] || Object.hasOwn(p[name],'__sakura')) continue;
    wrap(name,(s,[loc])=>{
      if(capture && loc) {
        const key=name+' '+s.uniformNames.get(loc);
        capture.uniformWrites[key]=(capture.uniformWrites[key]||0)+1;
      }
    });
    p[name].__sakura = true;
  }
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','drawRangeElements']) {
    wrap(name,(s,args,gl)=>{
      if (!capture) return;
      const flags=[gl.DEPTH_TEST,gl.CULL_FACE,gl.BLEND,gl.STENCIL_TEST,gl.SCISSOR_TEST,gl.POLYGON_OFFSET_FILL]
        .map((cap,i)=>Number(!!s.enable[cap])<<i).reduce((a,b)=>a|b,0);
      capture.draws.push([s.program,name,args,s.fbo,...s.viewport,flags,s.depthFunc,s.depthMask,
        s.cullFace,s.frontFace,...s.blend,...s.mask]);
    });
  }
  window.__webgl = {
    begin() { capture={draws:[],uniformWrites:{}}; },
    end() { const c=capture;capture=null;return c; },
    inventory() {
      const gl=document.querySelector('#game-canvas').getContext('webgl2'),s=state(gl);
      const dbg=gl.getExtension('WEBGL_debug_renderer_info');
      return {programs:s.sources,device:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        vendor:dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
        buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],extensions:gl.getSupportedExtensions()};
    },
  };
}
