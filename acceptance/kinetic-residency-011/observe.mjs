import assert from 'node:assert/strict';

// The shipping debug bridge closes over the active world. Read its Chromium inspector
// scope, so the digest comes from the adapter's live BVH without adding a game hook.
export async function inspectWorld(page) {
  const session = await page.context().newCDPSession(page);
  const fn = (await session.send('Runtime.evaluate', {
    expression:'window.__SKIMMER_SCRAPER__.glideSurface', objectGroup:'residency-evidence',
  })).result;
  const props = async id => session.send('Runtime.getProperties', {objectId:id, ownProperties:true});
  const scopes = (await props(fn.objectId)).internalProperties.find(p => p.name === '[[Scopes]]');
  const names = fn.description.match(/[A-Za-z_$][\w$]*/g) ?? [];
  const candidates = [];
  for (const scope of (await props(scopes.value.objectId)).result) {
    if (!scope.value?.objectId || scope.value.description === 'Global') continue;
    for (const p of (await props(scope.value.objectId)).result) {
      if (p.value?.objectId && p.value.type === 'object' && names.includes(p.name)) candidates.push(p);
    }
  }
  const call = async (objectId, operation, data) => {
    const reply = await session.send('Runtime.callFunctionOn', {objectId, functionDeclaration:operation.toString(),
      arguments:data === undefined ? [] : [{value:data}], returnByValue:true, awaitPromise:true});
    if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    return reply.result.value;
  };
  for (const candidate of candidates) {
    const id = candidate.value.objectId;
    if (await call(id, function () {
      return this.settings?.theme === 'kinetic-city' && typeof this.semanticCandidates === 'function'
        && this.chunks instanceof Map && this.adapter?.chunks instanceof Map;
    })) return {read:(operation,data) => call(id,operation,data), close:() => session.detach()};
  }
  throw Error('Active WorldStreamer missing from shipping bridge scope: '+fn.description+'; bindings: '+candidates.map(p => p.name).join(','));
}

export async function residentCell({x,z}) {
  const key = x+':'+z;
  const record = this.chunks.get(key);
  if (!record?.generated || record.state !== 'ACTIVE') throw Error('Expected ACTIVE record '+key);
  const chunk = record.generated;
  const indexed = this.adapter.chunks.get(chunk.key);
  const geometry = indexed?.bvh.geometry;
  if (!geometry || geometry !== chunk.collisionGeometry) throw Error('Resident BVH does not own generated geometry '+key);
  const pos = geometry.getAttribute('position').array, index = geometry.getIndex()?.array;
  if (!index || pos.length === 0 || index.length === 0) throw Error('Missing collision arrays '+key);
  const portableBytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice();
  const p = portableBytes(pos), i = portableBytes(index), both = new Uint8Array(p.length + i.length);
  both.set(p); both.set(i,p.length);
  const hex = async a => [...new Uint8Array(await crypto.subtle.digest('SHA-256',a))]
    .map(b => b.toString(16).padStart(2,'0')).join('');
  const socketId = ['kinetic-grid-1-r2',this.settings.seed,'N',x,z].join('.');
  const authored = chunk.topology.hints.find(h => h.id === socketId);
  if (!authored) throw Error('No owned north socket '+key);
  const live = this.semanticCandidates(authored.position).find(c => c.semantic.id === socketId);
  if (!live) throw Error('Missing active socket lease '+key);
  const position = live.position;
  const contact = this.adapter.queryGlide({x:position.x, y:position.y-5.9, z:position.z+0.05}, 2, chunk.key);
  if (!contact || contact.contact?.geometryId !== geometry.uuid) throw Error('Live collision query missed indexed geometry '+key);
  const publicState = this.getChunkStates().find(c => c.key === key);
  const stats = this.getStreamerStats();
  const history = window.__SKIMMER_SCRAPER__.snapshot().revisionHistory;
  const [collisionSha256,positionSha256,indexSha256] = await Promise.all([hex(both),hex(p),hex(i)]);
  return {cell:key,id:chunk.key,worldFingerprint:this.getFingerprint(),revision:record.revision,
    chunkFingerprint:chunk.fingerprint,publicState,layout:chunk.topology.layout,origin:chunk.origin,
    socket:{id:socketId,position,lease:live.lease},geometryUuid:geometry.uuid,
    contact:{chunkId:contact.chunkId,logicalSurfaceId:contact.contact.logicalSurfaceId,distance:contact.distance},
    workerBuildMs:chunk.workerBuildMs,active:stats.activeChunks,bvhs:stats.bvhCount,cap:stats.maxLoadedChunks,
    retiredTotal:stats.retiredTotal,disposedGeometryCount:stats.disposedGeometryCount,renderOrigin:this.getRenderOrigin(),
    history:history?.entries.find(e => e.key === key) ?? null,positionType:pos.constructor.name,indexType:index.constructor.name,
    positionBytes:p.length,indexBytes:i.length,triangles:index.length/3,collisionSha256,positionSha256,indexSha256};
}

