import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const tag = '[kinetic-startup-observer]';
export const seed = 334458;

// Runs in the application document. It only listens to product UI events and
// reads the stock flight bridge. A normal form submission replaces the first document.
function installObserver() {
  if (window.__kineticStartupObserved) return;
  window.__kineticStartupObserved = true;
  const selected = new URL(location.href).searchParams.get('theme') === 'kinetic-city';
  const send = (event, data = {}) => console.debug('[kinetic-startup-observer]' + JSON.stringify({
    event, selected, originMs: performance.timeOrigin, nowMs: performance.now(), ...data,
  }));
  const visible = id => !!document.getElementById(id)?.getClientRects().length;
  const sample = () => window.__SKIMMER_SCRAPER__?.snapshot();
  const title = () => {
    if (sample()?.mode === 'title' && visible('start-button') && !visible('loading-screen')) {
      send('titleReady', { href: location.href, focus: document.hasFocus(), visibility: document.visibilityState });
    } else requestAnimationFrame(title);
  };
  requestAnimationFrame(title);
  let frames = 0;
  const previous = [];
  const frame = rafMs => {
    const sampleBeginMs = performance.now();
    const s = sample(), stream = s.streaming;
    const cx = Math.floor(s.position.x / 220), cz = Math.floor(s.position.z / 220);
    const byKey = new Map(s.chunkStates.map(c => [c.key, c]));
    const ring = [];
    for (let z = cz-1; z <= cz+1; z++) for (let x = cx-1; x <= cx+1; x++) {
      ring.push(byKey.get(x+':'+z) ?? { key:x+':'+z, state:'UNLOADED' });
    }
    frames++;
    const row = { rafMs, sampleBeginMs, mode:s.mode, coverage:stream?.coverageComplete, buffering:s.buffering,
      bvh:stream?.bvhCount, active:stream?.activeChunks, runTime:s.runTime };
    if (s.mode === 'running' && !s.buffering && stream?.coverageComplete && stream.bvhCount > 0
        && ring.every(c => c.state === 'ACTIVE') && s.render.calls > 0 && visible('hud')) {
      // Timestamp readiness before making the extra live contact query or serializing the receipt.
      const readyMs = performance.now();
      const contact = window.__SKIMMER_SCRAPER__.glideSurface(s.position, 40);
      send('runningCoveredFrame', { readyMs, rafMs, sampleBeginMs, frames, previous, ring,
        mode:s.mode, seed:s.seed, worldMode:s.worldMode, generator:s.generatorVersion, fingerprint:s.worldFingerprint,
        position:s.position, runTime:s.runTime, focus:document.hasFocus(), visibility:document.visibilityState,
        buffering:s.buffering, adapter:s.adapter, streaming:stream, world:s.world, render:s.render,
        companions:s.companions.filter(c => c.deployed).length, shieldImpacts:s.shieldImpacts,
        contact:contact && { id:contact.chunkId, distance:contact.distance, surface:contact.contact?.logicalSurfaceId,
          geometryId:contact.contact?.geometryId, triangle:contact.contact?.triangle, point:contact.point } });
      return;
    }
    previous.push(row);
    if (previous.length > 8) previous.shift();
    requestAnimationFrame(frame);
  };
  window.addEventListener('keydown', event => {
    if (!selected && event.key.toLowerCase() === 'g') send('worldMenu', { trusted:event.isTrusted, key:event.key });
  }, true);
  document.addEventListener('click', event => {
    const control = event.target.closest?.('button');
    if (control?.id === 'start-button' && selected) {
      send('startClick', { trusted:event.isTrusted, beforeMode:sample()?.mode });
      // The game's existing frame loop already has its callback queued at the title.
      // Register behind it, then sample each successive render opportunity.
      requestAnimationFrame(frame);
    }
  }, true);
  document.addEventListener('submit', event => {
    if (event.target.id === 'world-form') send('applyWorld', { trusted:event.isTrusted,
      theme:document.querySelector('#world-theme').value, seed:document.querySelector('#world-seed-input').value,
      mode:document.querySelector('#world-mode-select').value });
  }, true);
}

async function calibrate(page, clock) {
  const probes = [];
  for (let i = 0; i < 5; i++) {
    const sendMs = clock();
    const inPage = await page.evaluate(() => ({ originMs:performance.timeOrigin, nowMs:performance.now() }));
    probes.push({ sendMs, receiveMs:clock(), ...inPage });
  }
  const best = probes.reduce((a,b) => b.receiveMs-b.sendMs < a.receiveMs-a.sendMs ? b : a);
  return { best, probes };
}

