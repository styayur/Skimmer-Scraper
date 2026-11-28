import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Attach to the existing app page. Bind the executed entry to its current main-frame
// default world, and release all instrumentation before any gameplay or sampling.
export async function captureNativeBoot(page, target, entryURL, expectedHash) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = new Map(), scripts = [], responses = [];
  cdp.on('Runtime.executionContextCreated', ({context}) => contexts.set(context.id,context));
  cdp.on('Runtime.executionContextDestroyed', ({executionContextId}) => contexts.delete(executionContextId));
  cdp.on('Runtime.executionContextsCleared', () => contexts.clear());
  cdp.on('Debugger.scriptParsed', script => { if(script.url===entryURL) scripts.push(script); });
  cdp.on('Network.responseReceived', ({type,frameId,loaderId,response}) => {
    if(type==='Document' && response.url===target.href)
      responses.push({frameId,loaderId,status:response.status});
  });
  try {
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Debugger.enable');
    const frame = async () => (await cdp.send('Page.getFrameTree')).frameTree.frame;
    const prior = await frame();
    scripts.length=0;
    await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:60000});
    if ((await frame()).loaderId===prior.loaderId)
      await page.reload({waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready,null,{timeout:90000});
    const current=await frame();
    assert(current.loaderId!==prior.loaderId && current.url===target.href,'Expected the requested fresh native document');
    const [ctx,...others]=[...contexts.values()].filter(c=>c.auxData?.isDefault && c.auxData.frameId===current.id);
    assert(ctx && !others.length,'Expected one live default context on the native main frame');
    const matches=scripts.filter(s=>s.executionContextId===ctx.id && s.isModule);
    assert.equal(matches.length,1,'Expected the entry module in the live default context');
    const {scriptSource}=await cdp.send('Debugger.getScriptSource',{scriptId:matches[0].scriptId});
    const entrySha256=createHash('sha256').update(scriptSource,'utf8').digest('hex');
    assert.equal(entrySha256,expectedHash,'Executed native module differs from frozen distribution');
    const {result,exceptionDetails}=await cdp.send('Runtime.evaluate',{
      uniqueContextId:ctx.uniqueId, returnByValue:true,
      expression:"({url:location.href,origin:location.origin,entry:document.querySelector('script[type=module][src]')?.src,ready:window.__SKIMMER_SCRAPER__?.snapshot().ready,visible:document.visibilityState==='visible' && !!document.querySelector('#start-button')?.getClientRects().length})"
    });
    assert(!exceptionDetails);
    assert.deepEqual(result.value,{url:target.href,origin:target.origin,entry:entryURL,ready:true,visible:true});
    const document=responses.find(r=>r.frameId===current.id && r.loaderId===current.loaderId);
    if(document)assert.equal(document.status,200);
    return {entrySha256,expectedEntrySha256:expectedHash,identityMethod:'CDP Debugger.getScriptSource, UTF-8 SHA-256 of executed main-frame ES module',
      entry:entryURL,documentUrl:current.url,documentStatus:document?.status??null,
      frameId:current.id,loaderId:current.loaderId,contextUniqueId:ctx.uniqueId,scriptId:matches[0].scriptId,
      visibleStartControl:true};
  } finally {
    try {await cdp.send('Debugger.disable');} finally {await cdp.detach();}
  }
}
