// Observe native storage calls. Nothing here binds an uninitialized Three target.
export function observeStorage(gl) {
  const handles = new WeakMap();
  const storage = new WeakMap();
  const events = [];
  let sequence = 0;
  const id = object => object && handles.get(object);
  const wrap = (method, observer) => {
    const original = gl[method].bind(gl);
    gl[method] = (...args) => {
      const value = original(...args);
      observer(args, value);
      return value;
    };
  };
  for (const kind of ['Texture', 'Framebuffer', 'Renderbuffer']) {
    wrap('create'+kind, (_, object) => { if (object) handles.set(object, kind+(++sequence)); });
    wrap('delete'+kind, ([object]) => { if (object) events.push({frame:window.probeStep,op:'delete',id:id(object)}); });
  }
  function allocated(object, op, format, width, height, levels, samples) {
    const row = {frame:window.probeStep, op, id:id(object), format, width, height, levels, samples};
    storage.set(object, row);
    events.push(row);
  }
  wrap('texImage2D', args => {
    const [target, level, format, width, height] = args;
    if (target === gl.TEXTURE_2D && level === 0 && args.length === 9)
      allocated(gl.getParameter(gl.TEXTURE_BINDING_2D),'texImage2D',format,width,height,1,0);
  });
  wrap('texStorage2D', ([target,levels,format,width,height]) => {
    if (target === gl.TEXTURE_2D)
      allocated(gl.getParameter(gl.TEXTURE_BINDING_2D),'texStorage2D',format,width,height,levels,0);
  });
  wrap('renderbufferStorage', ([,format,width,height]) =>
    allocated(gl.getParameter(gl.RENDERBUFFER_BINDING),'renderbufferStorage',format,width,height,1,0));
  wrap('renderbufferStorageMultisample', ([,samples,format,width,height]) =>
    allocated(gl.getParameter(gl.RENDERBUFFER_BINDING),'renderbufferStorageMultisample',format,width,height,1,samples));

  function inspect(renderer, target) {
    const framebuffer = renderer.properties.has(target) && renderer.properties.get(target).__webglFramebuffer;
    const out = {name:target.texture.name,width:target.width,height:target.height,allocated:Boolean(framebuffer)};
    if (!framebuffer) return out;
    const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const previousRB = gl.getParameter(gl.RENDERBUFFER_BINDING);
    try {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,framebuffer);
      const parm = (attachment,p) => gl.getFramebufferAttachmentParameter(gl.READ_FRAMEBUFFER,attachment,p);
      const color = parm(gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
      const depth = parm(gl.DEPTH_ATTACHMENT,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
      const colorBits = ['RED','GREEN','BLUE','ALPHA'].map(c => parm(gl.COLOR_ATTACHMENT0,gl['FRAMEBUFFER_ATTACHMENT_'+c+'_SIZE']));
      gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
      const rb = name => gl.getRenderbufferParameter(gl.RENDERBUFFER,gl['RENDERBUFFER_'+name]);
      const depthBits = rb('DEPTH_SIZE');
      return {...out,fbo:id(framebuffer),complete:gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,
        color:storage.get(color), depth:storage.get(depth), colorBits, depthBits,
        floatColor:parm(gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE) === gl.FLOAT,
        rbFormat:rb('INTERNAL_FORMAT'),rbWidth:rb('WIDTH'),rbHeight:rb('HEIGHT'),samples:rb('SAMPLES'),
        payloadBytes:storage.get(color).width*storage.get(color).height*(colorBits.reduce((a,b)=>a+b,0)+depthBits)/8};
    } finally {
      gl.bindRenderbuffer(gl.RENDERBUFFER,previousRB);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,previousRead);
    }
  }
  return {events,inspect};
}