export async function measureMenus(page, report, clock, focusWindow) {
  page.setDefaultTimeout(15000);
  const events = report.events = [];
  report.pageErrors = [];
  page.on('pageerror', error => report.pageErrors.push(error.message.slice(0, 400)));
  page.on('console', message => {
    const t = message.text();
    if (t.startsWith(tag)) events.push({ hostReceivedMs:clock(), ...JSON.parse(t.slice(tag.length)) });
  });
  await page.addInitScript(installObserver);
  await page.evaluate(installObserver);
  const get = async (event, selected) => {
    const end = clock()+20000;
    while (clock() < end) {
      const row = events.find(e => e.event===event && e.selected===selected);
      if (row) return row;
      await delay(12);
    }
    throw Error('Missing '+event+' in '+(selected?'Kinetic':'initial')+' document');
  };
  const first = await get('titleReady', false);
  assert.equal(new URL(first.href).search, '', 'Normal initial title URL');
  report.clocks = { initial:await calibrate(page,clock) };
  if (focusWindow) report.titleFocus = await focusWindow();
  await page.keyboard.press('g');
  await page.locator('#world-theme').selectOption('kinetic-city');
  await page.locator('#world-mode-select').selectOption('stable');
  await page.locator('#world-seed-input').fill(String(seed));
  await page.locator('#world-form button[type=submit]').click();
  const kineticTitle = await get('titleReady',true);
  const u = new URL(kineticTitle.href);
  assert.deepEqual([...u.searchParams.keys()].sort(), ['gen','seed','theme','world']);
  assert.equal(u.searchParams.get('seed'),String(seed));
  assert.equal(u.searchParams.get('gen'),'4');
  assert.equal(u.searchParams.get('world'),'stable');
  await page.locator('#start-button').click();
  const endpoint = await get('runningCoveredFrame',true);
  report.clocks.kinetic = await calibrate(page,clock);
  const menu=await get('worldMenu',false), submit=await get('applyWorld',false), start=await get('startClick',true);
  assert(menu.trusted && submit.trusted && start.trusted && start.beforeMode==='title');
  assert.deepEqual([submit.theme,submit.seed,submit.mode],['kinetic-city',String(seed),'stable']);
  function map(event) {
    const b=(event.selected ? report.clocks.kinetic : report.clocks.initial).best;
    assert.equal(event.originMs,b.originMs);
    const delta=(event.readyMs ?? event.nowMs) - b.nowMs;
    return { hostMs:(b.sendMs+b.receiveMs)/2+delta, earliestMs:b.sendMs+delta, latestMs:b.receiveMs+delta };
  }
  const t=Object.fromEntries([['initialTitle',first],['worldMenu',menu],['apply',submit],
    ['kineticTitle',kineticTitle],['start',start],['firstRunningCoveredFrame',endpoint]].map(([k,e])=>[k,map(e)]));
  const m=k=>t[k].hostMs;
  const uiMs=m('apply')-m('worldMenu');
  report.timing={monotonicMarks:t, launchToFrameMs:m('firstRunningCoveredFrame'),
    launchToInitialTitleMs:m('initialTitle'), initialTitleToMenuMs:m('worldMenu')-m('initialTitle'),
    menuSelectionMs:uiMs, applyToKineticTitleMs:m('kineticTitle')-m('apply'),
    kineticTitleToStartMs:m('start')-m('kineticTitle'), startToFrameMs:m('firstRunningCoveredFrame')-m('start'),
    directHostObservationUpperBoundMs:endpoint.hostReceivedMs };
  assert(m('initialTitle')>=0 && m('worldMenu')>=m('initialTitle') && uiMs>=0 && m('kineticTitle')>=m('apply')
    && m('start')>=m('kineticTitle') && m('firstRunningCoveredFrame')>=m('start'));
  assert.equal(endpoint.seed,seed); assert.equal(endpoint.worldMode,'stable'); assert.equal(endpoint.generator,4);
  assert.equal(endpoint.fingerprint,603677033);
  assert(endpoint.focus && endpoint.visibility==='visible' && !endpoint.buffering);
  assert.equal(endpoint.adapter.bvhCount,endpoint.streaming.bvhCount);
  assert.equal(endpoint.streaming.bvhCount,endpoint.streaming.activeChunks);
  assert(endpoint.streaming.activeChunks<=41 && endpoint.world.collisionTriangles>0);
  assert(endpoint.ring.length===9 && endpoint.ring.every(c=>c.layout && c.revision===0));
  assert(endpoint.contact?.geometryId && endpoint.contact.triangle>=0 && endpoint.contact.distance<40);
  assert.equal(endpoint.contact.surface,'kinetic-grid-1-r2.334458.spine.0');
  assert.equal(endpoint.companions,3);
  assert.deepEqual(report.pageErrors,[]);
}

export async function identifyRunningBuild(page) {
  const identity = await page.evaluate(async () => {
    const gl=document.querySelector('#game-canvas').getContext('webgl2');
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const meta=JSON.parse(document.querySelector('meta[name=skimmer-flight-build]').content);
    const entry=document.querySelector('script[type=module][src]').src;
    const response=await fetch('./build-info.json');
    return { build:await response.json(), meta, entry, url:location.href, userAgent:navigator.userAgent,
      renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), viewport:[innerWidth,innerHeight],
      drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight], dpr:devicePixelRatio };
  });
  // Read the live main-frame module after the timing endpoint, without another navigation.
  const cdp=await page.context().newCDPSession(page), contexts=[], scripts=[];
  cdp.on('Runtime.executionContextCreated',({context})=>contexts.push(context));
  cdp.on('Debugger.scriptParsed',s=>{ if(s.url===identity.entry && s.isModule) scripts.push(s); });
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Debugger.enable');
    const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame;
    const current=contexts.filter(c=>c.auxData?.isDefault && c.auxData.frameId===frame.id);
    assert.equal(current.length,1);
    const matches=scripts.filter(s=>s.executionContextId===current[0].id);
    assert.equal(matches.length,1);
    const {scriptSource}=await cdp.send('Debugger.getScriptSource',{scriptId:matches[0].scriptId});
    identity.executedEntry={sha256:createHash('sha256').update(scriptSource).digest('hex'),
      bytes:Buffer.byteLength(scriptSource), loader:frame.loaderId, frame:frame.id, script:matches[0].scriptId};
    assert.equal(identity.executedEntry.sha256,identity.meta.binary.sha256);
    assert.equal(identity.executedEntry.bytes,identity.meta.binary.bytes);
    assert.equal(new URL(identity.meta.binary.url,identity.url).href,identity.entry);
    return identity;
  } finally { await cdp.detach(); }
}
