import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkDesktopCatalog } from './desktop-partner-check.mjs';

const producer = '241bd0eec72439d77a43e8d289cc29c714bf0e4e';
const expected = {
  source: 'https://raw.githubusercontent.com/styayur/V2Wpro/' + producer + '/examples/switchyard.glb',
  bytes: 326792, sha256: '7227e0cfe7d9c4051ea509e298028c7ae7eece2cde0e1d54b324f7f09197a348',
};
const cycles = [{ capture: 8, release: 40 }, { capture: 70, release: 106 }];
const sampleMs = 32;
const endTick = 132;
const save = (output, name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n');

function connectStandardPad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { index: 0, id: 'Hosted standard virtual pad', connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons };
  const state = { buttons, polls: 0 };
  window.qualificationPad = state;
  Object.defineProperty(navigator, 'getGamepads', { value: () => {
    state.polls++;
    return [pad, null, null, null];
  } });
  window.setQualificationBumper = pressed => {
    buttons[4] = { pressed, touched: pressed, value: Number(pressed) };
  };
}

// Collect the bytes the export control hands to the download anchor. The runner
// saves those bytes in its artifact without opening a native Save As dialog.
async function readExport(page, selector) {
  return page.locator(selector).evaluate(async button => {
    const create = URL.createObjectURL;
    const click = HTMLAnchorElement.prototype.click;
    let blob, url, filename;
    URL.createObjectURL = function (value) { blob = value; url = create.call(URL, value); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.href === url && this.download) filename = this.download;
      else click.call(this);
    };
    try { button.click(); } finally {
      URL.createObjectURL = create;
      HTMLAnchorElement.prototype.click = click;
    }
    if (!filename || !blob) throw Error('The export control did not emit a downloadable file');
    return { filename, text: await blob.text() };
  });
}

function sampleFlight() {
  const s = window.__SKIMMER_SCRAPER__.snapshot();
  return { time: s.runTime, phase: s.glide.phase, position: s.position, velocity: s.velocity, speed: s.speed,
    mode: s.mode, surfaceDistance: s.surfaceDistance, impacts: s.shieldImpacts,
    lb: window.qualificationPad.buttons[4].pressed, padPolls: window.qualificationPad.polls };
}

function assess(trace, cycle, nextCapture) {
  const onDeck = trace.slice(cycle.capture + 1, cycle.release + 1).filter(row => row.phase === 'GLIDING');
  const release = trace.slice(cycle.release + 1, nextCapture + 1);
  const detached = release.findIndex(row => row.phase === 'DETACHING');
  const free = release.findIndex((row, i) => i > detached && row.phase === 'FLIGHT');
  let distance = 0;
  for (let i = cycle.capture + 1; i <= cycle.release; i++) {
    const a = trace[i - 1], b = trace[i];
    if (a.phase === 'GLIDING' && b.phase === 'GLIDING') {
      distance += Math.hypot(b.position.x-a.position.x, b.position.y-a.position.y, b.position.z-a.position.z);
    }
  }
  return { ...cycle, beforeCapture: trace[cycle.capture].phase, beforeRelease: trace[cycle.release].phase,
    captureTime: trace[cycle.capture].time, releaseTime: trace[cycle.release].time,
    firstGlideTime: onDeck[0]?.time ?? null, glideMeters: distance,
    detachingTime: release[detached]?.time ?? null, freeFlightTime: release[free]?.time ?? null,
    passed: [cycle.capture, cycle.release].every(tick => !trace[tick].lb && trace[tick+1].lb &&
      !trace[tick+2].lb && trace[tick+1].padPolls > trace[tick].padPolls) &&
      trace[cycle.capture].phase === 'FLIGHT' && trace[cycle.release].phase === 'GLIDING' &&
      onDeck.length >= 5 && distance > 5 && detached >= 0 && detached < 3 && free > detached };
}

