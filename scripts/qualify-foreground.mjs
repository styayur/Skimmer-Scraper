import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { cpuSummary, foregroundFlight, prepareFlight } from './qualification/flight.mjs';
import { captureNativeBoot } from './qualification/native-boot.mjs';

const { values: options } = parseArgs({ options: {
  dist: { type: 'string' }, sha: { type: 'string' }, output: { type: 'string' },
  exe: { type: 'string' }, 'exe-sha256': { type: 'string' }, 'native-build-info': { type: 'string' },
  seconds: { type: 'string', default: '901' }, world: { type: 'string', default: 'city' },
  route: { type: 'string', default: 'reference' }, help: { type: 'boolean' },
} });
if (options.help) {
  console.log('node scripts/qualify-foreground.mjs --dist DIST --sha COMMIT --output NEW_DIRECTORY [--seconds 901] [--world city|kinetic-city] [--route reference|controlled] [--exe PORTABLE --exe-sha256 SHA256 [--native-build-info FILE]]');
  process.exit(0);
}
assert.equal(process.platform, 'win32', 'Windows foreground window ownership is required');
assert(options.dist && options.output && /^[a-f0-9]{40}$/.test(options.sha), 'Specify a dist, full source SHA and new output directory');
assert.equal(!!options.exe, !!options['exe-sha256'], 'Supply the native binary and its trusted SHA-256 together');
const seconds = Number(options.seconds);
assert(Number.isInteger(seconds) && seconds >= 30 && seconds <= 3600);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const dist = await realpath(options.dist);
const output = path.resolve(options.output);
const native = !!options.exe;
assert(['city', 'kinetic-city'].includes(options.world), 'Unknown qualification world');
assert(['reference','controlled'].includes(options.route), 'Unknown flight route');
const controlled = options.route === 'controlled';
assert(!controlled || options.world === 'city', 'Controlled circuits use the original city');
const helpers = fileURLToPath(new URL('./qualification/', import.meta.url));
const powerShell = (name, args = [], env = process.env) => execFileSync('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-File', path.join(helpers, name), ...args],
  { env, windowsHide: true, encoding: 'utf8', timeout: 120000 });
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const build = await readJson(path.join(dist, 'build-info.json'));
assert.equal(build.sourceCommit, options.sha);
assert.equal(build.dirty, false);
assert.equal(build.sourceUrl, 'https://github.com/styayur/Skimmer-Scraper/tree/' + options.sha);
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const entry = /<script\b[^>]*\btype="module"[^>]*\bsrc="\.\/(assets\/[\w.-]+\.js)"/.exec(html)?.[1];
assert(entry && html.includes(build.sourceUrl), 'Missing revision link or built entry module');
const entryHash = hash(await readFile(path.join(dist, entry)));
let executable, binaryHash, expectedBuild = build;
if (native) {
  executable = await realpath(options.exe);
  binaryHash = hash(await readFile(executable));
  assert.equal(binaryHash, options['exe-sha256'].toLowerCase(), 'Native executable digest mismatch');
  expectedBuild = await readJson(options['native-build-info'] ?? path.join(path.dirname(executable), 'build-info.json'));
  for (const key of ['sourceCommit', 'version', 'dirty', 'sourceUrl']) assert.equal(expectedBuild[key], build[key]);
}
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output); // Each attempt owns a new directory, including failed runs.
const scratchBase = await realpath(os.tmpdir());
const scratch = await mkdtemp(path.join(scratchBase, 'skimmer-foreground-'));
const switches = ['--use-angle=d3d11', '--disable-software-rasterizer'];
const size = { width: 1920, height: 1080 };
const errors = [];
let server, app, browser, monitor, monitorLines, page;
const focus = { samples: 0, lost: false };
const hostCpu = [];
const started = new Date().toISOString();

