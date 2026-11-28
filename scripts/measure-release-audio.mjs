import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { measuredPeaks } from './qualification/audio-peaks.mjs';

const { positionals: [mode], values } = parseArgs({ allowPositionals: true, options: {
  sha: { type: 'string' }, output: { type: 'string' }, url: { type: 'string' },
  exe: { type: 'string' }, 'exe-sha256': { type: 'string' }, edge: { type: 'string' }, python: { type: 'string', default: 'python' },
  rehearse: { type: 'boolean' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log('node scripts/measure-release-audio.mjs web|desktop|portable-smoke --sha COMMIT --output NEW_DIR (--url URL | --exe FILE --exe-sha256 HASH) [--python FILE] [--edge FILE] [--rehearse]');
  process.exit(0);
}
assert.equal(process.platform, 'win32', 'Windows Core Audio and Known Folders are required');
assert(['web', 'desktop', 'portable-smoke'].includes(mode) && /^[0-9a-f]{40}$/.test(values.sha) && values.output);
const native = mode !== 'web';
const expectedExe = values['exe-sha256']?.toLowerCase();
assert(native ? values.exe && /^[0-9a-f]{64}$/.test(expectedExe) && !values.url : values.url && !values.exe);
assert(!values.rehearse || !native, 'The silent rehearsal uses headless Edge');
const url = !native && new URL(values.url);
if (url) {
  assert(!url.username && !url.password);
  assert(url.protocol === 'https:' || (values.rehearse && url.protocol === 'http:' && url.hostname === '127.0.0.1'),
    'Supply the public HTTPS site or a loopback rehearsal URL');
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helper = name => fileURLToPath(new URL('./qualification/' + name, import.meta.url));
const executable = native && await realpath(values.exe);
if (native) assert.equal(hash(await readFile(executable)), expectedExe, 'Wrong native executable');
const output = path.resolve(values.output);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const parent = await realpath(path.dirname(output));
const scratch = await mkdtemp(path.join(parent, '.skimmer-audio-profile-'));
const profile = path.join(scratch, 'user');
const local = path.join(profile, 'AppData', 'Local'), roaming = path.join(profile, 'AppData', 'Roaming');
const temp = path.join(scratch, 'temp'), webview = path.join(scratch, 'webview');
const env = { ...process.env, USERPROFILE: profile, LOCALAPPDATA: local, APPDATA: roaming, TMP: temp, TEMP: temp,
  WEBVIEW2_USER_DATA_FOLDER: webview, SKIMMER_QA_WEBVIEW_PROFILE: webview, SKIMMER_QA_SHA: values.sha,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-address=127.0.0.1 --remote-debugging-port=0' };
const report = { platform: mode, rehearsal: !!values.rehearse, build: null, endpointVerified: false, issues: [], clips: [] };
report.runnerSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
const levels = path.join(output, 'windows-session-levels.jsonl'), stopMeter = path.join(scratch, 'stop-meter');
let browser, page, app, meter;

async function startClient() {
  let program = executable;
  let args = [];
  if (!native) {
    const systemLocations = [env['ProgramFiles(x86)'], env.ProgramFiles].filter(Boolean)
      .map(root => path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    for (const file of values.edge ? [values.edge] : systemLocations) {
      program = await realpath(file).catch(() => null);
      if (program) break;
    }
    assert(program, 'Supply --edge for a nonstandard Edge installation');
    args = ['--user-data-dir=' + webview, '--no-first-run', '--no-default-browser-check', '--disable-sync',
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'];
    if (values.rehearse) args.push('--headless=new', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
    args.push('about:blank');
  }
  app = spawn(program, args, { env, windowsHide: !!values.rehearse, stdio: 'ignore' });
  await once(app, 'spawn');
  let port;
  for (let attempt = 0; attempt < 300 && !port; attempt++) {
    assert.equal(app.exitCode, null, 'The test client exited during startup');
    for (const name of ['EBWebView/DevToolsActivePort', 'DevToolsActivePort']) {
      const value = await readFile(path.join(webview, name), 'utf8').catch(() => '');
      port = Number(value.split('\n')[0]);
      if (port) break;
    }
    if (!port) await delay(200);
  }
  assert(Number.isInteger(port) && port > 0 && port <= 65535, 'Missing private debugging endpoint');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? await context.waitForEvent('page');
  if (!native) return { pid: app.pid, url };
  await page.waitForURL(/^https?:\/\/tauri\.localhost\//);
  const environment = await page.evaluate(() => window.__TAURI__.core.invoke('desktop_environment'));
  assert.equal(path.resolve(environment.directory).toLowerCase(),
    path.join(local, 'io.github.styayur.skimmer-scraper', 'world-library-v1').toLowerCase());
  report.webview2 = environment.webview2;
  report.executableSha256 = expectedExe;
  return { pid: app.pid, url: new URL('/', page.url()) };
}

async function startMeter(pid) {
  meter = spawn(values.python, ['-B', helper('session-meter.py'), String(pid), levels, stopMeter],
    { env, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
  await once(meter, 'spawn');
  for (let i = 0; i < 100; i++) {
    assert.equal(meter.exitCode, null, 'The Windows session meter exited during startup');
    if ((await readFile(levels, 'utf8').catch(() => '')).includes('\n')) return;
    await delay(100);
  }
  throw Error('The Windows session meter produced no samples');
}

async function finishMeter() {
  await writeFile(stopMeter, '');
  if (meter.exitCode === null) {
    for (let i = 0; i < 50 && meter.exitCode === null; i++) await delay(100);
  }
  assert.equal(meter.exitCode, 0, 'The Windows session meter did not finish normally');
  const raw = await readFile(levels);
  report.meter = { endpoint: 'Windows default multimedia render device', processScope: 'test process and descendants',
    rootPid: app.pid, file: path.basename(levels), sha256: hash(raw),
    samplerSha256: hash(await readFile(helper('session-meter.py'))) };
  report.meter.samples = measuredPeaks(raw, [report.music, ...report.clips]);
}

async function measure() {
  const client = await startClient();
  if (!values.rehearse) await startMeter(client.pid);
  page.on('pageerror', error => report.issues.push(error.message));
  // Observe the game's music element. The analyser samples only its decoded track and emits no audio.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src && new URL(this.src).pathname.includes('/music/')) window.__qaMusic = this;
      return play.apply(this, args);
    };
    document.addEventListener('click', () => {
      window.__qaContext = new AudioContext();
      void window.__qaContext.resume();
    }, { once: true, capture: true });
  });
  client.url.searchParams.set('theme', 'worldforge');
  client.url.searchParams.set('seed', 'amber');
  await page.goto(client.url.href);
  const ready = () => page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 90000 });
  await ready();
  const identity = await page.evaluate(async () => {
    const response = await fetch('./build-info.json', { cache: 'no-store' });
    if (!response.ok) throw Error('Missing observed build information');
    const gl = document.querySelector('#game-canvas').getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { build: await response.json(), native: !!window.__TAURI__, source: document.querySelector('#guide-source-links a')?.href,
      renderer: info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL), url: location.href, userAgent: navigator.userAgent,
      entry: document.querySelector('script[type=module][src]').src };
  });
  report.build = identity.build;
  report.url = identity.url;
  report.userAgent = identity.userAgent;
  report.renderer = identity.renderer;
  assert.equal(identity.native, native);
  assert.equal(identity.build.dirty, false);
  assert.equal(identity.build.sourceCommit, values.sha);
  assert.equal(identity.source, identity.build.sourceUrl);
  assert.equal(identity.source, 'https://github.com/styayur/Skimmer-Scraper/tree/' + values.sha);
  assert.equal(new URL(identity.url).origin, client.url.origin);
  assert.equal(new URL(identity.url).pathname, client.url.pathname);
  const cdp = await page.context().newCDPSession(page);
  const scripts = new Map();
  cdp.on('Debugger.scriptParsed', script => scripts.set(script.url, script.scriptId));
  await cdp.send('Debugger.enable');
  report.executedEntrySha256 = hash((await cdp.send('Debugger.getScriptSource', { scriptId: scripts.get(identity.entry) })).scriptSource);
  await cdp.detach();

  const defaultMusic = () => page.evaluate(() => ({
    preference: localStorage.getItem('skimmer.music.v1'), checked: document.querySelector('#bgm-enabled').checked,
    music: window.__SKIMMER_SCRAPER__.snapshot().music,
  }));
  report.defaultMusic = await defaultMusic();
  assert.equal(report.defaultMusic.preference, null);
  assert(report.defaultMusic.checked && report.defaultMusic.music.enabled);
  await page.locator('#start-button').click();
  await page.waitForFunction(() => {
    const music = window.__SKIMMER_SCRAPER__.snapshot().music;
    return music.enabled && music.playing && music.world === 'forge' && music.mediaTime > 0.4 && music.volume > 0;
  });
  report.music = await page.evaluate(async () => {
    const snapshot = () => window.__SKIMMER_SCRAPER__.snapshot().music;
    const media = window.__qaMusic, context = window.__qaContext;
    const track = new URL(media.currentSrc);
    if (track.origin !== location.origin || !/\/music\/forge-[01]\.opus$/.test(track.pathname)) throw Error('Unexpected BGM source');
    const stream = media.captureStream(), source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
    source.connect(analyser);
    const frame = new Float32Array(analyser.fftSize), start = Date.now(), first = snapshot();
    let pcmPeak = 0;
    try {
      for (let count = 0; count < 28; count++) {
        await new Promise(resolve => setTimeout(resolve, 45));
        analyser.getFloatTimeDomainData(frame);
        for (const value of frame) pcmPeak = Math.max(pcmPeak, Math.abs(value));
      }
    } finally { source.disconnect(); analyser.disconnect(); }
    return { start, end: Date.now(), first, second: snapshot(), track: track.pathname, pcmPeak };
  });
  assert(report.music.pcmPeak > 0.0001 && report.music.second.mediaTime > report.music.first.mediaTime);
  assert.equal((await defaultMusic()).preference, null, 'BGM preference changed during its default test');

  // Return to the unplayed title so flight music and effects cannot satisfy a voice segment.
  await page.reload();
  await ready();
  assert.equal((await defaultMusic()).music.playing, false);
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.voice-settings > summary').click();
  await page.locator('#voice-output').selectOption('local');
  for (const agent of [1, 2, 3]) {
    const voiceId = agent + '-preview';
    await page.locator('#voice-preview-agent').selectOption(String(agent));
    const response = page.waitForResponse(res => {
      const asset = new URL(res.url());
      return asset.origin === client.url.origin && asset.pathname.endsWith('/' + voiceId + '.opus') && res.ok();
    });
    const [, clip] = await Promise.all([page.locator('#voice-preview').click(), response]);
    const playing = await page.waitForFunction(id => {
      const preview = window.__SKIMMER_SCRAPER__.snapshot().voice.preview;
      return preview.phase === 'playing' && preview.speech?.provider === 'local' && preview.speech.voiceId === id && Date.now();
    }, voiceId);
    const start = await playing.jsonValue();
    await playing.dispose();
    await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().voice.preview.phase === 'completed');
    report.clips.push({ agent, voiceId, asset: new URL(clip.url()).pathname, start, end: Date.now() });
    assert.equal((await defaultMusic()).music.playing, false);
    await delay(180);
  }
  if (!values.rehearse) await finishMeter();
  assert.deepEqual(report.issues, []);
  report.endpointVerified = !values.rehearse;
}

try {
  for (const dir of [local, roaming, temp, webview]) await mkdir(dir, { recursive: true });
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper('verify-native-profile.ps1')],
    { env, stdio: 'inherit', windowsHide: true, timeout: 30000 });
  if (mode === 'portable-smoke') {
    execFileSync(process.execPath, [fileURLToPath(new URL('./desktop-smoke.mjs', import.meta.url)), executable, output],
      { env, windowsHide: true, stdio: 'inherit' });
    const smoke = JSON.parse(await readFile(path.join(output, 'desktop-smoke.json'), 'utf8'));
    assert.equal(smoke.executableSha256, expectedExe);
    assert.equal(smoke.runtime.app.sourceCommit, values.sha);
    assert.equal(smoke.runtime.app.dirty, false);
    assert.deepEqual(smoke.errors, []);
  } else {
    await measure();
  }
} catch (error) {
  report.issues.push(error.message);
  report.endpointVerified = false;
  process.exitCode = 1;
} finally {
  if (meter && meter.exitCode === null) meter.kill();
  try {
    if (!native && browser?.isConnected()) {
      const cdp = await browser.newBrowserCDPSession().catch(() => null);
      await cdp?.send('Browser.close').catch(() => {});
    }
    await browser?.close().catch(() => {});
    if (app?.pid && app.exitCode === null) {
      if (native) {
        execFileSync('powershell.exe', ['-NoProfile', '-Command', '$p = Get-Process -Id ' + app.pid +
          ' -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow() }'], { windowsHide: true, stdio: 'ignore' });
      }
      for (let i = 0; i < 100 && app.exitCode === null; i++) await delay(100);
      if (app.exitCode === null) { app.kill(); throw Error('The test client did not close normally'); }
    }
    if (native && app?.pid) assert.equal(app.exitCode, 0, 'Unexpected native client exit code');
    const resolved = await realpath(scratch);
    assert.equal(path.dirname(resolved), parent);
    assert.equal(resolved, scratch);
    await rm(resolved, { recursive: true, maxRetries: 5, retryDelay: 400 });
  } catch (error) {
    report.issues.push(error.message);
    process.exitCode = 1;
  }
  if (report.issues.length) report.endpointVerified = false;
  if (mode !== 'portable-smoke') {
    const name = values.rehearse ? 'rehearsal.json' : 'audio.json';
    await writeFile(path.join(output, name), JSON.stringify(report, null, 2) + '\n');
  }
  if (report.issues.length) console.error(report.issues);
}