async function fly(page, output, name) {
  if (await page.locator('#world-panel').isVisible()) await page.locator('#world-close').click();
  await page.bringToFront();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.evaluate(() => {
    const mark = time => { window.qualificationFrame = time; requestAnimationFrame(mark); };
    requestAnimationFrame(mark);
  });
  await page.clock.runFor(32);
  const offset = await page.evaluate(() => performance.now() - window.qualificationFrame);
  assert(Number.isInteger(offset) && offset >= 0 && offset < 16);
  if (offset) await page.clock.runFor(16-offset);
  assert(await page.evaluate(() => performance.now() === window.qualificationFrame));
  await page.locator('#start-button').focus();
  await page.keyboard.press('Enter');
  await page.evaluate(() => document.activeElement.blur());
  const trace = [await page.evaluate(sampleFlight)];
  const edges = [];
  const presses = cycles.flatMap(cycle => [cycle.capture, cycle.release]);
  for (let tick = 0; tick < endTick; tick++) {
    const pressed = presses.includes(tick);
    if (pressed || presses.includes(tick-1)) {
      await page.evaluate(value => window.setQualificationBumper(value), pressed);
      edges.push({ tick, time: trace[tick].time, button: 4, pressed });
    }
    await page.clock.runFor(sampleMs);
    trace.push(await page.evaluate(sampleFlight));
  }
  const runs = cycles.map((cycle, i) => assess(trace, cycle, cycles[i+1]?.capture ?? endTick));
  const flight = { input: 'standard virtual Gamepad API', fixedHz: 120, sampleMs, launchFrameOffsetMs: 0,
    edges, cycles: runs, trace, passed: runs.every(run => run.passed) &&
      trace.every(row => row.mode === 'running' && row.impacts === 0) };
  await save(output, name+'-lb.json', flight);
  await page.keyboard.press('g');
  await page.clock.resume();
  await page.locator('#world-panel').waitFor();
  const observation = await readExport(page, '#local-world-diagnostic');
  await writeFile(path.join(output, name+'-observation.json'), observation.text);
  return { flight, observation: JSON.parse(observation.text) };
}

export async function checkJointFlight(page, output, runtime) {
  assert.equal(runtime.app.version, '0.11.0');
  assert.equal(runtime.app.dirty, false);
  await page.addInitScript(connectStandardPad);
  await page.clock.install();
  const response = page.waitForResponse(expected.source, { timeout: 90000 });
  const [catalog, asset] = await Promise.all([checkDesktopCatalog(page, output, runtime, expected), response]);
  assert.equal(asset.status(), 200);
  const glb = await asset.body();
  assert.equal(glb.length, expected.bytes);
  assert.equal(createHash('sha256').update(glb).digest('hex'), expected.sha256);
  await writeFile(path.join(output, 'switchyard.glb'), glb);
  const binary = await page.evaluate(async () => {
    const src = document.querySelector('script[type=module][src]').src;
    const bytes = await (await fetch(src)).arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return { url: src, bytes: bytes.byteLength, sha256: Array.from(digest, n => n.toString(16).padStart(2,'0')).join('') };
  });
  const fresh = await fly(page, output, 'fresh');
  const layout = await readExport(page, '#local-world-layout');
  await writeFile(path.join(output, 'layout.txt'), layout.text);
  const seed = layout.text.trim();
  assert.equal(seed, await page.locator('#world-seed-input').inputValue());
  await page.locator('#local-world-keep').click();
  await page.waitForFunction(() => Object.values(sessionStorage).some(value => value.includes('"replay":true')));
  await page.goto(runtime.origin+'/?seed=334458&gen=2');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot().localWorld), null);
  await page.keyboard.press('g');
  await page.locator('#world-seed-input').fill(seed);
  await page.locator('#world-form button[type=submit]').click();
  await page.waitForFunction(() => !!window.__SKIMMER_SCRAPER__.snapshot().localWorld, null, { timeout: 90000 });
  assert.equal(await page.locator('#world-seed-input').inputValue(), seed);
  const reopened = await fly(page, output, 'reopened');
  for (const { observation } of [fresh, reopened]) {
    assert.equal(observation.format, 'flight-diagnostic-2');
    assert.equal(observation.recording.kind, 'player');
    assert.equal(observation.experiment, null);
    assert.equal(observation.build.sourceCommit, runtime.app.sourceCommit);
    assert.equal(observation.sha256, expected.sha256);
    assert.deepEqual(observation.world, { sha256: expected.sha256, bytes: expected.bytes, layoutSeed: seed });
    assert.equal(observation.binary.sha256, binary.sha256);
    assert.equal(observation.binary.bytes, binary.bytes);
    assert.equal(new URL(observation.binary.url, runtime.origin+'/').href, binary.url);
  }
  assert.equal(fresh.observation.replayed, null);
  assert.deepEqual(reopened.observation.replayed, reopened.observation.imported);
  assert.deepEqual(reopened.observation.imported, fresh.observation.imported);
  assert.deepEqual(catalog.requests, [{ method: 'GET', url: expected.source }]);
  assert.deepEqual(catalog.errors, []);
  const receipt = { runtime, producer, source: expected, binary, layoutSeed: seed, identity: reopened.observation.replayed,
    beforeConfirmation: catalog.beforeConfirmation, requests: catalog.requests, input: 'standard virtual Gamepad API',
    reopenedVia: 'Fresh built-in world, saved local library and submitted exact exported layout',
    capture: 'Application layout and observation Blob bytes collected at the download anchor',
    fresh: fresh.flight.cycles, reopened: reopened.flight.cycles, errors: catalog.errors,
    passed: fresh.flight.passed && reopened.flight.passed };
  await save(output, 'joint-flight.json', receipt);
  assert(receipt.passed, 'Expected two actively commanded glide and detach cycles on each opening. See both LB traces.');
  return receipt;
}