async function startClient() {
  if (!native) {
    server = await preview({ configFile: false, root: dist, build: { outDir: dist },
      preview: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
    browser = await chromium.launch({ channel: 'msedge', headless: false, args: [...switches, '--start-maximized'] });
    const tools = await browser.newBrowserCDPSession();
    const { processInfo } = await tools.send('SystemInfo.getProcessInfo');
    await tools.detach();
    const context = await browser.newContext({ viewport: null, serviceWorkers: 'block' });
    page = await context.newPage();
    const pid = processInfo.find(p => p.type === 'browser').id;
    return { pid, url: new URL('http://127.0.0.1:' + server.httpServer.address().port), profileVerified: true };
  }

  const profile = path.join(scratch, 'user');
  const local = path.join(profile, 'AppData', 'Local');
  const roaming = path.join(profile, 'AppData', 'Roaming');
  const webview = path.join(scratch, 'webview');
  const temp = path.join(scratch, 'temp');
  for (const directory of [local, roaming, webview, temp]) await mkdir(directory, { recursive: true });
  const env = { ...process.env, USERPROFILE: profile, LOCALAPPDATA: local, APPDATA: roaming, TEMP: temp, TMP: temp,
    WEBVIEW2_USER_DATA_FOLDER: webview,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [...switches, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'].join(' ') };
  powerShell('verify-native-profile.ps1', [], env);
  app = spawn(executable, [], { env, stdio: 'ignore' });
  await once(app, 'spawn');
  let port;
  for (let attempt = 0; attempt < 300 && !port; attempt++) {
    assert.equal(app.exitCode, null, 'The QA client exited before WebView2 connected');
    for (const relative of ['EBWebView/DevToolsActivePort', 'DevToolsActivePort']) {
      const file = await readFile(path.join(webview, relative), 'utf8').catch(() => '');
      port = Number(file.split('\n')[0]);
      if (port) break;
    }
    if (!port) await delay(200);
  }
  assert(Number.isInteger(port) && port > 0 && port <= 65535, 'No WebView2 endpoint in the new QA profile');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? await context.waitForEvent('page');
  await page.waitForURL(/^https?:\/\/tauri\.localhost\//);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 90000 });
  const environment = await page.evaluate(() => window.__TAURI__.core.invoke('desktop_environment'));
  const expected = path.join(local, 'io.github.styayur.skimmer-scraper', 'world-library-v1');
  assert.equal(path.resolve(environment.directory).toLowerCase(), expected.toLowerCase(), 'Native library did not resolve inside the fresh QA profile');
  return { pid: app.pid, url: new URL('/', page.url()), profileVerified: true, webview2: environment.webview2 };
}

async function identify(client) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
  const ua = await page.evaluate(() => navigator.userAgent);
  await cdp.send('Network.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en' });
  const url = client.url;
  url.search = '?seed=334458&gen=4';
  if (options.world === 'kinetic-city') url.searchParams.set('theme', options.world);
  let loadedEntry = entry;
  let loadedHash = entryHash;
  page.on('pageerror', error => errors.push(error.name));
  if (native) {
    // Tauri and standalone Vite builds may have different module bytes at the same source commit.
    // Read the asset served by the pinned native executable, then hash the code the new document executes.
    const asset = await page.evaluate(async () => {
      const script = new URL(document.querySelector('script[type="module"][src]').src);
      if (script.origin !== location.origin || !/^\/assets\/index-[\w-]+\.js$/.test(script.pathname)) throw Error('Unexpected embedded entry URL');
      const response = await fetch(script.href, { cache: 'no-store' });
      if (!response.ok) throw Error('Cannot read the embedded entry module');
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { entry: script.pathname.slice(1), digest: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
    });
    loadedEntry = asset.entry;
    loadedHash = asset.digest;
    url.searchParams.set('qaNavigation', randomUUID());
    await captureNativeBoot(page, url, new URL(loadedEntry, url).href, loadedHash);
  } else {
    const entryURL = new URL(entry, url).href;
    const [script] = await Promise.all([
      page.waitForResponse(r => r.url() === entryURL && r.request().resourceType() === 'script' && r.ok()),
      page.goto(url.href, { waitUntil: 'domcontentloaded' }),
    ]);
    assert.equal(hash(await script.body()), entryHash, 'Loaded Web entry differs from the frozen build');
  }
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().ready, null, { timeout: 90000 });
  const identity = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const response = await fetch('./build-info.json', { cache: 'no-store' });
    if (!response.ok) throw Error('Missing running build metadata');
    return { build: await response.json(), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
      userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], language: document.documentElement.lang,
      sourceUrl: document.querySelector('#guide-source-links a')?.href };
  });
  assert.deepEqual(identity.build, expectedBuild);
  assert.equal(identity.sourceUrl, build.sourceUrl);
  assert.match(identity.renderer, /Radeon.*780M/i);
  assert.doesNotMatch(identity.renderer, /swiftshader|llvmpipe|software|warp|basic render/i);
  assert.deepEqual(identity.viewport, [size.width, size.height]);
  assert.equal(identity.dpr, 1);
  return { ...identity, entry: loadedEntry, entrySha256: loadedHash, binarySha256: binaryHash,
    profileVerified: client.profileVerified, webview2: client.webview2 };
}