export function retiredCell({cell,id,socket}) {
  const history = window.__SKIMMER_SCRAPER__.snapshot().revisionHistory;
  const hints = this.semanticCandidates(socket.position);
  const stats = this.getStreamerStats();
  return {cell,id,oldLease:socket.lease,managed:this.chunks.has(cell),indexed:this.adapter.hasChunk(id),
    socketStillExposed:hints.some(h => h.semantic.id === socket.id),leaseStillExposed:hints.some(h => h.lease === socket.lease),
    history:history?.entries.find(e => e.key === cell) ?? null,epoch:history?.epoch ?? null,
    historySize:history?.entries.length ?? 0,historyCap:history?.maxEntries ?? 0,
    retiredTotal:stats.retiredTotal,disposedGeometryCount:stats.disposedGeometryCount,
    active:stats.activeChunks,bvhs:stats.bvhCount,cap:stats.maxLoadedChunks,renderOrigin:this.getRenderOrigin()};
}

export async function relocate(page, cell) {
  const target = {x:(cell.x+0.5)*220, y:135, z:(cell.z+0.5)*220};
  await page.evaluate(p => window.__SKIMMER_SCRAPER__.setPose(p).then(() => undefined),target);
  await page.waitForFunction(({x,z}) => {
    const s=window.__SKIMMER_SCRAPER__.snapshot(), counts=s.streaming.stateCounts;
    return Math.floor(s.position.x/220) === x && Math.floor(s.position.z/220) === z
      && s.streaming.coverageComplete && counts.GENERATING === 0 && counts.QUEUED === 0 && counts.RETIRING === 0;
  },cell,{polling:100,timeout:60000});
}

export async function openSession(browser, base, seed, mode) {
  const context = await browser.newContext({viewport:{width:384,height:240},deviceScaleFactor:1,locale:'en-US'});
  try {
    const page=await context.newPage(), workers=[], errors=[];
    page.on('worker', w => workers.push(w.url()));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if (m.type()==='error') errors.push(m.text().slice(0,300));});
    await page.goto(new URL('?theme=kinetic-city&gen=4&world='+mode+'&seed='+seed,base).href);
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready,null,{timeout:90000});
    const world=await inspectWorld(page);
    const initial=await page.evaluate(() => {
      const s=window.__SKIMMER_SCRAPER__.snapshot();
      const gl=document.querySelector('#game-canvas').getContext('webgl2'), ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {seed:s.seed,mode:s.worldMode,fingerprint:s.worldFingerprint,spawn:s.position,
        renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),userAgent:navigator.userAgent};
    });
    assert.equal(initial.seed,seed); assert.equal(initial.mode,mode); assert.match(initial.renderer,/swiftshader/i);
    return {page,world,context,workers,errors,initial};
  } catch(error) {
    await context.close();
    throw error;
  }
}
