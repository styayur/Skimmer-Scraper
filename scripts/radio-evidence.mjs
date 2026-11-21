import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

if (process.env.SKIMMER_REAL_MODEL !== '1' || !process.env.DEEPSEEK_API_KEY) {
  throw new Error('Set SKIMMER_REAL_MODEL=1 and DEEPSEEK_API_KEY to run paid radio tests.');
}
const key = process.env.DEEPSEEK_API_KEY;
const proxy = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const browser = await chromium.launch({
  channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--disable-software-rasterizer'],
  ...(proxy ? { proxy: {
    server: proxy.origin, bypass: '127.0.0.1,localhost',
    ...(proxy.username ? { username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } : {}),
  } } : {}),
});
const output = 'evidence/v0.5/pr7-radio';
const url = process.env.SKIMMER_URL ?? 'http://127.0.0.1:4175/?autostart=1&seed=334458&gen=3';
const provider = 'https://api.deepseek.com/chat/completions';
const evidence = { kind: 'direct paid browser HTTPS and live game physics', provider, observations: [], runs: [], pageErrors: 0 };
const perceptions = new Map();
let stage = 'startup';
let page;
const save = (name, value) => {
  const json = JSON.stringify(value, null, 2);
  if (json.includes(key)) throw new Error('Sensitive evidence refused');
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/${name}.json`, `${json}\n`);
};
const snap = () => page.evaluate(() => window.__SKIMMER_SCRAPER__.snapshot());
try {
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', () => evidence.pageErrors++);
  page.on('response', response => { if (response.url() === provider) evidence.observations.push({ http: response.status() }); });
  page.on('requestfailed', request => { if (request.url() === provider) evidence.observations.push({ network: request.failure()?.errorText }); });
  page.on('request', request => {
    if (request.url() !== provider || request.method() !== 'POST') return;
    try {
      const { perception } = JSON.parse(request.postDataJSON().messages[1].content);
      if (perception) perceptions.set(perception.requestId, { player: perception.player, trust: perception.trust, targets: perception.targets });
    } catch { /* The acceptance requires a matching perception below. */ }
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__SKIMMER_SCRAPER__?.snapshot().mode === 'running', null, { timeout: 90000 });
  evidence.environment = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const build = await fetch(new URL('./build-info.json', location.href)).then(value => value.json());
    return { build, agent: navigator.userAgent, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null };
  });
  await page.evaluate(async () => {
    const game = window.__SKIMMER_SCRAPER__;
    game.pause();
    await game.setPose({ x: 0, y: 270, z: 120 }, { yaw: 0, pitch: 0, roll: 0 });
    game.resume();
  });
  stage = 'connection';
  await page.keyboard.press('f');
  await page.locator('#advanced-flight-settings > summary').click();
  await page.locator('.model-settings summary').click();
  await page.locator('#ai-model').fill('deepseek-flash');
  await page.locator('#ai-budget').fill('4');
  await page.locator('#ai-timeout').fill('20000');
  await page.locator('#ai-interval').fill('60');
  await page.locator('#ai-key').fill(key);
  await page.locator('#ai-connect').click();
  for (const [message, action, speaker] of [
    ['一号领航', 'LEAD', 1], ['二号去侦察左侧', 'SCOUT', 2], ['全体集合', 'REGROUP', null],
    ['三号，请报告队长的高度和最近可贴近表面距离，按米取整，并报告团队 Trust。', null, 3],
  ]) {
    stage = action ?? 'context question';
    const before = await snap();
    const prior = before.cooperation.trace.filter(event => event.event === 'radio-interpretation').at(-1)?.data.requestId ?? '';
    await page.keyboard.press('t');
    const input = page.locator('#radio-input');
    await input.fill(message);
    await input.press('Enter');
    await page.waitForFunction(previous => {
      const trace = window.__SKIMMER_SCRAPER__.snapshot().cooperation.trace;
      return trace.filter(event => event.event === 'radio-interpretation').at(-1)?.data.requestId > '' &&
        trace.filter(event => event.event === 'radio-interpretation').at(-1)?.data.requestId !== previous;
    }, prior, { timeout: 27000 });
    const reply = await snap();
    const interpretation = reply.cooperation.trace.filter(event => event.event === 'radio-interpretation').at(-1).data;
    const line = reply.cooperation.radio.history.filter(item => item.priority === 'reply' && item.source !== 'player').at(-1);
    const decisions = reply.cooperation.trace.filter(event => event.event === 'decision' && event.data.decision?.requestId === interpretation.requestId);
    const run = { message, before: { position: before.position, trust: before.cooperation.trust.value, agents: before.companions },
      perception: perceptions.get(interpretation.requestId), interpretation, line,
      validation: decisions.map(item => item.data.validation), usage: reply.cooperation.model };
    evidence.runs.push(run);
    if (!run.perception || line?.source !== 'model' || interpretation.source !== 'model' || (speaker && interpretation.agent !== speaker) ||
        (action ? !interpretation.action?.some(order => order.action === action) : interpretation.action !== null)) {
      throw new Error('Radio acceptance mismatch');
    }
    if (!action) {
      const trust = String(Math.round(run.perception.trust * 100));
      if (!line.text.includes(String(run.perception.trust)) && !line.text.includes(`${trust}%`)) throw new Error('Trust answer mismatch');
      const { position, surfaceDistance } = run.perception.player;
      if (!line.text.includes(String(Math.round(position.y))) ||
          !(surfaceDistance === null ? /90\s*米/.test(line.text) : line.text.includes(String(Math.round(surfaceDistance))))) {
        throw new Error('Terrain answer mismatch');
      }
      continue;
    }
    await page.waitForFunction(requestId => window.__SKIMMER_SCRAPER__.snapshot().cooperation.trace.some(event =>
      event.event === 'radio-outcome' && event.data.requestId === requestId), interpretation.requestId, { timeout: 12000 });
    const after = await snap();
    run.outcome = after.cooperation.trace.find(event => event.event === 'radio-outcome' && event.data.requestId === interpretation.requestId).data;
    if (!run.outcome.positions.some(agent => agent.action === action && agent.task === action && agent.meters > 5)) {
      throw new Error('No motion under the requested order');
    }
  }
  if (evidence.pageErrors) throw new Error('Page error during run');
  save('deepseek-flash', evidence);
  await page.screenshot({ path: `${output}/deepseek-flash.png` });
  console.log(JSON.stringify({ result: 'passed', observations: evidence.observations, actions: evidence.runs.map(run => run.interpretation.action) }));
} catch (error) {
  const state = page && await snap().catch(() => null);
  const model = state?.cooperation?.model;
  save('deepseek-flash-incomplete', { ...evidence, stage, model });
  console.error(JSON.stringify({ result: 'incomplete', stage, observations: evidence.observations, errorType: error?.name, model }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