async function measure(pid) {
  await page.bringToFront();
  await prepareFlight(page, output, options.world);
  const marker = native ? 'Skimmer-Scraper' : 'SkimmerQA-' + randomUUID();
  if (!native) await page.evaluate(value => { document.title = value; }, marker);
  await page.bringToFront();
  monitor = spawn('python', ['-B', '-u', path.join(helpers, 'watch-window.py'), String(pid), marker, ...(controlled ? ['--cpu'] : [])],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = '';
  monitor.stderr.on('data', bytes => { diagnostic = (diagnostic + bytes).slice(-400); });
  monitorLines = createInterface({ input: monitor.stdout });
  monitorLines.on('line', line => {
    if (line === 'owned') focus.samples++;
    if (line.startsWith('cpu ')) hostCpu.push(JSON.parse(line.slice(4)));
  });
  const stopped = once(monitor, 'exit').then(() => { focus.lost = true; throw Error(diagnostic.trim() || 'Windows foreground observer exited'); });
  await Promise.race([once(monitorLines, 'line'), stopped, delay(60000, null, { ref: false }).then(() => { throw Error('Foreground observer did not start'); })]);
  assert(focus.samples && !focus.lost);
  const session = controlled ? await page.context().newCDPSession(page) : undefined;
  try {
    const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
    const before = session && await session.send('Performance.enable', { timeDomain: 'threadTicks' }).then(metrics).catch(() => null);
    const flight = await Promise.race([foregroundFlight(page, seconds, output, options.world, controlled), stopped]);
    assert(monitor.exitCode === null && !focus.lost && focus.samples > 1);
    if (controlled) {
      const after = before && await metrics().catch(() => null);
      const values = {};
      if (after) for (const key of ['ThreadTime','TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration']) {
        if (Number.isFinite(before[key]) && Number.isFinite(after[key]) && after[key]>=before[key]) values[key] = after[key]-before[key];
      }
      flight.rendererThreadCpu = { timeDomain: 'threadTicks', available: Object.keys(values).length>0, seconds: values };
    }
    return { flight, measuredFocus: { ...focus } };
  } finally { await session?.detach().catch(() => {}); }
}

try {
  let idleCpu;
  if (controlled) {
    const { stdout } = await promisify(execFile)('python', ['-B', path.join(helpers, 'host_cpu.py'), '60'],
      { windowsHide: true, timeout: 95000, encoding: 'utf8' });
    const idle = JSON.parse(stdout);
    await save('idle-cpu.json', idle);
    idleCpu = cpuSummary(idle.samples);
    assert.equal(idleCpu.count, 60);
    assert(idleCpu.medianPercent <= 15 && idleCpu.p95Percent <= 25, 'Host exceeded the predeclared idle CPU bounds');
  }
  const client = await startClient();
  const identity = await identify(client);
  await save('identity.json', identity);
  const { flight, measuredFocus } = await measure(client.pid);
  assert.deepEqual(errors, []);
  const { samples, frameIntervalsMs, ...totals } = flight;
  const measuredCpu = controlled ? cpuSummary(hostCpu) : undefined;
  if (controlled) assert(hostCpu.at(-1).elapsedSeconds >= flight.wallMs/1000 - 5, 'Host CPU capture ended before the flight');
  const packed = gzipSync(JSON.stringify({ samples, frameIntervalsMs, hostCpu: controlled ? hostCpu : undefined }));
  await writeFile(path.join(output, 'samples.json.gz'), packed);
  const resources = {};
  for (const name of ['loadedChunks','activeChunks','maxLoadedChunks','bvh','dynamic','collisionTriangles','geometries','textures','renderObjects',
    'residentGeometry','triangles','calls','gpuMs','heap','disposedGeometry','generatedTotal','retiredTotal','rebaseCount',
    'missionRecords','runningMissionTargets','staleMissionTargets','queuedSpeech','playbackEvents']) {
    const values = samples.map(row => row[name]).filter(Number.isFinite);
    if (values.length) resources[name] = { min: Math.min(...values), max: Math.max(...values), last: values.at(-1) };
  }
  const report = { sourceCommit: options.sha, world: options.world, platform: native ? 'windows' : 'web', started, finished: new Date().toISOString(),
    status: 'passed', enduranceQualified: seconds >= 901, identity, focus: measuredFocus, ...totals, resources, idleCpu, measuredCpu, sampleCount: samples.length,
    musicPlayingSamples: samples.filter(row => row.music.playing).length, rawSha256: hash(packed) };
  await save('result.json', report);
  await page.screenshot({ path: path.join(output, 'flight.png'), timeout: 30000 });
  console.log(JSON.stringify({ output, fps: report.meanFps, frameMs: report.frameMs, flightSeconds: report.flightSeconds }));
} catch (error) {
  await save('failure.json', { sourceCommit: options.sha, platform: native ? 'windows' : 'web', started,
    finished: new Date().toISOString(), reason: String(error.message), focus });
  throw error;
} finally {
  monitorLines?.close();
  if (monitor && monitor.exitCode === null) monitor.kill();
  await browser?.close().catch(() => {});
  if (app?.pid && app.exitCode === null) {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${app.pid} -ErrorAction SilentlyContinue).CloseMainWindow()`], { windowsHide: true, stdio: 'ignore' });
    for (let i = 0; i < 50 && app.exitCode === null; i++) await delay(100);
    if (app.exitCode === null) app.kill();
  }
  await server?.close();
  const owned = await realpath(scratch);
  if (path.dirname(owned) === scratchBase && path.basename(owned).startsWith('skimmer-foreground-'))
    await rm(owned, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => {});
}
