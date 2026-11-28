import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [base, source, output, seedText = '17'] = process.argv.slice(2);
if (!base || !source || !output) throw Error('Pass a production preview URL, its checkout, and a new output directory.');
const seed = Number(seedText);
assert.ok([11, 17].includes(seed), 'Recorded routes use seed 11 (S-curve) or 17 (helix).');
const { chromium } = createRequire(path.resolve(source, 'package.json'))('@playwright/test');
const build = await (await fetch(new URL('build-info.json', base))).json();
assert.equal(build.dirty, false);
assert.equal(build.sourceCommit, execFileSync('git', ['rev-parse', 'HEAD'], {cwd:source, encoding:'utf8'}).trim());
assert.equal(build.version, '0.11.0');

const fps = 20, frames = 140, frameMs = 1000 / fps;
const viewport = {width:1152, height:648};
const input = [
  {frame:0, key:'s', down:true}, {frame:6, key:'s', down:false},
  {frame:25, key:'w', down:true}, {frame:31, key:'w', down:false},
  {frame:47, key:'e', down:true}, {frame:51, key:'e', down:false},
  {frame:76, key:'q', down:true}, {frame:80, key:'q', down:false},
];
const url = new URL(`?theme=kinetic-city&world=stable&gen=4&seed=${seed}`, base);
const directory = await mkdtemp(path.join(tmpdir(), 'skimmer-flight-frames-'));
await mkdir(output);
const video = path.join(output, 'kinetic-free-flight.mp4');
const browser = await chromium.launch({headless:true, args:[
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio',
]});
try {
  const page = await browser.newPage({viewport, deviceScaleFactor:1, locale:'en-US'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(url.href);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, {timeout:90000});
  const environment = await page.evaluate(() => {
    const gl = document.querySelector('#game-canvas').getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl.getParameter(info.UNMASKED_RENDERER_WEBGL), userAgent:navigator.userAgent};
  });
  assert.match(environment.renderer, /swiftshader/i);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.locator('#start-button').focus();
  await page.keyboard.press('Enter');
  const snapshot = () => page.evaluate(() => {
    const s = window.__SKIMMER_SCRAPER__.snapshot();
    const cell = `${Math.floor(s.position.x/220)}:${Math.floor(s.position.z/220)}`;
    return {time:s.runTime, position:s.position, camera:s.cameraMode, mode:s.mode, rules:s.rules,
      seed:s.seed, cell, layout:s.chunkStates.find(c => c.key === cell)?.layout, shieldImpacts:s.shieldImpacts,
      buffered:s.buffering, glide:s.glide.phase, wingmates:s.companions.length, debugInput:s.debugInput};
  });
  for (let i = 0; i < 150 && (await snapshot()).mode !== 'running'; i++) await page.clock.runFor(32);
  assert.equal((await snapshot()).mode, 'running');
  await page.clock.runFor(350);
  const client = await page.context().newCDPSession(page);
  const samples = [];
  for (let frame = 0; frame < frames; frame++) {
    for (const event of input.filter(e => e.frame === frame)) {
      if (event.down) await page.keyboard.down(event.key);
      else await page.keyboard.up(event.key);
    }
    await page.clock.runFor(frameMs);
    const {data} = await client.send('Page.captureScreenshot', {format:'jpeg', quality:88, fromSurface:true});
    await writeFile(path.join(directory, `${String(frame).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64'));
    if (frame % 20 === 0 || frame === frames - 1) samples.push({frame, ...await snapshot()});
  }
  execFileSync(process.env.FFMPEG || 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(directory, '%04d.jpg'),
    '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-n', video,
  ]);
  const clip = await readFile(video);
  const report = {build, environment, world:url.search, viewport, fps, frames, seconds:frames/fps, byteLength:clip.length,
    sha256:createHash('sha256').update(clip).digest('hex'), codec:'H.264, yuv420p, MP4, silent',
    method:'Headless Chromium WebGL2 on SwiftShader. The normal Start button enters Free Flight from the built-in spawn. Keyboard events drive the aircraft. Playwright advances the browser clock by 50 ms per captured gameplay frame. The debug bridge is read only. This visual recording measures no hardware performance.',
    input, samples, errors};
  await writeFile(path.join(output, 'kinetic-free-flight.json'), JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify({seed, samples, bytes:clip.length}));
  assert.deepEqual(errors, []);
  assert.ok(samples.every(s => s.mode === 'running' && !s.debugInput && s.seed === seed && s.shieldImpacts === 0));
  assert.ok(samples.some(s => s.layout === 'junction'));
  assert.ok(samples.some(s => s.layout === (seed === 17 ? 'helix' : 's-curve')));
  assert.ok(samples[0].position.z - samples.at(-1).position.z > 320);
} finally {
  await browser.close();
}
