import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const key = process.env.DEEPSEEK_API_KEY;
if (process.env.SKIMMER_REAL_VOICE !== '1' || !key) throw new Error('Set SKIMMER_REAL_VOICE=1 and DEEPSEEK_API_KEY to run paid voice tests.');
const physical = process.env.SKIMMER_REAL_MIC === '1';
const wav = process.env.SKIMMER_VOICE_WAV;
if (!physical && !wav) throw new Error('Provide a spoken test fixture in SKIMMER_VOICE_WAV, or explicitly use SKIMMER_REAL_MIC=1.');
const base = process.env.SKIMMER_URL ?? 'http://127.0.0.1:4178/?autostart=1&seed=334458&gen=3';
const output = process.env.SKIMMER_VOICE_EVIDENCE_DIR ?? 'evidence/v0.5/pr8-voice';
const basename = physical ? 'hardware-microphone' : 'deepseek-voice';
const proxy = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--disable-software-rasterizer',
    ...(!physical ? ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve(wav)}%noloop`] : [])],
  ...(proxy ? { proxy: { server: proxy.origin, bypass: '127.0.0.1,localhost',
    ...(proxy.username ? { username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } : {}) } } : {}),
});
const captures = [];
const errors = [];
const observations = { auth: [], captures, errors, physical, build: null };
const endpoints = new Set(['/v1/tools/asr', '/v1/tools/tts', '/chat/completions']);
let stage = 'startup';
let page;
const snapshot = () => page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot());
const compact = (state) => ({ mode: state.mode, position: state.position, elapsed: state.runTime, voice: state.voice,
  model: state.cooperation.model, agents: state.companions.map(agent => ({ id: agent.id, position: agent.position, task: agent.task })) });
const save = (name, data) => {
  const serialized = JSON.stringify(data, null, 2);
  if (serialized.includes(key)) throw new Error('Sensitive evidence refused');
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/${name}.json`, `${serialized}\n`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  if (!physical) await context.grantPermissions(['microphone'], { origin: new URL(base).origin });
  page = await context.newPage();
  page.on('pageerror', () => errors.push('pageerror'));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === 'https://api.deepseek.com' && endpoints.has(url.pathname)) observations.auth.push({ path: url.pathname, status: response.status() });
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === 'https://api.deepseek.com' && endpoints.has(url.pathname)) observations.auth.push({ path: url.pathname, network: request.failure()?.errorText });
  });
  await page.addInitScript(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const open = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__voiceEvidence = { attempts: 0, tracks: [] };
    navigator.mediaDevices.getUserMedia = async (options) => {
      window.__voiceEvidence.attempts++;
      const stream = await open(options);
      window.__voiceEvidence.tracks.push(...stream.getAudioTracks());
      return stream;
    };
    const frames = [];
    const audio = [];
    let previous = 0;
    const frame = (now) => {
      if (previous && frames.length < 18_000) frames.push([now, now - previous]);
      previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer?.sampleRate === 24_000 && this.buffer.duration <= 0.101) {
        const from = performance.now() + Math.max(0, (args[0] ?? 0) - this.context.currentTime) * 1000;
        audio.push([from, from + this.buffer.duration * 1000]);
      }
      return start.apply(this, args);
    };
    Object.assign(window.__voiceEvidence, { frames, audio });
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running', null, { timeout: 90_000 });
  observations.build = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { provenance: await fetch(new URL('./build-info.json', location.href)).then(response => response.json()),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, agent: navigator.userAgent,
      permissionBefore: await navigator.permissions.query({ name: 'microphone' }).then(status => status.state) };
  });
  const restorePose = () => page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__;
    game.pause();
    await game.setPose({ x: 0, y: 340, z: 120 }, { yaw: 0, pitch: 0, roll: 0 });
    game.resume();
    document.title = 'Skimmer-Scraper 实体麦克风验收';
  });
  await restorePose();
  let baseline;
  if (!physical) {
    const from = await page.evaluate(() => performance.now());
    const beginning = await snapshot();
    await page.waitForTimeout(8_100);
    const end = await snapshot();
    const until = await page.evaluate(() => performance.now());
    baseline = { from, until, distanceMeters: Math.abs(end.position.z - beginning.position.z) };
    await restorePose();
  }
  stage = 'configuration';
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.model-settings summary').click();
  await page.locator('#ai-budget').fill('4');
  await page.locator('#ai-timeout').fill('20000');
  await page.locator('#ai-interval').fill('60');
  await page.locator('#ai-key').fill(key);
  await page.locator('#ai-connect').click();
  await page.locator('.voice-settings > summary').click();
  await page.locator('#voice-input').selectOption('deepseek');
  await page.locator('#voice-output').selectOption('deepseek');
  if (!physical) await page.locator('#voice-language').selectOption('en-US');
  await page.locator('#voice-fallback').uncheck();
  await page.locator('#rules-close').click();
  assert.equal(await page.evaluate(() => window.__voiceEvidence.attempts), 0);
  const before = await snapshot();
  captures.push({ stage: 'before', ...compact(before) });
  stage = 'recording';
  if (!physical) await page.keyboard.down('v');
  else console.log(JSON.stringify({ status: 'operator-ready', waitSeconds: 360, permission: observations.build.permissionBefore }));
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().voice.phase === 'recording', null, { timeout: physical ? 360_000 : 15_000 });
  observations.microphone = await page.evaluate(async () => ({
    permission: await navigator.permissions.query({ name: 'microphone' }).then(status => status.state),
    liveTracks: window.__voiceEvidence.tracks.filter(track => track.readyState === 'live').length,
    attempts: window.__voiceEvidence.attempts,
  }));
  assert.equal(observations.microphone.permission, 'granted');
  assert.equal(observations.microphone.liveTracks, 1);
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/${basename}-recording.png`, animations: 'disabled' });
  if (!physical) {
    await page.waitForTimeout(5_100);
    await page.keyboard.up('v');
  }
  stage = 'transcription';
  await page.waitForFunction(() => {
    const state = window.__SKIMMER_SCRAPER__.snapshot().voice;
    return state.commands > 0 || (state.phase === 'idle' && state.lastError);
  }, null, { timeout: 40_000 });
  const transcribed = await snapshot();
  captures.push({ stage, ...compact(transcribed) });
  assert.equal(transcribed.voice.commands, 1);
  assert.equal(await page.evaluate(() => window.__voiceEvidence.tracks.filter(track => track.readyState === 'live').length), 0);
  stage = 'model action';
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().cooperation.trace.some(event => event.event === 'radio-interpretation'), null, { timeout: 32_000 });
  const ordered = await snapshot();
  const interpretation = ordered.cooperation.trace.find(event => event.event === 'radio-interpretation')?.data;
  observations.interpretation = interpretation;
  const dialogue = ordered.cooperation.radio.history.filter(line => line.source === 'player' || line.source === 'model');
  if (!physical) observations.dialogue = dialogue;
  observations.validation = ordered.cooperation.trace.filter(event => event.event === 'decision' &&
    event.data.decision?.requestId === interpretation?.requestId).map(event => ({ provider: event.data.provider, validation: event.data.validation,
      ...(!physical ? { orders: event.data.decision.orders } : {}) }));
  assert.equal(interpretation?.source, 'model');
  assert(interpretation.action?.some(order => order.action === 'SCOUT' && order.targetId === 'route-left' && order.agents.includes(2)));
  const reply = dialogue.filter(line => line.source === 'model' && line.agent === 2).at(-1);
  assert(reply);
  if (!physical) assert(!/[\u3400-\u9fff]/.test(reply.text));
  await page.waitForFunction(request => window.__SKIMMER_SCRAPER__.snapshot().cooperation.trace.some(event => event.event === 'radio-outcome' && event.data.requestId === request),
    interpretation.requestId, { timeout: 15_000 });
  const moved = await snapshot();
  observations.outcome = moved.cooperation.trace.find(event => event.event === 'radio-outcome' && event.data.requestId === interpretation.requestId)?.data;
  assert(observations.outcome.positions.some(agent => agent.id === 2 && agent.task === 'SCOUT' && agent.meters > 5));
  stage = 'speech playback';
  await page.waitForFunction(id => {
    const voice = window.__SKIMMER_SCRAPER__.snapshot().voice;
    return voice.playbackHistory.some(line => line.id === id && line.provider === 'deepseek');
  }, reply.id, { timeout: 32_000 });
  const spoken = await snapshot();
  observations.modelReplyPlayback = spoken.voice.playbackHistory.find(line => line.id === reply.id);
  captures.push({ stage, ...compact(spoken) });
  assert.equal(spoken.mode, 'running');
  assert.equal(errors.length, 0);
  for (const path of endpoints) assert(observations.auth.some(entry => entry.path === path && entry.status === 200));
  if (baseline) {
    const timings = await page.evaluate(({ from, until }) => {
      const { frames, audio } = window.__voiceEvidence;
      const windowed = (segments) => frames.filter(([timestamp]) => segments.some(([start, end]) => timestamp >= start && timestamp < end)).map(([, dt]) => dt);
      return { baseline: windowed([[from, until]]), playback: windowed(audio), pcmScheduled: audio.length };
    }, baseline);
    const stats = (times) => {
      const sorted = [...times].sort((a, b) => a - b);
      const percentile = (p) => sorted[Math.ceil(p * sorted.length) - 1];
      return { frames: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
        fps: 1000 / (times.reduce((sum, elapsed) => sum + elapsed, 0) / times.length) };
    };
    assert(timings.playback.length >= 25 && baseline.distanceMeters > 250);
    observations.flightFrames = { baseline: stats(timings.baseline), playback: stats(timings.playback),
      movementMeters: { baseline: baseline.distanceMeters, duringReply: Math.abs(spoken.position.z - ordered.position.z) },
      pcmScheduled: timings.pcmScheduled };
  }
  stage = 'local fallback after disconnect';
  await page.keyboard.press('f');
  await page.locator('#ai-disconnect').click();
  await page.keyboard.press('t');
  await page.locator('#radio-input').fill('全体集合');
  await page.locator('#radio-input').press('Enter');
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__.snapshot().cooperation.lastPlan?.orders[0]?.action === 'REGROUP');
  const fallback = await snapshot();
  assert.equal(fallback.cooperation.model.connected, false);
  assert.equal(fallback.cooperation.radio.history.filter(line => line.priority === 'reply').at(-1)?.source, 'local');
  observations.disconnect = { connected: fallback.cooperation.model.connected, action: 'REGROUP', source: 'local' };
  save(basename, observations);
  console.log(JSON.stringify({ status: 'passed', physical, responses: observations.auth, outcome: observations.outcome, voice: spoken.voice }));
} catch (error) {
  const failed = page && await snapshot().then(compact).catch(() => null);
  save(`${basename}-incomplete`, { ...observations, stage, failed });
  console.error(JSON.stringify({ status: 'incomplete', physical, stage, errorType: error?.name, failed }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
