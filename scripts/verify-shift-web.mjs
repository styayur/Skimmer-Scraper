// Run against the extracted release ZIP on a subpath, or the deployed Pages site.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [address, sha, output, mode='standalone'] = process.argv.slice(2);
const base = new URL(address);
assert(['http:', 'https:'].includes(base.protocol) && /^[a-f0-9]{40}$/.test(sha));
assert(['standalone', 'embed'].includes(mode));
await mkdir(output, {recursive:true});
const embedding = mode === 'embed';
const parent = createServer((_request, response) => {
  response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
  response.end('<!doctype html><title>Embedded game qualification</title><body style="margin:0"><iframe title="Game" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen; gamepad; autoplay" style="width:100vw;height:100vh;border:0"></iframe><script>document.querySelector("iframe").src=' + JSON.stringify(base.href).replaceAll('<','\\u003c') + ';</script>');
});
if (embedding) await new Promise(resolve => parent.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({channel:'msedge',headless:false,args:['--use-angle=d3d11','--disable-software-rasterizer']});
try {
  for (const locale of ['zh-CN','en-US']) {
    const context = await browser.newContext({locale,viewport:{width:1280,height:720}});
    const page = await context.newPage();
    const errors=[], failed=[], remote=[];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
    page.on('response', r => { if (r.status()>=400) failed.push([r.status(),r.url()]); });
    page.on('request', r => {
      const u = new URL(r.url());
      if (['https:','http:'].includes(u.protocol) && u.origin!==base.origin &&
          !(embedding && u.origin===parentOrigin)) remote.push(u.href);
    });
    const parentOrigin = embedding ? 'http://127.0.0.1:'+parent.address().port : null;
    await page.goto(parentOrigin ?? base.href);
    const frame = embedding ? page.frameLocator('iframe') : page;
    const start = frame.locator('#start-button');
    await start.waitFor();
    const doc = await (await start.elementHandle()).ownerFrame();
    await doc.waitForFunction(()=>window.__SKIMMER_SCRAPER__?.snapshot().ready);
    const identity = await doc.evaluate(async()=>{
      const gl=document.querySelector('canvas').getContext('webgl2');
      return {lang:document.documentElement.lang,build:await(await fetch('./build-info.json')).json(),
        gpu:gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)};
    });
    assert.equal(identity.build.sourceCommit,sha);
    assert.equal(identity.build.version,'0.9.1');
    assert.equal(identity.lang.slice(0,2),locale.slice(0,2));
    const visibleTitle=await frame.locator('#title-screen').innerText();
    if(locale==='en-US')assert(!/\p{Script=Han}/u.test(visibleTitle),'Chinese text on English title');
    await page.screenshot({path:path.join(output,locale+'-title.png')});
    await frame.locator('#title-screen [data-action=help]').click();
    const tutorial=await frame.locator('#guide-content').innerText();
    if(locale==='en-US')assert(!/\p{Script=Han}/u.test(tutorial),'Chinese text in English tutorial');
    assert(tutorial.length>1000);
    await frame.locator('#help-close').click();
    await start.click();
    await doc.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().runTime>4);
    const flight=await doc.evaluate(()=>{const s=window.__SKIMMER_SCRAPER__.snapshot();return {mode:s.mode,runTime:s.runTime,triangles:s.render.triangles,companions:s.companions.filter(a=>a.deployed).length};});
    assert.equal(flight.mode,'running');assert.equal(flight.companions,3);assert(flight.triangles>0);
    await page.screenshot({path:path.join(output,locale+'-flight.png')});
    const report={mode,locale,identity,visibleTitle,tutorialCharacters:tutorial.length,flight,errors,failed,remote};
    await writeFile(path.join(output,locale+'.json'),JSON.stringify(report,null,2));
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(remote,[]);
    await context.close();
  }
} finally {
  await browser.close();
  if (embedding) await new Promise(resolve=>parent.close(resolve));
}
