import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkGlideBumper(page, output) {
  const url = new URL(page.url());
  url.search = '?seed=334458&gen=2';
  await page.goto(url.href);
  await page.bringToFront();
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().mode === 'running');
  const build = await page.evaluate(async () => (await fetch('./build-info.json')).json());
  if (process.env.SKIMMER_QA_SHA) assert.equal(build.sourceCommit, process.env.SKIMMER_QA_SHA);
  assert.equal(build.dirty, false);
  const report = await page.evaluate(async seconds => {
    const game = window.__SKIMMER_SCRAPER__;
    const events = [];
    const start = performance.now();
    const held = new Map();
    const prompt = document.createElement('div');
    prompt.style.cssText = 'position:fixed;top:12%;left:12%;background:#18222d;color:white;padding:12px;z-index:100;pointer-events:none';
    document.body.append(prompt);
    let participant, previousPhase, edges = 0, attached = false, positioned = false, passed = false;
    try {
      while (performance.now() - start < seconds * 1000) {
        await new Promise(requestAnimationFrame);
        const snapshot = game.snapshot();
        const phase = snapshot.glide.phase;
        for (const pad of navigator.getGamepads()) {
          if (!pad?.connected) continue;
          const buttons = pad.buttons.flatMap((button, index) => button.pressed ? [index] : []);
          const slot = !pad.mapping && /Vendor: 2563 Product: 0526/i.test(pad.id) ? 6 : 4;
          const old = held.get(pad.index) ?? [];
          if (buttons.join() !== old.join()) {
            events.push({ms:performance.now()-start, id:pad.id, slot:pad.index, mapping:pad.mapping, buttons, focused:document.hasFocus()});
          }
          if (document.hasFocus() && buttons.includes(slot) && !old.includes(slot) &&
              (participant === undefined || participant === pad.index)) {
            participant = pad.index;
            edges++;
          }
          held.set(pad.index, buttons);
        }
        if (phase !== previousPhase) {
          events.push({ms:performance.now()-start, phase, mode:snapshot.mode, position:snapshot.position,
            distance:snapshot.surfaceDistance, assisted:snapshot.surfaceGlideAssisted, focused:document.hasFocus()});
          previousPhase = phase;
        }
        if (edges >= 1 && phase === 'ARMED' && !positioned) {
          positioned = true;
          await game.setPose({x:0,y:6,z:0},{yaw:0,pitch:0,roll:0});
        }
        if (edges >= 1 && phase === 'GLIDING') attached = true;
        if (attached && edges >= 2 && phase === 'FLIGHT' && snapshot.surfaceGlideAssisted &&
            events.some(event => event.phase === 'DETACHING')) { passed = true; break; }
        prompt.textContent = attached ? '已贴面滑行。请再按一次 LB 退出。' : '实体手柄验证：请按一下 LB，然后松开。';
      }
      return {passed, events, risingEdges:edges, attached, positioned, native:!!window.__TAURI__};
    } finally { prompt.remove(); }
  }, Number(process.env.SKIMMER_PAD_SECONDS ?? 120));
  await writeFile(path.join(output, 'glide-bumper.json'), JSON.stringify({build, ...report}, null, 2) + '\n');
  assert(report.passed, 'Physical bumper must arm glide, reach a surface and detach in the tested build');
}
